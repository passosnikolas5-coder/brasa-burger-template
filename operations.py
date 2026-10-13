"""Delivery, operation controls, moderated reviews and anonymous measurements.

State lives in the same private SQLite database as orders. This module never
fetches an external postcode service or seeds reviews, customers or purchases.
"""
from __future__ import annotations

import base64
import binascii
from collections import Counter
from datetime import datetime, timezone
import json
import re
import struct
import uuid


class OperationError(ValueError):
    pass


def text(value, name, maximum=600, minimum=0):
    if not isinstance(value, str):
        raise OperationError(f'Informe {name}.')
    value = value.strip()
    if not minimum <= len(value) <= maximum or any(ord(c) < 32 and c not in '\n\t' for c in value):
        raise OperationError(f'{name.capitalize()} inválido.')
    return value


def number(value, name, minimum, maximum):
    if type(value) is not int or not minimum <= value <= maximum:
        raise OperationError(f'{name.capitalize()} inválido.')
    return value


def time_now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def phone_key(phone):
    """Equivalent Brazilian numbers share purchases, including +55 variants."""
    digits = re.sub(r'\D', '', phone)
    return digits[2:] if len(digits) in (12, 13) and digits.startswith('55') else digits


def webp_dimensions(raw):
    if len(raw) < 30 or raw[:4] != b'RIFF' or raw[8:12] != b'WEBP' or int.from_bytes(raw[4:8], 'little') + 8 != len(raw):
        raise OperationError('Envie uma imagem WebP válida.')
    pos = 12
    while pos + 8 <= len(raw):
        chunk, length = raw[pos:pos + 4], int.from_bytes(raw[pos + 4:pos + 8], 'little')
        payload = raw[pos + 8:pos + 8 + length]
        if len(payload) != length:
            break
        if chunk == b'VP8X' and length >= 10:
            # Animated files would misrepresent the product and require a decoder.
            if payload[0] & 2:
                raise OperationError('Use uma fotografia WebP estática.')
            return 1 + int.from_bytes(payload[4:7], 'little'), 1 + int.from_bytes(payload[7:10], 'little')
        if chunk == b'VP8 ' and length >= 10 and payload[3:6] == b'\x9d\x01\x2a':
            return int.from_bytes(payload[6:8], 'little') & 0x3fff, int.from_bytes(payload[8:10], 'little') & 0x3fff
        if chunk == b'VP8L' and length >= 5 and payload[0] == 0x2f:
            bits = int.from_bytes(payload[1:5], 'little')
            return (bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1
        pos += 8 + length + (length & 1)
    raise OperationError('Não foi possível reconhecer a fotografia WebP.')


def valid_mp4(raw):
    """Require a complete MP4 container; URLs, scripts and arbitrary paths fail."""
    pos, boxes = 0, set()
    while pos + 8 <= len(raw):
        length, kind = struct.unpack('>I4s', raw[pos:pos + 8])
        header = 8
        if length == 1:
            if pos + 16 > len(raw):
                return False
            length = struct.unpack('>Q', raw[pos + 8:pos + 16])[0]
            header = 16
        elif length == 0:
            length = len(raw) - pos
        if length < header or pos + length > len(raw):
            return False
        if pos == 0 and kind != b'ftyp':
            return False
        boxes.add(kind)
        pos += length
    return pos == len(raw) and {b'ftyp', b'moov', b'mdat'} <= boxes


class Operations:
    def __init__(self, store):
        self.store = store
        with store.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS shop_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, order_id TEXT UNIQUE NOT NULL, published INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, data TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS events (event_id TEXT PRIMARY KEY, kind TEXT NOT NULL, product_id TEXT, created_at TEXT NOT NULL)')
            db.execute('CREATE INDEX IF NOT EXISTS events_created ON events(created_at)')
            db.execute('CREATE TABLE IF NOT EXISTS loyalty_redemptions (order_id TEXT PRIMARY KEY, phone TEXT NOT NULL, source_order_id TEXT NOT NULL, reward_cents INTEGER NOT NULL, created_at TEXT NOT NULL)')

    def settings(self, db=None):
        if db is None:
            with self.store.connect() as connection:
                return self.settings(connection)
        rows = db.execute('SELECT key,value FROM shop_settings').fetchall()
        values = {row['key']: json.loads(row['value']) for row in rows}
        return {'acceptingOrders': values.get('acceptingOrders', True), 'pausedProductIds': values.get('pausedProductIds', []), 'extraMinutes': values.get('extraMinutes', 0)}

    def media(self):
        with self.store.connect() as db:
            rows = db.execute("SELECT key,value FROM shop_settings WHERE key LIKE 'media:%'").fetchall()
        result = {'productImages': {}, 'kitchenVideo': None}
        for row in rows:
            value = json.loads(row['value'])
            if row['key'] == 'media:kitchen':
                result['kitchenVideo'] = value['src']
            else:
                result['productImages'][row['key'].split(':', 1)[1]] = value
        return result

    def loyalty_rules(self):
        data, _, _ = self.store.catalogue()
        rules = data['store'].get('loyalty', {})
        return {'ordersForReward': number(rules.get('ordersForReward', 5), 'compras para recompensa', 1, 100), 'rewardCents': number(rules.get('rewardCents', 1290), 'recompensa', 1, 100000)}

    def shop(self):
        return {'demo': self.store.demo, 'operations': self.settings(), 'media': self.media(), 'payments': self.store.payments.public_config(), 'loyalty': self.loyalty_rules()}

    def patch(self, payload):
        fields = {'acceptingOrders', 'pausedProductIds', 'extraMinutes'}
        if not isinstance(payload, dict) or not payload or set(payload) - fields:
            raise OperationError('Envie apenas os controles de operação da loja.')
        _, products, _ = self.store.catalogue()
        changes = {}
        if 'acceptingOrders' in payload:
            if type(payload['acceptingOrders']) is not bool:
                raise OperationError('A abertura de pedidos precisa ser verdadeira ou falsa.')
            changes['acceptingOrders'] = payload['acceptingOrders']
        if 'extraMinutes' in payload:
            changes['extraMinutes'] = number(payload['extraMinutes'], 'minutos adicionais', 0, 120)
        if 'pausedProductIds' in payload:
            ids = payload['pausedProductIds']
            if not isinstance(ids, list) or len(ids) > len(products) or not all(isinstance(value, str) and value in products for value in ids) or len(set(ids)) != len(ids):
                raise OperationError('A lista de produtos pausados é inválida.')
            changes['pausedProductIds'] = ids
        with self.store.lock, self.store.connect() as db:
            db.executemany('INSERT INTO shop_settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [(field, json.dumps(value, ensure_ascii=False)) for field, value in changes.items()])
        return self.shop()

    def estimate(self, estimate, extra=None):
        extra = self.settings()['extraMinutes'] if extra is None else extra
        match = re.fullmatch(r'(\d+)\s*[–-]\s*(\d+)\s*min', estimate or '')
        if match:
            return f'{int(match[1]) + extra}–{int(match[2]) + extra} min'
        return f'{estimate} (+{extra} min)' if extra else estimate

    def quote(self, raw_cep):
        cep = re.sub(r'[- .]', '', text(raw_cep, 'CEP', 12, 8))
        if not re.fullmatch(r'\d{8}', cep):
            raise OperationError('Informe um CEP com 8 dígitos.')
        data, _, _ = self.store.catalogue()
        rules = data['store']['delivery']
        zone = next((zone for zone in rules.get('zones', []) if zone['cepStart'] <= cep <= zone['cepEnd']), None)
        public_zone = dict(zone, estimate=self.estimate(zone['estimate']), minSubtotalCents=rules['minSubtotalCents']) if zone else None
        if public_zone:
            public_zone.pop('cepStart', None)
            public_zone.pop('cepEnd', None)
        return {'demo': self.store.demo, 'served': zone is not None, 'cep': cep, 'zone': public_zone}

    def reviews(self, admin=False):
        with self.store.connect() as db:
            rows = db.execute('SELECT * FROM reviews' + ('' if admin else ' WHERE published=1') + ' ORDER BY created_at DESC,id DESC LIMIT 100').fetchall()
            count = db.execute('SELECT count(*) FROM reviews' + ('' if admin else ' WHERE published=1')).fetchone()[0]
        values = []
        for row in rows:
            review = json.loads(row['data'])
            if admin:
                review.update(orderId=row['order_id'], published=bool(row['published']))
            values.append(review)
        return {'demo': self.store.demo, 'reviews': values, 'count': count}

    def add_review(self, order_id, token, payload):
        if not isinstance(payload, dict) or set(payload) - {'rating', 'flavor', 'packaging', 'service', 'comment'}:
            raise OperationError('Avaliação inválida.')
        ratings = {key: number(payload.get(key), key, 1, 5) for key in ('rating', 'flavor', 'packaging', 'service')}
        comment = text(payload.get('comment', ''), 'comentário', 500)
        with self.store.lock, self.store.connect() as db:
            row = db.execute('SELECT * FROM orders WHERE id=?', (order_id,)).fetchone()
            if not row or not token or not self.store.valid_token(row['token'], token):
                return None
            order = json.loads(row['data'])
            if order['status'] != 'completed':
                raise OperationError('Você pode avaliar após a conclusão do pedido.')
            if db.execute('SELECT id FROM reviews WHERE order_id=?', (order_id,)).fetchone():
                raise OperationError('Este pedido já recebeu uma avaliação.')
            review = dict(ratings, id=str(uuid.uuid4()), displayName=order['customer']['name'].split()[0][:40], comment=comment, createdAt=time_now())
            db.execute('INSERT INTO reviews VALUES (?,?,?,?,?)', (review['id'], order_id, 0, review['createdAt'], json.dumps(review, ensure_ascii=False)))
        return dict(review, published=False)

    def moderate_review(self, review_id, payload):
        if not isinstance(payload, dict) or set(payload) != {'published'} or type(payload.get('published')) is not bool:
            raise OperationError('Informe se a avaliação deve ser publicada.')
        with self.store.lock, self.store.connect() as db:
            row = db.execute('SELECT * FROM reviews WHERE id=?', (review_id,)).fetchone()
            if not row:
                return None
            db.execute('UPDATE reviews SET published=? WHERE id=?', (int(payload['published']), review_id))
            return dict(json.loads(row['data']), orderId=row['order_id'], published=payload['published'])

    def loyalty(self, order_id, token, db=None):
        if db is None:
            with self.store.connect() as connection:
                return self.loyalty(order_id, token, connection)
        row = db.execute('SELECT * FROM orders WHERE id=?', (order_id,)).fetchone()
        if not row or not token or not self.store.valid_token(row['token'], token):
            return None
        customer_phone = phone_key(json.loads(row['data'])['customer']['phone'])
        completed = sum(phone_key(json.loads(item['data'])['customer']['phone']) == customer_phone for item in db.execute("SELECT data FROM orders WHERE status='completed'"))
        redeemed = db.execute("SELECT count(*) FROM loyalty_redemptions r JOIN orders o ON o.id=r.order_id WHERE r.phone=? AND o.status!='cancelled'", (customer_phone,)).fetchone()[0]
        rules = self.loyalty_rules()
        earned = completed // rules['ordersForReward']
        return dict(rules, completedOrders=completed, availableRewards=max(0, earned - redeemed), redeemedRewards=redeemed, progress=completed % rules['ordersForReward'], demo=self.store.demo)

    def event(self, payload):
        if not isinstance(payload, dict) or set(payload) - {'eventId', 'kind', 'productId'}:
            raise OperationError('Evento inválido. Envie apenas identificador, etapa e produto opcional.')
        event_id = payload.get('eventId')
        try:
            if not isinstance(event_id, str) or str(uuid.UUID(event_id)) != event_id.lower():
                raise ValueError()
        except ValueError:
            raise OperationError('Identificador do evento inválido.')
        kind = payload.get('kind')
        if kind not in ('visit', 'cart', 'checkout'):
            raise OperationError('Etapa de evento inválida.')
        product_id = payload.get('productId')
        _, products, _ = self.store.catalogue()
        if product_id is not None and (not isinstance(product_id, str) or product_id not in products):
            raise OperationError('Produto do evento inválido.')
        with self.store.lock, self.store.connect() as db:
            existing = db.execute('SELECT kind,product_id FROM events WHERE event_id=?', (event_id.lower(),)).fetchone()
            if existing and (existing['kind'] != kind or existing['product_id'] != product_id):
                raise OperationError('Este identificador já foi usado para outro evento.')
            if not existing:
                db.execute('INSERT INTO events VALUES (?,?,?,?)', (event_id.lower(), kind, product_id, time_now()))
        return {'accepted': True, 'created': not bool(existing)}

    def metrics(self):
        with self.store.connect() as db:
            kinds = {row['kind']: row['n'] for row in db.execute('SELECT kind,count(*) n FROM events GROUP BY kind')}
            rows = db.execute('SELECT status,data FROM orders').fetchall()
        completed = [json.loads(row['data']) for row in rows if row['status'] == 'completed']
        popular = Counter()
        for order in completed:
            for item in order['items']:
                popular[item['productId']] += item['quantity']
                if item.get('bundle'):
                    popular[item['bundle']['side']['id']] += item['quantity']
                    popular[item['bundle']['drink']['id']] += item['quantity']
        _, products, _ = self.store.catalogue()
        visits, carts, checkouts = (kinds.get(kind, 0) for kind in ('visit', 'cart', 'checkout'))
        return {'demo': self.store.demo, 'scope': 'Todas as ações registradas neste servidor; eventos não identificam visitantes únicos.', 'events': {'visit': visits, 'cart': carts, 'checkout': checkouts}, 'orders': {'total': len(rows), 'completed': len(completed), 'cancelled': sum(row['status'] == 'cancelled' for row in rows)}, 'completedSalesCents': sum(order['totals']['totalCents'] for order in completed), 'ratios': {'cartPerVisit': carts / visits if visits else None, 'checkoutPerCart': checkouts / carts if carts else None}, 'popularProducts': [{'productId': product_id, 'name': products.get(product_id, {}).get('name', product_id), 'quantity': quantity} for product_id, quantity in popular.most_common(10)]}

    def upload(self, payload):
        if not isinstance(payload, dict) or set(payload) - {'productId', 'kind', 'mime', 'data', 'width', 'height'}:
            raise OperationError('Envio de mídia inválido.')
        kind, mime, encoded = payload.get('kind'), payload.get('mime'), payload.get('data')
        if (kind, mime) not in (('product', 'image/webp'), ('kitchen', 'video/mp4')) or not isinstance(encoded, str):
            raise OperationError('Envie uma fotografia WebP ou um vídeo MP4 da cozinha.')
        maximum = 6 * 1024 * 1024 if kind == 'product' else 24 * 1024 * 1024
        if len(encoded) > (maximum + 2) // 3 * 4:
            raise OperationError('Mídia acima do limite: foto 6 MB; vídeo 24 MB.')
        try:
            raw = base64.b64decode(encoded, validate=True)
        except (ValueError, binascii.Error):
            raise OperationError('Mídia base64 inválida.')
        if not raw or len(raw) > maximum:
            raise OperationError('Mídia vazia ou acima do limite.')
        _, products, _ = self.store.catalogue()
        if kind == 'product':
            product_id = payload.get('productId')
            if not isinstance(product_id, str) or product_id not in products:
                raise OperationError('Escolha um produto do cardápio.')
            width, height = webp_dimensions(raw)
            if not 1 <= width <= 1254 or not 1 <= height <= 1254 or (payload.get('width') is not None and payload['width'] != width) or (payload.get('height') is not None and payload['height'] != height):
                raise OperationError('A fotografia precisa ter até 1.254 pixels e dimensões corretas.')
            filename, setting = uuid.uuid4().hex + '.webp', 'media:' + product_id
            value = {'src': 'assets/uploads/' + filename, 'width': width, 'height': height}
        else:
            if payload.get('productId') or not valid_mp4(raw):
                raise OperationError('Envie um vídeo MP4 válido da cozinha, sem produto associado.')
            filename, setting = uuid.uuid4().hex + '.mp4', 'media:kitchen'
            value = {'src': 'assets/uploads/' + filename}
        directory = (self.store.public_root / 'assets' / 'uploads').resolve()
        if self.store.public_root not in directory.parents:
            raise OperationError('Pasta de mídia inválida.')
        with self.store.lock:
            directory.mkdir(parents=True, exist_ok=True)
            destination = directory / filename
            with destination.open('xb') as handle:
                handle.write(raw)
            try:
                with self.store.connect() as db:
                    db.execute('INSERT INTO shop_settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', (setting, json.dumps(value)))
            except Exception:
                destination.unlink(missing_ok=True)
                raise
        return {'kind': kind, 'productId': payload.get('productId'), 'media': value}
