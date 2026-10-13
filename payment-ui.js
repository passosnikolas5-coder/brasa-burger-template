(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const allowedHosts = new Set(['www.mercadopago.com.br', 'www.mercadopago.com']);
  let config = { enabled: false, reason: 'Pagamento online indisponível na demonstração. Nenhum valor será cobrado.' };
  let loading = false, busy = false, initialized = false, paymentOrderId = '', configVersion = 0;

  function safeCheckoutUrl(value, preferenceId) {
    if (typeof value !== 'string' || value.length > 4096 || /[\s\u0000-\u001f]/.test(value)) return false;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && allowedHosts.has(url.hostname) && !url.username && !url.password && (!url.port || url.port === '443') && !url.hash && (url.pathname.startsWith('/checkout/') || url.pathname.startsWith('/mlb/checkout/')) && (!preferenceId || url.searchParams.getAll('pref_id').length === 1 && url.searchParams.get('pref_id') === preferenceId);
    } catch { return false; }
  }

  function syncChoice() {
    const online = $('payment-online');
    if (!online) return;
    online.disabled = config.enabled !== true;
    if (online.disabled && online.checked) { online.checked = false; if ($('payment-receipt')) $('payment-receipt').checked = true; }
    const selected = !online.disabled && online.checked;
    const help = $('payment-online-help');
    if (help) help.textContent = config.enabled ? 'Pix ou cartão no ambiente do Mercado Pago. A loja confirma o pagamento pela resposta do provedor.' : config.reason || 'Pagamento online ainda não está disponível. Escolha pagamento no recebimento.';
    const options = $('payment-receipt-options');
    if (options) options.hidden = selected;
    if ($('payment-method')) { $('payment-method').disabled = selected; if (selected && !['pix', 'card'].includes($('payment-method').value)) $('payment-method').value = 'pix'; }
    if (selected) { if ($('change-fields')) $('change-fields').hidden = true; if ($('cash-change')) $('cash-change').disabled = true; }
    const field = online.closest('label');
    if (field) field.classList.toggle('payment-unavailable', online.disabled);
  }

  function receiptArea() {
    let area = $('order-payment-actions');
    if (area) return area;
    const receipt = $('checkout-success');
    if (!receipt) return null;
    area = document.createElement('section'); area.id = 'order-payment-actions'; area.className = 'order-payment-actions'; area.hidden = true;
    area.setAttribute('aria-label', 'Pagamento deste pedido');
    const title = document.createElement('h4'); title.textContent = 'Pagamento do pedido';
    const note = document.createElement('p'); note.id = 'order-payment-note'; note.setAttribute('role', 'status'); note.setAttribute('aria-live', 'polite');
    const button = document.createElement('button'); button.id = 'order-payment-start'; button.type = 'button'; button.className = 'button button-primary'; button.textContent = 'Continuar para pagamento'; button.addEventListener('click', () => void start());
    const link = document.createElement('a'); link.id = 'order-payment-link'; link.className = 'button button-primary'; link.textContent = 'Abrir pagamento no Mercado Pago'; link.hidden = true; link.rel = 'noopener noreferrer'; link.referrerPolicy = 'no-referrer';
    area.append(title, note, button, link); const anchor = receipt.querySelector('.order-actions'); if (anchor) anchor.before(area); else receipt.append(area);
    return area;
  }

  function refreshReceipt() {
    const order = window.BrasaCommerce?.activeOrder;
    const area = receiptArea(); if (!area) return;
    area.hidden = order?.payment?.online !== true;
    if (area.hidden) return;
    const note = $('order-payment-note'), button = $('order-payment-start'), link = $('order-payment-link');
    if (paymentOrderId !== order.id) { paymentOrderId = order.id; if (link) { link.hidden = true; link.removeAttribute('href'); } }
    if (order.payment.reconciliationRequired === true) {
      if (button) button.hidden = true;
      if (link) { link.hidden = true; link.removeAttribute('href'); }
      if (note) note.textContent = 'O pagamento precisa ser conferido pela loja. Consulte o atendimento antes de tentar pagar novamente.';
      return;
    }
    const awaiting = order.status === 'awaiting_payment';
    if (!config.enabled && link) { link.hidden = true; link.removeAttribute('href'); }
    const prepared = link && !link.hidden && safeCheckoutUrl(link.getAttribute('href'));
    if (button) { button.hidden = !awaiting || prepared; button.disabled = busy || !config.enabled; button.textContent = busy ? 'Preparando pagamento…' : 'Continuar para pagamento'; }
    if (!awaiting) {
      if (link) { link.hidden = true; link.removeAttribute('href'); }
      if (note) note.textContent = order.status === 'cancelled' ? 'Pedido cancelado. Se você já pagou, consulte a loja sobre a conferência do pagamento e o reembolso.' : ['refunded', 'charged_back'].includes(order.payment.status) ? 'O provedor informou uma alteração no pagamento. Consulte a loja para conferir o pedido.' : order.payment.status === 'approved' ? 'Pagamento confirmado pelo provedor. Acompanhe o pedido.' : 'Consulte o status do pedido para acompanhar a confirmação do pagamento.';
    }
    else if (!busy && note) note.textContent = prepared ? 'Pagamento preparado. Continue no Mercado Pago; a confirmação será feita pelo provedor.' : config.enabled ? 'Este pedido aguarda pagamento. Voltar do Mercado Pago não confirma a cobrança: aguarde a validação do provedor.' : config.reason || 'Pagamento online indisponível.';
  }

  async function start() {
    const commerce = window.BrasaCommerce, order = commerce?.activeOrder;
    if (busy || !config.enabled || order?.status !== 'awaiting_payment' || order.payment?.online !== true || !order.token || typeof commerce.api !== 'function') return;
    busy = true; refreshReceipt();
    try {
      const response = await commerce.api(`/orders/${encodeURIComponent(order.id)}/payment`, { method: 'POST', headers: { 'X-Order-Token': order.token }, body: '{}' });
      if (!config.enabled || commerce.activeOrder?.id !== order.id || commerce.activeOrder?.status !== 'awaiting_payment') return;
      const payment = response.payment;
      if (!payment || payment.provider !== 'mercadopago' || typeof payment.preferenceId !== 'string' || !safeCheckoutUrl(payment.url, payment.preferenceId)) throw new Error('O servidor não retornou um endereço de pagamento válido.');
      const link = $('order-payment-link'); if (link) { link.href = payment.url; link.hidden = false; }
      if ($('order-payment-note')) $('order-payment-note').textContent = 'Pagamento preparado. Continue no Mercado Pago; os dados do cartão ficam no ambiente do provedor.';
      if ($('order-payment-start')) $('order-payment-start').hidden = true;
    } catch (error) {
      if (commerce.activeOrder?.id === order.id && $('order-payment-note')) $('order-payment-note').textContent = error?.http ? error.message : 'Não conseguimos preparar o pagamento. Consulte seu pedido antes de tentar novamente.';
    } finally { busy = false; if ($('order-payment-start')) $('order-payment-start').disabled = !config.enabled; }
  }

  function refresh(next) {
    configVersion += 1;
    const demo = window.BRASA_DATA?.store?.demo !== false;
    config = next && typeof next === 'object' ? { enabled: !demo && next.enabled === true && next.provider === 'mercadopago' && next.mode === 'production', reason: typeof next.reason === 'string' ? next.reason.slice(0, 300) : '' } : { enabled: false, reason: '' };
    if (demo) config.reason = 'Pagamento online indisponível na demonstração. Nenhum valor será cobrado.';
    syncChoice(); refreshReceipt();
  }

  async function load() {
    if (loading || typeof window.BrasaCommerce?.api !== 'function' || !['http:', 'https:'].includes(location.protocol)) return;
    loading = true; const version = configVersion;
    try { const shop = await window.BrasaCommerce.api('/shop'); if (version === configVersion) refresh(shop.payments); }
    catch { if (version === configVersion) refresh(null); }
    finally { loading = false; }
  }

  function handleReturn() {
    if (new URL(location.href).searchParams.get('payment') !== 'return') return;
    // The return URL only opens an authorized consultation; it cannot approve payment.
    if (window.BrasaCommerce?.orders?.length && $('orders-open')) $('orders-open').click();
    else {
      const note = document.createElement('p'); note.className = 'payment-return-notice'; note.setAttribute('role', 'status');
      note.textContent = 'Volta do pagamento: consulte Meus pedidos para conferir a confirmação. O retorno, sozinho, não confirma o pagamento.';
      const header = document.querySelector('.site-header'); if (header) header.after(note);
      $('orders-open')?.focus();
    }
  }

  function init() {
    if (initialized) return; initialized = true;
    $('payment-online')?.addEventListener('change', syncChoice); $('payment-receipt')?.addEventListener('change', syncChoice);
    document.addEventListener('brasa:shop-change', event => { const shop = event.detail?.shop || event.detail; if (shop?.payments) refresh(shop.payments); });
    document.addEventListener('brasa:payments-config', event => { if (event.detail?.payments) refresh(event.detail.payments); });
    document.addEventListener('brasa:order-updated', refreshReceipt);
    document.addEventListener('brasa:ready', () => { syncChoice(); void load(); });
    $('checkout-dialog')?.addEventListener('close', refreshReceipt);
    syncChoice(); void load(); handleReturn();
  }
  window.BrasaPayments = Object.freeze({ refresh, syncChoice, safeCheckoutUrl, get onlineSelected() { return config.enabled === true && $('payment-online')?.checked === true; } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
