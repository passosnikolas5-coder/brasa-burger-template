"""Optional Mercado Pago Checkout Pro adapter. No network request at construction.

Credentials stay in the server environment. Demo stores cannot enable payments.
The caller owns durable preference reuse and order/payment state transitions.
"""
from decimal import Decimal, DecimalException
import hashlib
import hmac
import ipaddress
import json
import os
import re
import time
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, HTTPRedirectHandler, build_opener


API_ORIGIN = 'https://api.mercadopago.com'
PAYMENT_HOSTS = frozenset(('www.mercadopago.com.br', 'www.mercadopago.com'))
MAX_RESPONSE_BYTES = 1024 * 1024


class PaymentError(Exception):
    def __init__(self, status, message, code='payment_error'):
        super().__init__(message)
        self.status = status
        self.message = message
        self.code = code


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _origin(value):
    try:
        parsed = urlsplit(value)
        hostname = (parsed.hostname or '').lower()
        if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port not in (None, 443):
            return ''
        if not hostname or parsed.path not in ('', '/') or parsed.query or parsed.fragment:
            return ''
        if hostname == 'localhost' or hostname.endswith(('.localhost', '.local')) or any(ord(c) < 33 for c in value):
            return ''
        try:
            if not ipaddress.ip_address(hostname).is_global:
                return ''
        except ValueError:
            if not re.fullmatch(r'(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?', hostname) or '.' not in hostname:
                return ''
        return f'https://{parsed.netloc.lower()}'
    except (ValueError, TypeError):
        return ''


def safe_checkout_url(value, preference_id=None):
    if not isinstance(value, str) or len(value) > 4096 or any(ord(c) < 33 for c in value):
        return False
    try:
        parsed = urlsplit(value)
        if parsed.scheme != 'https' or parsed.hostname not in PAYMENT_HOSTS or parsed.username or parsed.password or parsed.port not in (None, 443) or parsed.fragment:
            return False
        if not parsed.path.startswith(('/checkout/', '/mlb/checkout/')):
            return False
        if preference_id is not None and parse_qs(parsed.query).get('pref_id') != [preference_id]:
            return False
        return True
    except ValueError:
        return False


def _cents(value):
    if isinstance(value, bool) or not isinstance(value, (int, float, str, Decimal)):
        raise PaymentError(502, 'O provedor informou um valor de pagamento inválido.', 'invalid_amount')
    try:
        if len(str(value)) > 64:
            raise ValueError
        amount = Decimal(str(value))
        if not amount.is_finite() or not 0 <= amount <= 1_000_000 or amount != amount.quantize(Decimal('0.01')):
            raise ValueError
        cents = amount * 100
        if not amount.is_finite() or cents != cents.to_integral_value() or not 0 <= cents <= 100_000_000:
            raise ValueError
        return int(cents)
    except (DecimalException, ValueError, OverflowError):
        raise PaymentError(502, 'O provedor informou um valor de pagamento inválido.', 'invalid_amount') from None


def _single(mapping, key):
    value = mapping.get(key)
    if isinstance(value, (list, tuple)):
        return value[0] if len(value) == 1 and isinstance(value[0], str) else ''
    return value if isinstance(value, str) else ''


class PaymentService:
    def __init__(self, store, environ=None, transport=None, clock=None):
        self.store = store if isinstance(store, dict) else {}
        env = os.environ if environ is None else environ
        self._requested = env.get('BRASA_PAYMENTS_ENABLED') == '1'
        self._token = str(env.get('BRASA_MP_ACCESS_TOKEN', '')).strip()
        self._secret = str(env.get('BRASA_MP_WEBHOOK_SECRET', '')).strip()
        self._collector = str(env.get('BRASA_MP_COLLECTOR_ID', '')).strip()
        self._public_origin = _origin(env.get('BRASA_PUBLIC_ORIGIN', ''))
        self._transport = transport or self._http
        self._clock = clock or time.time

    def public_config(self):
        if self.store.get('demo', True) is not False:
            reason = 'Pagamento online indisponível na demonstração. Nenhum valor será cobrado.'
        elif not self._requested:
            reason = 'Pagamento online ainda não foi ativado pela loja.'
        elif not self._token or not self._secret or not self._public_origin:
            reason = 'Pagamento online ainda não está configurado. Escolha pagamento no recebimento.'
        else:
            reason = ''
        enabled = not reason
        return {'enabled': enabled, 'provider': 'mercadopago', 'mode': 'production' if enabled else 'disabled', 'reason': reason}

    def _require_enabled(self):
        config = self.public_config()
        if not config['enabled']:
            raise PaymentError(503, config['reason'], 'payments_disabled')

    def _http(self, method, url, payload, headers):
        data = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode('utf-8') if payload is not None else None
        request = Request(url, data=data, headers=headers, method=method)
        try:
            with build_opener(_NoRedirect()).open(request, timeout=9) as response:
                raw = response.read(MAX_RESPONSE_BYTES + 1)
                if len(raw) > MAX_RESPONSE_BYTES:
                    raise PaymentError(502, 'Resposta de pagamento maior que o limite permitido.', 'invalid_response')
                result = json.loads(raw)
                if not isinstance(result, dict):
                    raise ValueError
                return result
        except HTTPError:
            raise PaymentError(502, 'O provedor não conseguiu processar esta consulta. Tente novamente.', 'provider_error') from None
        except (URLError, TimeoutError, OSError):
            raise PaymentError(502, 'O provedor de pagamento está indisponível. Tente novamente.', 'provider_unavailable') from None
        except (ValueError, UnicodeError):
            raise PaymentError(502, 'O provedor enviou uma resposta inválida.', 'invalid_response') from None

    def _request(self, method, path, payload=None, key=None):
        self._require_enabled()
        headers = {'Authorization': f'Bearer {self._token}', 'Content-Type': 'application/json', 'Accept': 'application/json'}
        if key:
            headers['X-Idempotency-Key'] = key
        result = self._transport(method, API_ORIGIN + path, payload, headers)
        if not isinstance(result, dict):
            raise PaymentError(502, 'O provedor enviou uma resposta inválida.', 'invalid_response')
        return result

    @staticmethod
    def _order(order):
        if not isinstance(order, dict) or not isinstance(order.get('id'), str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', order['id']):
            raise PaymentError(400, 'Pedido inválido para pagamento.', 'invalid_order')
        totals, payment = order.get('totals'), order.get('payment')
        total = totals.get('totalCents') if isinstance(totals, dict) else None
        if type(total) is not int or not 1 <= total <= 100_000_000 or not isinstance(payment, dict) or payment.get('online') is not True or payment.get('method') not in ('pix', 'card'):
            raise PaymentError(400, 'Este pedido não está habilitado para pagamento online.', 'invalid_order')
        return order['id'], total

    def start(self, order):
        self._require_enabled()
        order_id, total = self._order(order)
        if order.get('status') != 'awaiting_payment':
            raise PaymentError(409, 'Este pedido não está aguardando pagamento.', 'invalid_status')
        return_url = self._public_origin + '/brasa-burger/index.html?payment=return#pedidos'
        payload = {
            'items': [{'id': order_id, 'title': f'Brasa Burger — pedido {order_id}', 'quantity': 1, 'currency_id': 'BRL', 'unit_price': total / 100}],
            'external_reference': order_id,
            'metadata': {'brasa_order_id': order_id},
            'back_urls': dict.fromkeys(('success', 'pending', 'failure'), return_url),
            'auto_return': 'approved',
            'notification_url': self._public_origin + '/api/payments/webhook',
            'payment_methods': {'excluded_payment_types': [{'id': 'ticket'}, {'id': 'atm'}], 'installments': 1},
        }
        key = hashlib.sha256(f'brasa-checkout-v1:{order_id}:{total}'.encode()).hexdigest()
        response = self._request('POST', '/checkout/preferences', payload, key)
        preference_id = response.get('id')
        if not isinstance(preference_id, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,180}', preference_id) or not safe_checkout_url(response.get('init_point'), preference_id):
            raise PaymentError(502, 'O provedor não informou um endereço de pagamento válido.', 'invalid_checkout_url')
        return {'provider': 'mercadopago', 'preferenceId': preference_id, 'url': response['init_point']}

    def verify_signature(self, headers, query):
        if not self.public_config()['enabled'] or not hasattr(headers, 'items') or not hasattr(query, 'get'):
            return False
        normalized = {str(key).lower(): value for key, value in headers.items()}
        signature = _single(normalized, 'x-signature')
        request_id = _single(normalized, 'x-request-id')
        data_id = _single(query, 'data.id').lower()
        if not re.fullmatch(r'[a-z0-9_-]{1,100}', data_id) or not re.fullmatch(r'[A-Za-z0-9_-]{1,160}', request_id):
            return False
        parts = {}
        for part in signature.split(','):
            key, separator, value = part.partition('=')
            key, value = key.strip(), value.strip()
            if not separator or key in parts:
                return False
            parts[key] = value
        ts, digest = parts.get('ts', ''), parts.get('v1', '')
        if not re.fullmatch(r'\d{10,13}', ts) or not re.fullmatch(r'[A-Fa-f0-9]{64}', digest):
            return False
        timestamp = int(ts) / 1000 if len(ts) == 13 else int(ts)
        if abs(self._clock() - timestamp) > 300:
            return False
        manifest = f'id:{data_id};request-id:{request_id};ts:{ts};'
        expected = hmac.new(self._secret.encode(), manifest.encode(), hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, digest.lower())

    def get_payment(self, payment_id):
        self._require_enabled()
        payment_id = str(payment_id)
        if not re.fullmatch(r'[0-9]{1,30}', payment_id):
            raise PaymentError(400, 'Identificador de pagamento inválido.', 'invalid_payment_id')
        data = self._request('GET', '/v1/payments/' + payment_id)
        if str(data.get('id')) != payment_id or not isinstance(data.get('status'), str) or not isinstance(data.get('external_reference'), str) or not isinstance(data.get('currency_id'), str):
            raise PaymentError(502, 'O provedor enviou um pagamento inválido.', 'invalid_payment')
        return {'id': payment_id, 'status': data['status'], 'externalReference': data['external_reference'],
                'amountCents': _cents(data.get('transaction_amount')), 'currency': data['currency_id'],
                'liveMode': data.get('live_mode') is True, 'refundedCents': _cents(data.get('transaction_amount_refunded', 0)),
                'collectorId': str(data.get('collector_id', ''))}

    def verify_payment(self, payment_id, order, prefetched=None):
        self._require_enabled()
        order_id, total = self._order(order)
        payment_id = str(payment_id)
        data = self.get_payment(payment_id) if prefetched is None else prefetched
        if not isinstance(data, dict) or data.get('id') != payment_id or data.get('externalReference') != order_id or data.get('currency') != 'BRL' or type(data.get('amountCents')) is not int or data['amountCents'] != total or data.get('liveMode') is not True:
            raise PaymentError(409, 'O pagamento não corresponde aos dados deste pedido.', 'payment_mismatch')
        if self._collector and data.get('collectorId') != self._collector:
            raise PaymentError(409, 'O pagamento não pertence à conta configurada.', 'collector_mismatch')
        approved = data.get('status') == 'approved' and data.get('refundedCents') == 0
        return {**data, 'approved': approved}
