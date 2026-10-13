#!/usr/bin/env python3
"""Loja demonstrativa local: arquivos estáticos e pedidos persistidos em SQLite.

Execute: python server.py --port 4187
BRASA_STATE_DIR / --state-dir: dados fora da pasta pública.
BRASA_ADMIN_KEY: chave existente opcional; na ausência, admin-key.txt é criado.
BRASA_PUBLIC_ORIGIN: origem HTTPS autorizada ao hospedar o backend publicamente.
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import mimetypes
import os
from pathlib import Path
import re
import secrets
import sqlite3
import threading
from datetime import datetime, timezone, timedelta
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit, parse_qs
import uuid

from operations import Operations, OperationError, phone_key
from payments import PaymentService, PaymentError

MAX_BODY = 64 * 1024
MAX_MEDIA_BODY = 34 * 1024 * 1024
STATUSES = ('awaiting_payment', 'awaiting_confirmation', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled')
PUBLIC_TYPES = {'.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.svg', '.webp', '.ico', '.mp4', '.vtt', '.json', '.md'}
BRAZIL = timezone(timedelta(hours=-3))


class InvalidOrder(Exception):
    pass


def clean_text(value, name, maximum=180, minimum=0):
    if not isinstance(value, str):
        raise InvalidOrder(f'Informe {name}.')
    value = value.strip()
    if len(value) < minimum or len(value) > maximum or any(ord(c) < 32 and c not in '\n\t' for c in value):
        raise InvalidOrder(f'{name.capitalize()} deve ter entre {minimum} e {maximum} caracteres.')
    return value


def integer(value, name, minimum, maximum):
    if type(value) is not int or not minimum <= value <= maximum:
        raise InvalidOrder(f'{name.capitalize()} inválido.')
    return value


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def same_secret(left, right):
    return hmac.compare_digest(left.encode('utf-8'), right.encode('utf-8'))


class Store:
    def __init__(self, public_root: Path, state_dir: Path, admin_key: str | None):
        self.public_root = public_root.resolve()
        self.state_dir = state_dir.resolve()
        if self.state_dir == self.public_root or self.public_root in self.state_dir.parents:
            raise ValueError('A pasta de dados deve ficar fora da pasta pública.')
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.key_path = self.state_dir / 'admin-key.txt'
        if admin_key:
            self.admin_key = admin_key.strip()
        else:
            try:
                with self.key_path.open('x', encoding='utf-8') as key_file:
                    key_file.write(secrets.token_urlsafe(32) + '\n')
            except FileExistsError:
                pass
            self.admin_key = self.key_path.read_text(encoding='utf-8').strip()
            try:
                self.key_path.chmod(0o600)
            except OSError:
                pass
        if len(self.admin_key) < 16:
            raise ValueError('A chave administrativa precisa ter pelo menos 16 caracteres.')
        self.db_path = self.state_dir / 'orders.sqlite3'
        self.lock = threading.RLock()
        with self.connect() as db:
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, fingerprint TEXT NOT NULL, token TEXT NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL)')
            db.execute('CREATE INDEX IF NOT EXISTS orders_created ON orders(created_at DESC)')
            db.execute('CREATE TABLE IF NOT EXISTS payment_webhooks (payment_id TEXT PRIMARY KEY, order_id TEXT NOT NULL, status TEXT NOT NULL, updated_at TEXT NOT NULL)')
        self.operations = Operations(self)
        self.payments = PaymentService(self.catalogue()[0]['store'])

    @property
    def demo(self):
        return self.catalogue()[0]['store'].get('demo', True) is not False

    @staticmethod
    def valid_token(left, right):
        return isinstance(right, str) and len(right) <= 200 and same_secret(left, right)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.db_path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def catalogue(self):
        source = (self.public_root / 'store-data.js').read_text(encoding='utf-8-sig').strip()
        prefix = 'window.BRASA_DATA = '
        if not source.startswith(prefix) or not source.endswith(';'):
            raise ValueError('Formato de store-data.js inválido.')
        data = json.loads(source[len(prefix):-1])
        return data, {p['id']: p for p in data['products']}, {e['id']: e for e in data['extras']}

    def validate(self, payload):
        if not isinstance(payload, dict):
            raise InvalidOrder('O pedido precisa ser um objeto JSON.')
        request_id = payload.get('requestId')
        try:
            if not isinstance(request_id, str) or str(uuid.UUID(request_id)) != request_id.lower():
                raise ValueError()
        except (ValueError, AttributeError):
            raise InvalidOrder('Identificador da solicitação inválido.')
        data, products, extras = self.catalogue()
        rules = data['store']
        coupon_rules, delivery_rules = rules['coupon'], rules['delivery']
        incoming = payload.get('items')
        if not isinstance(incoming, list) or not 1 <= len(incoming) <= 40:
            raise InvalidOrder('A sacola deve ter entre 1 e 40 itens.')
        snapshots, normalized_items = [], []
        bundles = {bundle['id']: bundle for bundle in data.get('bundles', [])}
        subtotal = 0
        for item in incoming:
            if not isinstance(item, dict):
                raise InvalidOrder('Item da sacola inválido.')
            product = products.get(item.get('productId')) if isinstance(item.get('productId'), str) else None
            if not product:
                raise InvalidOrder('Um produto não está disponível neste cardápio.')
            quantity = integer(item.get('quantity'), 'quantidade', 1, 99)
            extra_ids, removed = item.get('extras', []), item.get('removed', [])
            if not isinstance(extra_ids, list) or len(extra_ids) > 20 or not all(isinstance(e, str) for e in extra_ids) or len(set(extra_ids)) != len(extra_ids):
                raise InvalidOrder('Adicionais inválidos ou repetidos.')
            if not isinstance(removed, list) or len(removed) > 30 or not all(isinstance(r, str) for r in removed) or len(set(removed)) != len(removed):
                raise InvalidOrder('Remoções inválidas ou repetidas.')
            if any(e not in product.get('extras', []) or e not in extras for e in extra_ids):
                raise InvalidOrder(f'Adicional indisponível para {product["name"]}.')
            if any(r not in product.get('removable', []) for r in removed):
                raise InvalidOrder(f'Remoção indisponível para {product["name"]}.')
            note = clean_text(item.get('note', ''), 'observação do item')
            unit = integer(product['price'], 'preço do catálogo', 0, 1000000) + sum(integer(extras[e]['price'], 'preço do adicional', 0, 1000000) for e in extra_ids)
            raw_bundle, bundle_snapshot, bundle_normalized = item.get('bundle'), None, None
            if raw_bundle is not None:
                if not isinstance(raw_bundle, dict) or set(raw_bundle) != {'id', 'sideId', 'drinkId'} or not all(isinstance(value, str) for value in raw_bundle.values()):
                    raise InvalidOrder('Escolha uma porção e uma bebida válidas para o combo.')
                bundle = bundles.get(raw_bundle['id'])
                if not bundle or product['category'] not in bundle.get('categories', []) or raw_bundle['sideId'] not in bundle.get('sideIds', []) or raw_bundle['drinkId'] not in bundle.get('drinkIds', []):
                    raise InvalidOrder('Este combo não está disponível para o produto.')
                side, drink = products.get(raw_bundle['sideId']), products.get(raw_bundle['drinkId'])
                if not side or not drink:
                    raise InvalidOrder('Os complementos deste combo não estão disponíveis.')
                bundle_discount = integer(bundle['discountCents'], 'desconto do combo', 0, 1000000)
                side_price, drink_price = integer(side['price'], 'preço da porção', 0, 1000000), integer(drink['price'], 'preço da bebida', 0, 1000000)
                if bundle_discount > side_price + drink_price:
                    raise InvalidOrder('O desconto do combo excede seus complementos.')
                unit += side_price + drink_price - bundle_discount
                bundle_normalized = dict(raw_bundle)
                bundle_snapshot = {'id': bundle['id'], 'name': bundle['name'], 'side': {'id': side['id'], 'name': side['name'], 'price': side_price}, 'drink': {'id': drink['id'], 'name': drink['name'], 'price': drink_price}, 'discountCents': bundle_discount}
            line = unit * quantity
            subtotal += line
            snapshots.append({'productId': product['id'], 'name': product['name'], 'quantity': quantity, 'extras': [{'id': e, 'name': extras[e]['name'], 'price': extras[e]['price']} for e in extra_ids], 'removed': removed, 'note': note, 'bundle': bundle_snapshot, 'unitCents': unit, 'lineCents': line})
            normalized_items.append({'productId': product['id'], 'quantity': quantity, 'extras': sorted(extra_ids), 'removed': sorted(removed), 'note': note, 'bundle': bundle_normalized})
        if subtotal > 10000000:
            raise InvalidOrder('O total excede o limite deste pedido demonstrativo.')
        coupon = clean_text(payload.get('coupon', '') or '', 'cupom', 30).upper()
        discount = 0
        if coupon:
            if coupon != coupon_rules['code'].upper():
                raise InvalidOrder('Cupom não encontrado.')
            if subtotal < coupon_rules['minSubtotalCents']:
                raise InvalidOrder('Este pedido não alcança o subtotal mínimo do cupom.')
            discount = min(subtotal * coupon_rules['percent'] // 100, coupon_rules['maxDiscountCents'])
        fulfilment = payload.get('fulfilment')
        if fulfilment not in ('pickup', 'delivery'):
            raise InvalidOrder('Escolha retirada ou entrega.')
        delivery_cents, address, delivery_quote = 0, None, None
        if fulfilment == 'delivery':
            if subtotal < delivery_rules['minSubtotalCents']:
                raise InvalidOrder('Este pedido não alcança o subtotal mínimo para entrega.')
            raw_address = payload.get('address')
            if not isinstance(raw_address, dict):
                raise InvalidOrder('Preencha o endereço de entrega.')
            cep_raw = clean_text(raw_address.get('cep', ''), 'CEP', 12, 8)
            cep = re.sub(r'[- .]', '', cep_raw)
            if not re.fullmatch(r'\d{8}', cep):
                raise InvalidOrder('Informe um CEP com 8 dígitos.')
            neighborhood = clean_text(raw_address.get('neighborhood', ''), 'bairro', 60, 1)
            normalized = re.sub(r'\s+', '', neighborhood).casefold()
            delivery_quote = self.operations.quote(cep)
            if not delivery_quote['served']:
                raise InvalidOrder('Este CEP está fora da área de entrega desta loja.')
            zone = delivery_quote['zone']
            if normalized != re.sub(r'\s+', '', zone['neighborhood']).casefold():
                raise InvalidOrder('O bairro precisa corresponder ao CEP consultado.')
            address = {'cep': cep, 'street': clean_text(raw_address.get('street', ''), 'rua', 120, 3), 'number': clean_text(raw_address.get('number', ''), 'número', 20, 1), 'complement': clean_text(raw_address.get('complement', ''), 'complemento', 100), 'neighborhood': zone['neighborhood'], 'city': clean_text(raw_address.get('city', ''), 'cidade', 80, 2)}
            delivery_cents = integer(zone['feeCents'], 'taxa de entrega', 0, 1000000)
        customer = payload.get('customer')
        if not isinstance(customer, dict):
            raise InvalidOrder('Preencha seus dados de contato.')
        name = clean_text(customer.get('name', ''), 'nome', 80, 2)
        raw_phone = clean_text(customer.get('phone', ''), 'telefone', 30, 10)
        phone = re.sub(r'[ ()+.-]', '', raw_phone)
        if not re.fullmatch(r'\d{10,13}', phone) or (len(phone) in (12, 13) and not phone.startswith('55')):
            raise InvalidOrder('Informe um telefone brasileiro com DDD.')
        payment = payload.get('payment')
        if not isinstance(payment, dict) or payment.get('method') not in ('pix', 'card', 'cash') or payment.get('method') not in rules.get('payments', ('pix', 'card', 'cash')):
            raise InvalidOrder('Escolha uma forma de pagamento para combinar na retirada ou entrega.')
        online = payment.get('online', False)
        if type(online) is not bool or (online and payment['method'] not in ('pix', 'card')):
            raise InvalidOrder('Pagamento online inválido.')
        reward_id = payload.get('rewardOrderId') or None
        reward_token = payload.get('rewardToken') or None
        reward = 0
        if reward_id:
            if not isinstance(reward_id, str) or not re.fullmatch(r'[A-Z0-9-]{6,40}', reward_id) or not isinstance(reward_token, str) or not 1 <= len(reward_token) <= 200:
                raise InvalidOrder('O acesso à recompensa é inválido.')
            if coupon:
                raise InvalidOrder('Escolha o cupom ou a recompensa; eles não acumulam.')
            source = self.get(reward_id, reward_token)
            if not source or phone_key(source['customer']['phone']) != phone_key(phone):
                raise InvalidOrder('Use uma recompensa dos seus próprios pedidos e do mesmo telefone.')
            reward = min(subtotal, self.operations.loyalty_rules()['rewardCents'])
        elif reward_token:
            raise InvalidOrder('Informe o pedido que dá acesso à recompensa.')
        total = subtotal - discount - reward + delivery_cents
        if online and total < 1:
            raise InvalidOrder('Este pedido não tem saldo para pagar online. Escolha pagamento no recebimento para concluí-lo.')
        change = payment.get('changeForCents')
        if change is not None:
            if payment['method'] != 'cash':
                raise InvalidOrder('Troco só se aplica ao pagamento em dinheiro.')
            integer(change, 'valor para troco', total, 10000000)
        note = clean_text(payload.get('note', ''), 'observação do pedido', 240)
        normalized_payload = {'items': normalized_items, 'coupon': coupon, 'customer': {'name': name, 'phone': phone}, 'fulfilment': fulfilment, 'address': address, 'payment': {'method': payment['method'], 'online': online, 'changeForCents': change}, 'note': note, 'rewardOrderId': reward_id}
        fingerprint = hashlib.sha256(json.dumps(normalized_payload, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        estimate = delivery_quote['zone']['estimate'] if delivery_quote else self.operations.estimate(rules['pickupEstimate'])
        order_data = dict(normalized_payload, items=snapshots, deliveryQuote=delivery_quote, estimate=estimate, totals={'subtotalCents': subtotal, 'discountCents': discount, 'rewardCents': reward, 'deliveryCents': delivery_cents, 'totalCents': total}, demo=self.demo)
        return request_id.lower(), fingerprint, order_data

    def create(self, payload):
        request_id, fingerprint, order_data = self.validate(payload)
        with self.lock, self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            old = db.execute('SELECT * FROM orders WHERE request_id=?', (request_id,)).fetchone()
            if old:
                if not hmac.compare_digest(old['fingerprint'], fingerprint):
                    raise InvalidOrder('Esta solicitação já foi usada para um pedido diferente. Refaça o envio.')
                return json.loads(old['data']), False
            operations = self.operations.settings(db)
            if not operations['acceptingOrders']:
                raise InvalidOrder('A loja pausou novos pedidos. Tente novamente mais tarde.')
            for item in order_data['items']:
                ids = [item['productId']]
                if item['bundle']:
                    ids += [item['bundle']['side']['id'], item['bundle']['drink']['id']]
                if set(ids) & set(operations['pausedProductIds']):
                    raise InvalidOrder('Um dos produtos da sacola está esgotado. Atualize sua escolha.')
            if order_data['payment']['online'] and not self.payments.public_config()['enabled']:
                raise InvalidOrder('Pagamento online não está disponível nesta loja demonstrativa.')
            if order_data['rewardOrderId']:
                loyalty = self.operations.loyalty(order_data['rewardOrderId'], payload.get('rewardToken'), db)
                if not loyalty or loyalty['availableRewards'] < 1:
                    raise InvalidOrder('Você ainda não tem uma recompensa disponível ou ela já foi usada.')
            order_id = 'BB-' + datetime.now(BRAZIL).strftime('%y%m%d') + '-' + secrets.token_hex(4).upper()
            order = dict(order_data, id=order_id, token=secrets.token_urlsafe(32), createdAt=now_iso(), updatedAt=now_iso(), status='awaiting_payment' if order_data['payment']['online'] else 'awaiting_confirmation')
            db.execute('INSERT INTO orders VALUES (?,?,?,?,?,?,?)', (order_id, request_id, fingerprint, order['token'], order['createdAt'], order['status'], json.dumps(order, ensure_ascii=False)))
            if order['rewardOrderId']:
                db.execute('INSERT INTO loyalty_redemptions VALUES (?,?,?,?,?)', (order_id, phone_key(order['customer']['phone']), order['rewardOrderId'], order['totals']['rewardCents'], order['createdAt']))
            return order, True

    def get(self, order_id, token=None, admin=False):
        with self.connect() as db:
            row = db.execute('SELECT * FROM orders WHERE id=?', (order_id,)).fetchone()
        if not row or (not admin and (not token or not self.valid_token(row['token'], token))):
            return None
        return json.loads(row['data'])

    def change(self, order_id, status, token=None, admin=False):
        with self.lock, self.connect() as db:
            row = db.execute('SELECT * FROM orders WHERE id=?', (order_id,)).fetchone()
            if not row or (not admin and (not token or not self.valid_token(row['token'], token))):
                return None
            order = json.loads(row['data'])
            current = order['status']
            if order['payment'].get('online') and order['payment'].get('reconciliationRequired') and status not in (current, 'cancelled'):
                raise InvalidOrder('Confira a conciliação deste pagamento no provedor antes de avançar o atendimento.')
            if order['payment'].get('online') and order['payment'].get('status') == 'approved' and status == 'cancelled':
                raise InvalidOrder('O pagamento aprovado deve ser reconciliado no provedor antes de cancelar o pedido.')
            if not admin:
                if current not in ('awaiting_confirmation', 'awaiting_payment'):
                    raise InvalidOrder('Só é possível cancelar antes da confirmação da loja.')
                status = 'cancelled'
            else:
                next_step = 'ready' if order['fulfilment'] == 'pickup' else 'out_for_delivery'
                allowed = {'awaiting_payment': ('cancelled',), 'awaiting_confirmation': ('confirmed', 'cancelled'), 'confirmed': ('preparing', 'cancelled'), 'preparing': (next_step, 'cancelled'), 'ready': ('completed', 'cancelled'), 'out_for_delivery': ('completed', 'cancelled'), 'completed': (), 'cancelled': ()}
                if status == current:
                    return order
                if status not in allowed.get(current, ()):
                    raise InvalidOrder('Essa mudança de status não é permitida nesta etapa.')
            order.update(status=status, updatedAt=now_iso())
            db.execute('UPDATE orders SET status=?,data=? WHERE id=?', (status, json.dumps(order, ensure_ascii=False), order_id))
            return order

    def start_payment(self, order_id, token):
        with self.lock:
            order = self.get(order_id, token)
            if not order:
                return None
            if order['status'] != 'awaiting_payment' or not order['payment'].get('online'):
                raise InvalidOrder('Este pedido não está aguardando pagamento online.')
            if not self.payments.public_config()['enabled']:
                raise InvalidOrder('Pagamento online não está disponível.')
            if order['payment'].get('checkout'):
                return order['payment']['checkout']
            checkout = self.payments.start(order)
            order['payment']['checkout'] = checkout
            order['updatedAt'] = now_iso()
            with self.connect() as db:
                db.execute('UPDATE orders SET data=? WHERE id=?', (json.dumps(order, ensure_ascii=False), order_id))
            return checkout

    def payment_webhook(self, headers, query):
        if not self.payments.verify_signature(headers, query):
            return False
        payment_id = query.get('data.id', [''])[0]
        authoritative = self.payments.get_payment(payment_id)
        order_id = authoritative.get('externalReference')
        order = self.get(order_id, admin=True)
        if not order or not order['payment'].get('online'):
            raise InvalidOrder('Pagamento sem pedido online correspondente.')
        result = self.payments.verify_payment(payment_id, order, prefetched=authoritative)
        with self.lock, self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM orders WHERE id=?', (order_id,)).fetchone()
            order = json.loads(row['data'])
            approved_id = order['payment'].get('approvedPaymentId')
            multiple_paid = result['approved'] and approved_id and approved_id != result['id']
            if multiple_paid:
                order['payment']['reconciliationRequired'] = True
                order['payment']['additionalPaymentIds'] = sorted(set(order['payment'].get('additionalPaymentIds', []) + [result['id']]))[:10]
            elif result['approved']:
                order['payment']['approvedPaymentId'] = result['id']
            if order['status'] == 'cancelled' and result['approved']:
                # A late approval must be reconciled manually; never revive a
                # cancelled order or dispatch it to a kitchen automatically.
                order['payment']['reconciliationRequired'] = True
            elif result['approved'] and order['status'] == 'awaiting_payment':
                order['status'] = 'awaiting_confirmation'
            if not multiple_paid and (result['approved'] or order['payment'].get('status') != 'approved' or (result['status'] in ('refunded', 'charged_back', 'cancelled') and result['id'] == approved_id)):
                order['payment'].update(provider='mercadopago', providerPaymentId=result['id'], status=result['status'])
            if result['status'] in ('refunded', 'charged_back') or result.get('refundedCents', 0) > 0:
                order['payment']['reconciliationRequired'] = True
            order['updatedAt'] = now_iso()
            db.execute('UPDATE orders SET status=?,data=? WHERE id=?', (order['status'], json.dumps(order, ensure_ascii=False), order_id))
            db.execute('INSERT INTO payment_webhooks VALUES (?,?,?,?) ON CONFLICT(payment_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at', (result['id'], order_id, result['status'], order['updatedAt']))
        return True

    def list_orders(self, status):
        with self.connect() as db:
            if status:
                rows = db.execute('SELECT data FROM orders WHERE status=? ORDER BY created_at DESC,id DESC LIMIT 300', (status,)).fetchall()
            else:
                rows = db.execute('SELECT data FROM orders ORDER BY created_at DESC,id DESC LIMIT 300').fetchall()
        orders = [json.loads(r['data']) for r in rows]
        for order in orders:
            order.pop('token', None)
        return orders


class Handler(BaseHTTPRequestHandler):
    server_version = 'BrasaBurger/7'

    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def log_message(self, fmt, *args):
        # Nunca registrar corpo, telefone, tokens de rastreamento ou chave.
        path = urlsplit(self.path).path
        identity = 'anonymous' if path == '/api/events' else self.client_address[0]
        print(f'{identity} {self.command} {path} {args[1] if len(args) > 1 else ""}', flush=True)

    def headers_common(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'same-origin')

    def respond(self, status, data):
        encoded = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.headers_common()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(encoded)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(encoded)

    def request_allowed(self):
        host = self.headers.get('Host', '')
        if host not in self.server.allowed_hosts:
            self.respond(403, {'error': 'Host não autorizado.'})
            return False
        origin = self.headers.get('Origin')
        if origin and origin not in self.server.allowed_origins:
            self.respond(403, {'error': 'Origem não autorizada.'})
            return False
        if self.headers.get('Sec-Fetch-Site') == 'cross-site' and self.path.startswith('/api/'):
            self.respond(403, {'error': 'Requisição entre sites não permitida.'})
            return False
        return True

    def body(self, maximum=MAX_BODY):
        if self.headers.get('Transfer-Encoding'):
            raise InvalidOrder('Envio de dados inválido.')
        if self.headers.get('Content-Type', '').split(';')[0].lower() != 'application/json':
            raise InvalidOrder('Envie os dados como application/json.')
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            raise InvalidOrder('Tamanho de envio inválido.')
        if not 0 < length <= maximum:
            raise InvalidOrder('Dados vazios ou acima do limite permitido.')
        try:
            value = json.loads(self.rfile.read(length).decode('utf-8'))
        except (UnicodeError, json.JSONDecodeError, TimeoutError):
            raise InvalidOrder('JSON inválido.')
        return value

    def admin_allowed(self):
        expected = 'Bearer ' + self.server.store.admin_key
        if not same_secret(self.headers.get('Authorization', ''), expected):
            self.respond(401, {'error': 'Chave administrativa inválida.'})
            return False
        return True

    def do_GET(self):
        self.dispatch()

    def do_HEAD(self):
        self.dispatch()

    def do_POST(self):
        self.dispatch()

    def do_PATCH(self):
        self.dispatch()

    def do_OPTIONS(self):
        self.respond(403, {'error': 'A API permite apenas a origem da própria loja.'})

    def dispatch(self):
        if not self.request_allowed():
            return
        path = urlsplit(self.path).path
        try:
            if path == '/api/health' and self.command == 'GET':
                self.respond(200, {'ok': True, 'demo': self.server.store.demo, 'version': 7})
            elif path == '/api/shop' and self.command == 'GET':
                self.respond(200, self.server.store.operations.shop())
            elif path == '/api/delivery' and self.command == 'GET':
                cep = parse_qs(urlsplit(self.path).query).get('cep', [''])[0]
                self.respond(200, self.server.store.operations.quote(cep))
            elif path == '/api/reviews' and self.command == 'GET':
                self.respond(200, self.server.store.operations.reviews())
            elif path == '/api/events' and self.command == 'POST':
                self.respond(200, self.server.store.operations.event(self.body()))
            elif path == '/api/admin/shop' and self.command in ('GET', 'PATCH'):
                if not self.admin_allowed():
                    return
                self.respond(200, self.server.store.operations.patch(self.body()) if self.command == 'PATCH' else self.server.store.operations.shop())
            elif path == '/api/admin/metrics' and self.command == 'GET':
                if not self.admin_allowed():
                    return
                self.respond(200, self.server.store.operations.metrics())
            elif path == '/api/admin/reviews' and self.command == 'GET':
                if not self.admin_allowed():
                    return
                self.respond(200, self.server.store.operations.reviews(admin=True))
            elif re.fullmatch(r'/api/admin/reviews/[0-9a-f-]{36}', path) and self.command == 'PATCH':
                if not self.admin_allowed():
                    return
                review = self.server.store.operations.moderate_review(path.rsplit('/', 1)[1], self.body())
                self.respond(200 if review else 404, {'review': review} if review else {'error': 'Avaliação não encontrada.'})
            elif path == '/api/admin/media' and self.command == 'POST':
                if not self.admin_allowed():
                    return
                self.respond(201, self.server.store.operations.upload(self.body(MAX_MEDIA_BODY)))
            elif path == '/api/payments/webhook' and self.command == 'POST':
                accepted = self.server.store.payment_webhook(self.headers, parse_qs(urlsplit(self.path).query))
                self.respond(200 if accepted else 403, {'accepted': True} if accepted else {'error': 'Notificação de pagamento não autorizada.'})
            elif re.fullmatch(r'/api/orders/[A-Z0-9-]{6,40}/(loyalty|review|payment)', path):
                token, action, order_id = self.headers.get('X-Order-Token', ''), path.rsplit('/', 1)[1], path.split('/')[3]
                if action == 'loyalty' and self.command == 'GET':
                    result = self.server.store.operations.loyalty(order_id, token)
                    response = result
                elif action == 'review' and self.command == 'POST':
                    result = self.server.store.operations.add_review(order_id, token, self.body())
                    response = {'review': result}
                elif action == 'payment' and self.command == 'POST':
                    result = self.server.store.start_payment(order_id, token)
                    response = {'payment': result}
                else:
                    self.respond(405, {'error': 'Método não permitido.'})
                    return
                self.respond(200 if result is not None else 404, response if result is not None else {'error': 'Pedido não encontrado ou código de acesso inválido.'})
            elif path == '/api/orders' and self.command == 'POST':
                order, created = self.server.store.create(self.body())
                self.respond(201 if created else 200, {'order': order})
            elif path == '/api/admin/orders' and self.command == 'GET':
                if not self.admin_allowed():
                    return
                status = parse_qs(urlsplit(self.path).query).get('status', [''])[0]
                if status and status not in STATUSES:
                    raise InvalidOrder('Filtro de status inválido.')
                self.respond(200, {'orders': self.server.store.list_orders(status), 'demo': self.server.store.demo})
            elif re.fullmatch(r'/api/admin/orders/[A-Z0-9-]{6,40}', path) and self.command == 'PATCH':
                if not self.admin_allowed():
                    return
                payload = self.body()
                if not isinstance(payload, dict) or payload.get('status') not in STATUSES:
                    raise InvalidOrder('Status inválido.')
                order = self.server.store.change(path.rsplit('/', 1)[1], payload['status'], admin=True)
                if order:
                    order.pop('token', None)
                self.respond(200 if order else 404, {'order': order} if order else {'error': 'Pedido não encontrado.'})
            elif re.fullmatch(r'/api/orders/[A-Z0-9-]{6,40}(/cancel)?', path):
                token = self.headers.get('X-Order-Token', '')
                if len(token) > 200:
                    token = ''
                order_id = path.split('/')[3]
                if self.command == 'GET' and not path.endswith('/cancel'):
                    order = self.server.store.get(order_id, token)
                elif self.command == 'POST' and path.endswith('/cancel'):
                    order = self.server.store.change(order_id, 'cancelled', token)
                else:
                    self.respond(405, {'error': 'Método não permitido.'})
                    return
                self.respond(200 if order else 404, {'order': order} if order else {'error': 'Pedido não encontrado ou código de acesso inválido.'})
            elif path.startswith('/api/'):
                self.respond(404, {'error': 'Endereço de API não encontrado.'})
            elif self.command in ('GET', 'HEAD'):
                self.static(path)
            else:
                self.respond(405, {'error': 'Método não permitido.'})
        except (InvalidOrder, OperationError) as error:
            self.respond(400, {'error': str(error)})
        except PaymentError as error:
            self.respond(error.status, {'error': error.message, 'code': error.code})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            self.respond(500, {'error': 'Não foi possível concluir a operação. Tente novamente.'})

    def static(self, path):
        decoded = unquote(path)
        if decoded.startswith('/brasa-burger/'):
            decoded = decoded[len('/brasa-burger'):]
        if decoded in ('/', '/brasa-burger'):
            decoded = '/index.html'
        if '\x00' in decoded or '\\' in decoded or any(part.startswith('.') for part in decoded.split('/') if part):
            self.respond(404, {'error': 'Arquivo não encontrado.'})
            return
        candidate = (self.server.store.public_root / decoded.lstrip('/')).resolve()
        if self.server.store.public_root not in candidate.parents or candidate.suffix.lower() not in PUBLIC_TYPES or not candidate.is_file():
            self.respond(404, {'error': 'Arquivo não encontrado.'})
            return
        size = candidate.stat().st_size
        start, end, partial = 0, size - 1, False
        requested = self.headers.get('Range')
        if requested:
            match = re.fullmatch(r'bytes=(\d*)-(\d*)', requested)
            try:
                if not match or not any(match.groups()) or not size:
                    raise ValueError()
                first, last = match.groups()
                if first:
                    start = int(first)
                    end = min(int(last), size - 1) if last else size - 1
                else:
                    suffix = int(last)
                    if suffix <= 0:
                        raise ValueError()
                    start, end = max(0, size - suffix), size - 1
                if start > end or start >= size:
                    raise ValueError()
                partial = True
            except ValueError:
                self.send_response(416)
                self.headers_common()
                self.send_header('Content-Range', f'bytes */{size}')
                self.send_header('Content-Length', '0')
                self.end_headers()
                return
        media_type = 'video/mp4' if candidate.suffix.lower() == '.mp4' else ('text/javascript' if candidate.suffix.lower() == '.js' else mimetypes.guess_type(str(candidate))[0] or 'application/octet-stream')
        self.send_response(206 if partial else 200)
        self.headers_common()
        self.send_header('Content-Type', media_type + ('; charset=utf-8' if media_type.startswith('text/') else ''))
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Length', str(max(0, end - start + 1)))
        self.send_header('Cache-Control', 'no-cache' if candidate.suffix.lower() in ('.html', '.js', '.css') else 'public, max-age=3600')
        if partial:
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.end_headers()
        if self.command == 'HEAD':
            return
        with candidate.open('rb') as source:
            source.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                chunk = source.read(min(64 * 1024, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)


def main():
    parser = argparse.ArgumentParser(description='Brasa Burger: loja demonstrativa com pedidos locais persistentes.')
    parser.add_argument('--port', type=int, default=int(os.environ.get('PORT', '4187')))
    parser.add_argument('--bind', default=os.environ.get('BRASA_BIND', '127.0.0.1'))
    parser.add_argument('--public-root', type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument('--state-dir', type=Path, default=None)
    args = parser.parse_args()
    workspace_work = args.public_root.resolve().parent.parent / 'work'
    default_state = workspace_work / 'brasa-burger-v3' / 'state' if workspace_work.is_dir() else args.public_root.resolve().parent / '.brasa-data'
    state = args.state_dir or Path(os.environ.get('BRASA_STATE_DIR', str(default_state)))
    store = Store(args.public_root, state, os.environ.get('BRASA_ADMIN_KEY'))
    server = ThreadingHTTPServer((args.bind, args.port), Handler)
    server.daemon_threads = True
    server.store = store
    server.allowed_hosts = {f'127.0.0.1:{args.port}', f'localhost:{args.port}', f'{args.bind}:{args.port}'}
    server.allowed_origins = {'http://' + host for host in server.allowed_hosts}
    configured_origin = os.environ.get('BRASA_PUBLIC_ORIGIN', '').rstrip('/')
    if configured_origin:
        parsed = urlsplit(configured_origin)
        if parsed.scheme not in ('http', 'https') or not parsed.netloc or parsed.path:
            raise ValueError('BRASA_PUBLIC_ORIGIN deve ser uma origem HTTP/HTTPS sem caminho.')
        server.allowed_origins.add(configured_origin)
        server.allowed_hosts.add(parsed.netloc)
    print(f'Loja DEMONSTRATIVA: http://127.0.0.1:{args.port}/brasa-burger/index.html', flush=True)
    print(f'Dados locais: {store.state_dir}', flush=True)
    print('Chave administrativa: variável BRASA_ADMIN_KEY.' if os.environ.get('BRASA_ADMIN_KEY') else f'Chave administrativa no arquivo local: {store.key_path}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
