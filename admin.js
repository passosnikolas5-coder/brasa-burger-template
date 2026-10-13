(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const labels = Object.freeze({ awaiting_payment: 'Aguardando pagamento online', awaiting_confirmation: 'Aguardando confirmação', confirmed: 'Confirmado', preparing: 'Em preparo', ready: 'Pronto para retirada', out_for_delivery: 'Saiu para entrega', completed: 'Concluído', cancelled: 'Cancelado' });
  const products = window.BRASA_DATA?.products || [];
  const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100);
  const date = value => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(value));
  let key = '', orders = [], selected = '', busy = false, requestRevision = 0, shop = null;
  const element = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = String(text); if (className) node.className = className; return node; };
  const statusChip = status => element('span', labels[status] || status, `status-chip status-${Object.hasOwn(labels, status) ? status : 'unknown'}`);
  function feedback(text, error = false) { $('admin-feedback').textContent = text; $('admin-feedback').classList.toggle('error', error); }
  async function api(path, options = {}) {
    const response = await fetch(`/api${path}`, { ...options, cache: 'no-store', headers: { Authorization: `Bearer ${key}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
    let result;
    try { result = await response.json(); } catch { throw new Error('O servidor de pedidos não está disponível. Abra esta página pelo servidor Python da loja.'); }
    if (!response.ok) throw new Error(result.error || 'Não foi possível concluir a operação.');
    return result;
  }
  function metrics() {
    $('metric-total').textContent = orders.length;
    $('metric-pending').textContent = orders.filter(o => o.status === 'awaiting_confirmation').length;
    $('metric-active').textContent = orders.filter(o => ['confirmed', 'preparing', 'ready', 'out_for_delivery'].includes(o.status)).length;
    $('metric-completed').textContent = orders.filter(o => o.status === 'completed').length;
  }
  function renderList() {
    const list = $('orders-list'); list.replaceChildren();
    if (!orders.length) { list.append(element('p', 'Nenhum pedido neste filtro. Os pedidos aparecem aqui depois de serem salvos na loja.', 'empty-list')); return; }
    for (const order of orders) {
      const row = element('button', undefined, `order-row${order.id === selected ? ' selected' : ''}`); row.type = 'button'; row.setAttribute('aria-pressed', String(order.id === selected));
      const top = element('div', undefined, 'row-top'); top.append(element('strong', order.id), element('span', money(order.totals.totalCents)));
      const bottom = element('div', undefined, 'row-bottom'); const time = element('time', date(order.createdAt)); time.dateTime = order.createdAt; bottom.append(statusChip(order.status), time);
      row.append(top, element('span', order.customer.name, 'row-name'), bottom);
      row.addEventListener('click', () => { selected = order.id; renderList(); renderDetail(); }); list.append(row);
    }
  }
  function section(title) { const node = element('div', undefined, 'detail-section'); node.append(element('h4', title)); return node; }
  function appendParagraph(parent, text) { parent.append(element('p', text)); }
  function transitions(order) {
    const next = order.fulfilment === 'pickup' ? 'ready' : 'out_for_delivery';
    const available = ({ awaiting_payment: ['cancelled'], awaiting_confirmation: ['confirmed', 'cancelled'], confirmed: ['preparing', 'cancelled'], preparing: [next, 'cancelled'], ready: ['completed', 'cancelled'], out_for_delivery: ['completed', 'cancelled'] })[order.status] || [];
    if (order.payment?.online && order.payment?.reconciliationRequired) return order.payment.status === 'approved' ? [] : available.filter(status => status === 'cancelled');
    return order.payment?.online && order.payment?.status === 'approved' ? available.filter(status => status !== 'cancelled') : available;
  }
  function renderDetail() {
    const order = orders.find(o => o.id === selected), target = $('order-details'); target.replaceChildren(); $('detail-empty').hidden = Boolean(order); target.hidden = !order;
    if (!order) return;
    const heading = element('div', undefined, 'detail-heading'), headingText = element('div'); headingText.append(element('h3', order.id)); const time = element('time', `Salvo em ${date(order.createdAt)}`); time.dateTime = order.createdAt; headingText.append(time); heading.append(headingText, statusChip(order.status)); target.append(heading);
    const contact = section(order.fulfilment === 'delivery' ? 'Entrega · contato' : 'Retirada · contato'); appendParagraph(contact, order.customer.name); const phone = element('a', order.customer.phone); phone.href = `tel:${String(order.customer.phone).replace(/[^0-9+]/g, '')}`; contact.append(phone);
    if (order.address) { const a = order.address; appendParagraph(contact, `${a.street}, ${a.number}${a.complement ? ` · ${a.complement}` : ''}`); appendParagraph(contact, `${a.neighborhood} · ${a.city} · CEP ${a.cep}`); } target.append(contact);
    const items = section('Itens do pedido');
    for (const item of order.items) {
      const row = element('div', undefined, 'detail-item'), title = element('div', undefined, 'item-title'); title.append(element('span', `${item.quantity}× ${item.name}`), element('span', money(item.lineCents))); row.append(title);
      if (item.extras.length) row.append(element('div', `Adicionais: ${item.extras.map(e => typeof e === 'string' ? e : e.name).join(', ')}`, 'item-meta'));
      if (item.removed.length) row.append(element('div', `Sem: ${item.removed.join(', ')}`, 'item-meta'));
      if (item.bundle) row.append(element('div', `Combo: ${item.bundle.side.name} + ${item.bundle.drink.name} · economia de ${money(item.bundle.discountCents)} por unidade`, 'item-meta'));
      if (item.note) row.append(element('div', `Observação: ${item.note}`, 'item-meta')); items.append(row);
    } target.append(items);
    const payment = section(order.payment.online ? 'Pagamento online' : 'Forma combinada de pagamento'); appendParagraph(payment, order.payment.online ? `Provedor: Mercado Pago · situação: ${order.payment.status === 'approved' ? 'aprovado pelo provedor' : order.payment.status || 'aguardando pagamento'}` : ({ pix: 'Pix na retirada ou entrega', card: 'Cartão na retirada ou entrega', cash: 'Dinheiro na retirada ou entrega' })[order.payment.method] || order.payment.method);
    if (order.payment.changeForCents !== null) appendParagraph(payment, `Troco para ${money(order.payment.changeForCents)} · devolver ${money(order.payment.changeForCents - order.totals.totalCents)}`);
    if (!order.payment.online) appendParagraph(payment, 'Pagamento não cobrado por este site.');
    if (order.payment.reconciliationRequired) appendParagraph(payment, 'Este pagamento exige reconciliação no provedor. Verifique aprovação tardia, pagamento duplicado ou estorno antes de qualquer ação.');
    if (order.note) appendParagraph(payment, `Observação geral: ${order.note}`); target.append(payment);
    const totals = element('div', undefined, 'totals');
    for (const [name, amount, strong] of [['Subtotal', order.totals.subtotalCents], ['Cupom', -order.totals.discountCents], ['Recompensa', -(order.totals.rewardCents || 0)], ['Entrega', order.totals.deliveryCents], ['Total', order.totals.totalCents, true]]) { const line = element('div', undefined, `total-line${strong ? ' strong' : ''}`); line.append(element('span', name), element('span', money(amount))); totals.append(line); } target.append(totals);
    if (order.estimate) target.append(element('p', `Previsão no envio: ${order.estimate}`, 'field-help'));
    const available = transitions(order), actions = element('div', undefined, 'status-actions');
    if (!available.length) { appendParagraph(actions, order.payment?.reconciliationRequired ? 'Atendimento pausado para conferência do pagamento no provedor.' : `Pedido ${labels[order.status].toLowerCase()}. Não há próxima etapa.`); target.append(actions); return; }
    const label = element('label', 'Próxima etapa'); label.htmlFor = 'next-status'; const select = element('select'); select.id = 'next-status'; const prompt = element('option', 'Escolha a próxima etapa'); prompt.value = ''; select.append(prompt);
    for (const status of available) { const option = element('option', labels[status]); option.value = status; select.append(option); }
    const button = element('button', 'Confirmar mudança', 'button primary'); button.type = 'button'; button.disabled = true;
    select.addEventListener('change', () => { button.disabled = !select.value || busy; }); button.addEventListener('click', () => { void changeStatus(order.id, select.value, button); });
    actions.append(label, select, button, element('p', 'Uma ação manual atualiza o status salvo. O pedido não progride automaticamente e não é enviado a uma cozinha real.')); target.append(actions);
  }
  async function loadOrders(authenticating = false) {
    const revision = ++requestRevision; busy = true; $('refresh-orders').disabled = true; $('auth-submit').disabled = true;
    try {
      const filter = $('status-filter').value;
      const [result, newShop, measurement, reviews] = await Promise.all([api(`/admin/orders${filter ? `?status=${encodeURIComponent(filter)}` : ''}`), api('/admin/shop'), api('/admin/metrics'), api('/admin/reviews')]);
      if (revision !== requestRevision || !key) return;
      orders = result.orders; if (!orders.some(o => o.id === selected)) selected = orders[0]?.id || '';
      $('auth-panel').hidden = true; $('dashboard').hidden = false; $('updated-at').textContent = `Atualizado em ${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date())} · ${filter ? 'filtro aplicado' : 'todos os status'}`;
      shop = newShop; metrics(); renderList(); renderDetail(); renderOperations(); renderMeasurement(measurement); renderReviews(reviews.reviews);
      feedback(authenticating ? 'Acesso aberto. Operação, resultados e pedidos atualizados.' : 'Painel atualizado.'); $('admin-key').value = '';
    } catch (error) { feedback(error.message, true); if (authenticating) key = ''; }
    finally { if (revision === requestRevision) { busy = false; $('refresh-orders').disabled = false; $('auth-submit').disabled = false; } }
  }
  async function changeStatus(orderId, status, button) {
    if (busy || !status) return;
    if (status === 'cancelled' && !window.confirm('Cancelar este pedido demonstrativo? Essa etapa encerra o pedido e não pode ser desfeita no painel.')) return;
    busy = true; button.disabled = true;
    try { await api(`/admin/orders/${encodeURIComponent(orderId)}`, { method: 'PATCH', body: JSON.stringify({ status }) }); busy = false; await loadOrders(); feedback('Status salvo. O cliente vê a mudança ao atualizar o acompanhamento.'); }
    catch (error) { feedback(error.message, true); busy = false; button.disabled = false; }
  }
  function renderOperations() {
    if (!shop) return;
    $('accepting-orders').checked = shop.operations.acceptingOrders;
    $('extra-minutes').value = shop.operations.extraMinutes;
    const paused = $('paused-products'); paused.replaceChildren();
    for (const product of products) {
      const label = element('label', undefined, 'check-control'), checkbox = element('input');
      checkbox.type = 'checkbox'; checkbox.name = 'pausedProductIds'; checkbox.value = product.id; checkbox.checked = shop.operations.pausedProductIds.includes(product.id);
      label.append(checkbox, element('span', product.name)); paused.append(label);
    }
    const count = Object.keys(shop.media.productImages).length;
    $('media-status').textContent = `${count} foto${count === 1 ? '' : 's'} própria${count === 1 ? '' : 's'} cadastrada${count === 1 ? '' : 's'}${shop.media.kitchenVideo ? ' · vídeo da cozinha cadastrado' : ' · sem vídeo próprio'}.`;
  }
  function renderMeasurement(value) {
    const target = $('business-metrics'); target.replaceChildren();
    for (const [name, amount] of [['Visitas à página', value.events.visit], ['Adições à sacola', value.events.cart], ['Aberturas da finalização', value.events.checkout], ['Pedidos concluídos', value.orders.completed], ['Valor de pedidos concluídos', money(value.completedSalesCents)]]) {
      const card = element('div'); card.append(element('span', name), element('strong', amount)); target.append(card);
    }
    const ratios = value.ratios;
    const ratio = amount => amount === null ? 'sem base para calcular' : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(amount * 100)}%`;
    $('measurement-note').textContent = `${value.scope} Adições por visita: ${ratio(ratios.cartPerVisit)}. Aberturas da finalização por adição: ${ratio(ratios.checkoutPerCart)}. Uma pessoa pode repetir ações; estes números não são uma taxa de conversão por cliente. Valores demonstrativos não representam recebimento ou margem.`;
    const popular = $('popular-products'); popular.replaceChildren();
    if (!value.popularProducts.length) popular.append(element('li', 'Os produtos aparecem aqui após a conclusão de pedidos.'));
    for (const item of value.popularProducts) popular.append(element('li', `${item.name} · ${item.quantity} unidade${item.quantity === 1 ? '' : 's'}`));
  }
  function renderReviews(reviews) {
    const target = $('reviews-list'); target.replaceChildren();
    if (!reviews.length) { target.append(element('p', 'Ainda não há avaliações enviadas por pedidos concluídos.', 'field-help')); return; }
    for (const review of reviews) {
      const card = element('article', undefined, 'admin-review');
      card.append(element('h3', `${review.displayName} · ${review.rating}/5`), element('p', `${review.orderId} · ${date(review.createdAt)} · ${review.published ? 'Publicada' : 'Aguardando revisão'}`, 'field-help'));
      card.append(element('p', `Sabor ${review.flavor}/5 · Embalagem ${review.packaging}/5 · Atendimento ${review.service}/5`, 'field-help'));
      card.append(element('p', review.comment || 'Sem comentário escrito.', 'review-comment'));
      const button = element('button', review.published ? 'Retirar da publicação' : 'Publicar avaliação', 'button secondary'); button.type = 'button';
      button.addEventListener('click', async () => {
        const access = key; button.disabled = true;
        try { await api(`/admin/reviews/${encodeURIComponent(review.id)}`, { method: 'PATCH', body: JSON.stringify({ published: !review.published }) }); if (access !== key) return; const result = await api('/admin/reviews'); if (access !== key) return; renderReviews(result.reviews); feedback('Publicação da avaliação atualizada.'); }
        catch (error) { feedback(error.message, true); button.disabled = false; }
      }); card.append(button); target.append(card);
    }
  }
  function fileBase64(file) {
    return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.')); reader.readAsDataURL(file); });
  }
  async function productPhoto(file) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) throw new Error('Escolha uma fotografia JPG, PNG ou WebP de até 20 MB.');
    let bitmap;
    try { bitmap = await createImageBitmap(file); } catch { throw new Error('Não foi possível abrir essa fotografia.'); }
    try {
      const scale = Math.min(1, 1254 / Math.max(bitmap.width, bitmap.height)), canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d'); if (!context) throw new Error('O navegador não conseguiu preparar a fotografia.');
      context.imageSmoothingQuality = 'high'; context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .94));
      if (!blob || blob.type !== 'image/webp') throw new Error('Este navegador não suporta conversão para WebP.');
      return { kind: 'product', productId: $('media-product').value, mime: 'image/webp', data: await fileBase64(blob), width: canvas.width, height: canvas.height };
    } finally { bitmap.close(); }
  }
  async function kitchenVideo(file) {
    if (file.type !== 'video/mp4' || file.size > 24 * 1024 * 1024) throw new Error('Escolha um vídeo MP4 de até 24 MB.');
    const url = URL.createObjectURL(file), video = document.createElement('video'); video.preload = 'metadata';
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Não foi possível conferir o vídeo.')), 10000);
        video.onloadedmetadata = () => { clearTimeout(timeout); video.videoWidth && video.videoHeight ? resolve() : reject(new Error('O arquivo precisa conter vídeo.')); };
        video.onerror = () => { clearTimeout(timeout); reject(new Error('Não foi possível abrir o vídeo MP4.')); }; video.src = url;
      });
      return { kind: 'kitchen', mime: 'video/mp4', data: await fileBase64(file) };
    } finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
  }
  $('operations-form').addEventListener('submit', async event => {
    event.preventDefault(); const access = key, button = $('save-operations'); if (!access || button.disabled) return; button.disabled = true;
    try {
      const pausedProductIds = Array.from($('paused-products').querySelectorAll('input:checked'), input => input.value);
      const result = await api('/admin/shop', { method: 'PATCH', body: JSON.stringify({ acceptingOrders: $('accepting-orders').checked, extraMinutes: Number($('extra-minutes').value), pausedProductIds }) });
      if (access !== key) return; shop = result; renderOperations(); feedback('Operação salva. Novos pedidos usam a disponibilidade e a previsão atualizadas.');
    } catch (error) { feedback(error.message, true); } finally { button.disabled = false; }
  });
  for (const product of products) { const option = element('option', product.name); option.value = product.id; $('media-product').append(option); }
  $('media-kind').addEventListener('change', () => {
    const kitchen = $('media-kind').value === 'kitchen'; $('media-product-label').hidden = kitchen; $('media-file').value = ''; $('media-file').accept = kitchen ? 'video/mp4' : 'image/jpeg,image/png,image/webp';
    $('media-help').textContent = kitchen ? 'Envie um vídeo MP4 de até 24 MB, gravado na sua cozinha. Ele aparece em uma seção própria, sem substituir os capítulos do filme demonstrativo.' : 'A foto será convertida para WebP com até 1.254 pixels, mantendo a proporção. Use uma foto do produto que você vende. Não enviamos o arquivo a terceiros.';
  });
  $('media-form').addEventListener('submit', async event => {
    event.preventDefault(); const access = key, button = $('upload-media'), file = $('media-file').files[0]; if (!access || !file || button.disabled) return; button.disabled = true; $('media-status').textContent = 'Preparando o arquivo…';
    try {
      const payload = await ($('media-kind').value === 'kitchen' ? kitchenVideo(file) : productPhoto(file));
      if (access !== key) return; await api('/admin/media', { method: 'POST', body: JSON.stringify(payload) });
      if (access !== key) return; shop = await api('/admin/shop'); if (access !== key) return; renderOperations(); $('media-file').value = ''; feedback('Material próprio cadastrado. A loja usa a foto ou o vídeo na próxima atualização.');
    } catch (error) { $('media-status').textContent = error.message; feedback(error.message, true); } finally { button.disabled = false; }
  });
  $('auth-form').addEventListener('submit', event => { event.preventDefault(); if (busy) return; key = $('admin-key').value.trim(); void loadOrders(true); });
  $('refresh-orders').addEventListener('click', () => { if (!busy) void loadOrders(); }); $('status-filter').addEventListener('change', () => { void loadOrders(); });
  $('logout').addEventListener('click', () => { key = ''; orders = []; selected = ''; shop = null; requestRevision++; busy = false; $('orders-list').replaceChildren(); $('order-details').replaceChildren(); $('reviews-list').replaceChildren(); $('dashboard').hidden = true; $('auth-panel').hidden = false; $('admin-key').value = ''; $('auth-submit').disabled = false; feedback('Acesso encerrado nesta página.'); $('admin-key').focus(); });
})();
