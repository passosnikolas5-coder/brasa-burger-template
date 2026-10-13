/* Experiência da loja. Só as faixas de CEP têm simulação offline; avaliações e
   fidelidade sempre consultam o servidor com a chave privada do pedido. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const store = window.BRASA_DATA?.store || {};
  const money = cents => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(cents) || 0) / 100);
  const digits = value => String(value || '').replace(/\D/g, '');
  const formattedCep = value => digits(value).slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');
  const node = (tag, className, text) => { const result = document.createElement(tag); if (className) result.className = className; if (text !== undefined) result.textContent = text; return result; };
  const commerce = () => window.BrasaCommerce;
  const isWeb = () => window.BRASA_STATIC_DEMO !== true && ['http:', 'https:'].includes(location.protocol);
  const api = (path, options) => { if (!isWeb() || !commerce()?.api) return Promise.reject(new Error('Servidor indisponível.')); return commerce().api(path, options); };
  let ready = false, currentQuote = null, selectedQuote = false, deliveryGeneration = 0, loyaltyGeneration = 0, reviewGeneration = 0;
  let latestShop = null, shopBusy = false, reviewOwner = null, loyaltyOwner = null, reviewSending = false, modalOpener = null, picksSignature = '', orderSelectSignature = '';
  const eventJobs = new Map();

  function references() {
    const saved = commerce()?.orders;
    return Array.isArray(saved) ? saved.filter(ref => ref && typeof ref.id === 'string' && typeof ref.token === 'string') : [];
  }
  function ownReference(id) { return references().find(ref => ref.id === id); }
  function markStatus(id, text, error = false) { const el = $(id); if (!el) return; el.textContent = text; el.classList.toggle('is-error', error); }
  function demoZones() { return Array.isArray(store.delivery?.zones) ? store.delivery.zones : []; }
  function quoteMatches(quote, cep) {
    return quote && typeof quote.served === 'boolean' && digits(quote.cep) === cep && (!quote.served || quote.zone && typeof quote.zone.neighborhood === 'string' && Number.isSafeInteger(quote.zone.feeCents) && quote.zone.feeCents >= 0 && typeof quote.zone.estimate === 'string');
  }
  function invalidateQuote(message = '') {
    deliveryGeneration++; currentQuote = null; selectedQuote = false;
    if ($('delivery-result')) $('delivery-result').hidden = true;
    $('delivery-use') && ($('delivery-use').textContent = 'Usar esta entrega');
    commerce()?.setDeliveryQuote?.(null);
    document.dispatchEvent(new CustomEvent('brasa:delivery-change', { detail: { quote: null } }));
    if (message) markStatus('delivery-feedback', message);
    markStatus('checkout-delivery-feedback', message);
  }
  function localQuote(cep) {
    if (store.demo !== true) return null;
    const zone = demoZones().find(item => cep >= item.cepStart && cep <= item.cepEnd);
    return { demo: true, simulated: true, cep, served: Boolean(zone), zone: zone ? { ...zone, minSubtotalCents: store.delivery?.minSubtotalCents || 2000 } : null };
  }
  function displayQuote(quote) {
    currentQuote = quote;
    if (!quote.served) { $('delivery-result').hidden = true; markStatus('delivery-feedback', `${quote.simulated ? 'Simulação offline. ' : ''}Este CEP fica fora da área atendida${quote.demo ? ' nesta demonstração' : ''}. Você pode escolher retirada na loja.`, true); return; }
    const zone = quote.zone;
    $('delivery-zone').textContent = `${zone.neighborhood}${quote.demo ? ' · região de demonstração' : ''}`;
    $('delivery-price-time').textContent = `${money(zone.feeCents)} de entrega · ${zone.estimate}`;
    $('delivery-minimum').textContent = `Pedido mínimo de ${money(zone.minSubtotalCents ?? store.delivery?.minSubtotalCents ?? 0)} em produtos. Prazo estimado após a confirmação.`;
    $('delivery-result').hidden = false;
    markStatus('delivery-feedback', quote.simulated ? 'Simulação offline pelas faixas de CEP da demonstração. Consulte novamente quando o servidor estiver disponível.' : 'Entrega disponível para este CEP.');
  }
  async function consultDelivery(value = $('delivery-cep')?.value, { keepSelection = false } = {}) {
    const cep = digits(value), wantedSelection = keepSelection && selectedQuote;
    invalidateQuote();
    const generation = deliveryGeneration;
    if (!/^\d{8}$/.test(cep) || cep === '00000000') { markStatus('delivery-feedback', 'Informe os 8 números de um CEP válido.', true); $('delivery-cep')?.setAttribute('aria-invalid', 'true'); return null; }
    $('delivery-cep')?.removeAttribute('aria-invalid');
    if ($('delivery-cep')) $('delivery-cep').value = formattedCep(cep);
    $('delivery-form')?.setAttribute('aria-busy', 'true');
    if ($('delivery-submit')) { $('delivery-submit').disabled = true; $('delivery-submit').textContent = 'Consultando…'; }
    markStatus('delivery-feedback', 'Consultando região, taxa e prazo…');
    try {
      let result;
      try { result = await api(`/delivery?cep=${encodeURIComponent(cep)}`); }
      catch (error) { if (error.http && error.http !== 404) throw error; result = localQuote(cep); if (!result) throw error; }
      if (generation !== deliveryGeneration) return null;
      if (!quoteMatches(result, cep)) throw new Error('Não foi possível validar a consulta de entrega.');
      displayQuote(result);
      if (wantedSelection && result.served) selectDelivery(false);
      return result;
    } catch (error) {
      if (generation === deliveryGeneration) markStatus('delivery-feedback', error.http ? error.message : 'Não foi possível consultar a entrega. Verifique a conexão e tente novamente.', true);
      return null;
    } finally {
      if (generation === deliveryGeneration) { $('delivery-form')?.removeAttribute('aria-busy'); if ($('delivery-submit')) { $('delivery-submit').disabled = false; $('delivery-submit').textContent = 'Consultar entrega'; } }
    }
  }
  function selectDelivery(moveToMenu = true) {
    if (!currentQuote?.served) return;
    selectedQuote = true;
    commerce()?.setDeliveryQuote?.(currentQuote);
    const fields = { 'address-cep': formattedCep(currentQuote.cep), 'address-neighborhood': currentQuote.zone.neighborhood, 'address-city': store.address?.city || '', fulfilment: 'delivery' };
    for (const [id, value] of Object.entries(fields)) { const field = $(id); if (field) { field.value = value; field.dispatchEvent(new Event('change', { bubbles: true })); } }
    document.dispatchEvent(new CustomEvent('brasa:delivery-change', { detail: { quote: { ...currentQuote } } }));
    $('delivery-use').textContent = 'Entrega selecionada';
    markStatus('delivery-feedback', `${currentQuote.simulated ? 'Simulação. ' : ''}Entrega selecionada. Taxa e região já aparecem na sacola; complete a rua e o número ao concluir.`);
    if (moveToMenu) { const target = $('cardapio'); target?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); }
  }

  function uploadedPhoto(id) {
    const photo = latestShop?.media?.productImages?.[id];
    return photo && typeof photo.src === 'string' ? photo : null;
  }
  function photoFor(item, sizes = '(max-width:760px) 115px, (max-width:1080px) 30vw, 410px') {
    const photo = uploadedPhoto(item.id) || item.photo || {};
    const image = node('img', 'experience-product-image'); image.alt = ''; image.loading = 'lazy'; image.decoding = 'async';
    image.width = photo.width || 1254; image.height = photo.height || 1254;
    image.src = photo.smallSrc || photo.src || '';
    if (photo.smallSrc && photo.src) { image.srcset = `${photo.smallSrc} 640w, ${photo.src} ${photo.width || 1254}w`; image.sizes = sizes; }
    return image;
  }
  function renderPicks() {
    const target = $('quick-picks-grid'); if (!target) return;
    const entries = [['brasa-classico', 'O clássico'], ['bacon-brasa', 'Para muita fome'], ['jardim-veggie', 'Vegetariano']];
    const paused = latestShop?.operations?.pausedProductIds || [], accepting = latestShop?.operations?.acceptingOrders !== false;
    const signature = JSON.stringify([paused, accepting, entries.map(([id]) => { const item = commerce()?.products?.find(product => product.id === id); return item ? [item.id, item.name, item.price, item.description, uploadedPhoto(id) || item.photo] : null; })]);
    if (signature === picksSignature) return;
    picksSignature = signature;
    const fragment = document.createDocumentFragment();
    entries.forEach(([id, label]) => {
      const product = commerce()?.products?.find(item => item.id === id); if (!product) return;
      const unavailable = !accepting || paused.includes(id), card = node('article', `quick-pick${unavailable ? ' is-unavailable' : ''}`), photo = node('div', 'quick-pick-photo'), copy = node('div', 'quick-pick-copy');
      photo.append(photoFor(product)); copy.append(node('p', 'quick-pick-label', label), node('h3', '', product.name), node('p', 'quick-pick-description', product.description));
      const bottom = node('div', 'quick-pick-bottom'), button = node('button', 'button button-primary', unavailable ? !accepting ? 'Pedidos pausados' : 'Esgotado hoje' : 'Escolher este burger');
      button.type = 'button'; button.disabled = unavailable; button.dataset.pickProduct = id; button.setAttribute('aria-label', unavailable ? `${product.name}: indisponível` : `Personalizar ${product.name}`);
      button.addEventListener('click', () => commerce()?.openProduct?.(id, button)); bottom.append(node('strong', 'quick-pick-price', money(product.price)), button); copy.append(bottom); card.append(photo, copy); fragment.append(card);
    });
    target.replaceChildren(fragment);
  }
  function renderKitchen(shop) {
    const source = shop?.media?.kitchenVideo, wrapper = $('nossa-cozinha'), video = $('own-kitchen-video'); if (!wrapper || !video) return;
    let safe = false;
    if (typeof source === 'string') { try { const url = new URL(source, location.href); safe = url.origin === location.origin && /\/assets\/uploads\/[a-zA-Z0-9_-]+\.mp4$/.test(url.pathname); } catch { safe = false; } }
    wrapper.hidden = !safe;
    if (!safe) { video.pause(); video.removeAttribute('src'); video.dataset.currentSource = ''; return; }
    if (video.dataset.currentSource !== source) { video.src = source; video.dataset.currentSource = source; }
  }
  async function refreshShop() {
    if (shopBusy || !isWeb() || document.hidden) return;
    shopBusy = true;
    try {
      const shop = await api('/shop');
      if (!shop || typeof shop.operations !== 'object') return;
      const previousOperations = JSON.stringify(latestShop?.operations), nextOperations = JSON.stringify(shop.operations);
      latestShop = shop; commerce()?.refreshShop?.(shop); renderPicks(); renderKitchen(shop); renderLoyaltyRule(shop.loyalty);
      if (previousOperations !== nextOperations && currentQuote?.served) void consultDelivery(currentQuote.cep, { keepSelection: selectedQuote });
    } catch { /* Existing content remains usable when the operation cannot be refreshed. */ }
    finally { shopBusy = false; }
  }

  async function loadReviews() {
    if (!$('reviews-list')) return;
    try {
      const response = await api('/reviews');
      if (!Array.isArray(response.reviews)) throw new Error('Avaliações indisponíveis.');
      const fragment = document.createDocumentFragment();
      response.reviews.slice(0, 12).forEach(review => {
        if (!Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5) return;
        const article = node('article', 'customer-review'), heading = node('div', 'customer-review-header');
        heading.append(node('strong', '', typeof review.displayName === 'string' ? review.displayName.slice(0, 40) : 'Cliente'), node('span', '', `${review.rating} de 5`)); article.append(heading);
        if (typeof review.comment === 'string' && review.comment) article.append(node('p', '', review.comment.slice(0, 600)));
        const meta = node('div', 'customer-review-meta');
        [['flavor', 'Sabor'], ['packaging', 'Embalagem'], ['service', 'Atendimento']].forEach(([key, title]) => { if (Number.isInteger(review[key]) && review[key] >= 1 && review[key] <= 5) meta.append(node('span', '', `${title} ${review[key]}/5`)); });
        const date = new Date(review.createdAt); if (!Number.isNaN(date.getTime())) meta.append(node('time', '', new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: store.timezone || 'America/Sao_Paulo' }).format(date)));
        article.append(meta); fragment.append(article);
      });
      const count = fragment.childElementCount; $('reviews-list').replaceChildren(fragment);
      markStatus('reviews-status', count ? `${Number.isSafeInteger(response.count) ? response.count : count} ${response.count === 1 ? 'avaliação publicada' : 'avaliações publicadas'}${response.demo ? ' na demonstração' : ''}.` : 'Ainda não há avaliações publicadas.');
    } catch { markStatus('reviews-status', isWeb() ? 'As avaliações não puderam ser consultadas agora. Tente novamente mais tarde.' : 'As avaliações ficam disponíveis quando a loja estiver conectada ao servidor.'); }
  }
  function populateOrderSelects() {
    const refs = references();
    const signature = JSON.stringify(refs.map(ref => [ref.id, ref.token]));
    if (signature === orderSelectSignature) return;
    orderSelectSignature = signature;
    for (const id of ['loyalty-order', 'review-order']) {
      if (id === 'review-order' && reviewSending) continue;
      const select = $(id); if (!select) continue; const previous = select.value, fragment = document.createDocumentFragment();
      const placeholder = node('option', '', refs.length ? 'Selecione um pedido deste navegador' : 'Nenhum pedido salvo neste navegador'); placeholder.value = ''; fragment.append(placeholder);
      refs.forEach(ref => { const option = node('option', '', `Pedido ${ref.id}`); option.value = ref.id; fragment.append(option); });
      select.replaceChildren(fragment); if (refs.some(ref => ref.id === previous)) select.value = previous;
    }
    if ($('loyalty-consult')) $('loyalty-consult').disabled = !refs.length;
    if ($('review-check') && !reviewSending) $('review-check').disabled = !refs.length;
  }
  function renderLoyaltyRule(rules = latestShop?.loyalty || store.loyalty) {
    const required = Number.isSafeInteger(rules?.ordersForReward) && rules.ordersForReward > 0 ? rules.ordersForReward : 5;
    const reward = Number.isSafeInteger(rules?.rewardCents) && rules.rewardCents > 0 ? rules.rewardCents : 1290;
    if ($('loyalty-rule')) $('loyalty-rule').textContent = `A cada ${required} pedidos concluídos, receba ${money(reward)} de benefício no próximo pedido.`;
    if ($('loyalty-demo')) { $('loyalty-demo').textContent = store.demo ? 'Clube de demonstração. Pedidos cancelados não contam.' : 'Pedidos cancelados não contam.'; }
  }
  async function consultLoyalty(event) {
    event?.preventDefault(); const ref = ownReference($('loyalty-order')?.value), generation = ++loyaltyGeneration;
    loyaltyOwner = null; $('loyalty-result').hidden = true; $('loyalty-apply').hidden = true;
    if (!ref) { markStatus('loyalty-status', 'Selecione um pedido seu que esteja salvo neste navegador.'); return; }
    $('loyalty-consult').disabled = true; markStatus('loyalty-status', 'Consultando seus pedidos concluídos…');
    try {
      const result = await api(`/orders/${encodeURIComponent(ref.id)}/loyalty`, { headers: { 'X-Order-Token': ref.token } });
      if (generation !== loyaltyGeneration) return;
      if (!['completedOrders', 'ordersForReward', 'rewardCents', 'availableRewards', 'redeemedRewards', 'progress'].every(key => Number.isSafeInteger(result[key]) && result[key] >= 0) || !result.ordersForReward) throw new Error('Progresso inválido.');
      loyaltyOwner = ref; renderLoyaltyRule(result);
      $('loyalty-progress').max = result.ordersForReward; $('loyalty-progress').value = Math.min(result.progress, result.ordersForReward);
      $('loyalty-progress-text').textContent = `${result.completedOrders} ${result.completedOrders === 1 ? 'pedido concluído' : 'pedidos concluídos'} · ${result.progress} de ${result.ordersForReward} para o próximo benefício.`;
      $('loyalty-result').hidden = false;
      if (result.availableRewards > 0) { $('loyalty-apply').hidden = false; $('loyalty-apply').textContent = `Usar ${money(result.rewardCents)} no próximo pedido`; markStatus('loyalty-status', `${result.availableRewards} ${result.availableRewards === 1 ? 'benefício disponível' : 'benefícios disponíveis'}${result.demo ? ' na demonstração' : ''}.`); }
      else markStatus('loyalty-status', `Faltam ${result.ordersForReward - result.progress} pedidos concluídos para liberar o próximo benefício${result.demo ? ' de demonstração' : ''}.`);
    } catch (error) { if (generation === loyaltyGeneration) markStatus('loyalty-status', error.http ? error.message : 'Não foi possível consultar seu benefício. O progresso não foi alterado.'); }
    finally { if (generation === loyaltyGeneration) $('loyalty-consult').disabled = false; }
  }
  async function applyLoyalty() {
    if (!loyaltyOwner || !commerce()?.applyReward) return;
    if (!commerce().cart?.length) { markStatus('loyalty-status', 'Escolha um item no cardápio antes de usar seu benefício.'); return; }
    $('loyalty-apply').disabled = true;
    try {
      const applied = await commerce().applyReward(loyaltyOwner.id, loyaltyOwner.token);
      if (applied === false) { markStatus('loyalty-status', 'Não foi possível selecionar o benefício. Confira sua sacola e tente novamente.'); return; }
      markStatus('loyalty-status', 'Benefício selecionado. Confira o desconto na sacola; a disponibilidade será validada ao concluir.'); commerce()?.openCart?.();
    } catch (error) { markStatus('loyalty-status', error.http ? error.message : 'Não foi possível aplicar o benefício. Tente consultar novamente.'); }
    finally { $('loyalty-apply').disabled = false; }
  }
  function openReview(opener, orderId = '') {
    const dialog = $('review-dialog'); if (!dialog || dialog.open || document.querySelector('dialog[open]')) return;
    modalOpener = opener; populateOrderSelects(); reviewOwner = null; reviewGeneration++;
    $('review-fields').disabled = true; $('review-form').reset();
    if (orderId && ownReference(orderId)) $('review-order').value = orderId;
    markStatus('review-feedback', references().length ? 'Selecione e consulte um pedido concluído para avaliar.' : 'Você ainda não tem pedidos salvos neste navegador. Depois de receber um pedido concluído, volte para avaliar.');
    dialog.showModal(); $('review-title')?.focus(); if ($('review-order').value) void checkReviewOrder();
  }
  async function checkReviewOrder() {
    if (reviewSending) return;
    const ref = ownReference($('review-order')?.value), generation = ++reviewGeneration;
    reviewOwner = null; $('review-fields').disabled = true;
    if (!ref) { markStatus('review-feedback', 'Selecione um pedido salvo neste navegador.'); return; }
    $('review-check').disabled = true; markStatus('review-feedback', 'Consultando a conclusão do pedido…');
    try {
      const result = await api(`/orders/${encodeURIComponent(ref.id)}`, { headers: { 'X-Order-Token': ref.token } });
      if (generation !== reviewGeneration) return;
      if (result.order?.id !== ref.id) throw new Error('Pedido inválido.');
      if (result.order.status !== 'completed') { markStatus('review-feedback', 'A avaliação fica disponível quando a loja marcar este pedido como concluído.'); return; }
      reviewOwner = ref; $('review-fields').disabled = false; markStatus('review-feedback', 'Pedido concluído. Conte como foi a sua experiência.');
    } catch (error) { if (generation === reviewGeneration) markStatus('review-feedback', error.http ? error.message : 'Não foi possível consultar o pedido. Nenhuma avaliação foi enviada.'); }
    finally { if (generation === reviewGeneration) $('review-check').disabled = false; }
  }
  async function submitReview(event) {
    event.preventDefault(); if (!reviewOwner || reviewSending || !$('review-form').reportValidity()) return;
    const form = new FormData($('review-form')), body = { comment: String(form.get('comment') || '').trim() };
    for (const key of ['rating', 'flavor', 'packaging', 'service']) { body[key] = Number(form.get(key)); if (!Number.isInteger(body[key]) || body[key] < 1 || body[key] > 5) return; }
    const ref = reviewOwner; reviewSending = true; $('review-submit').disabled = true; $('review-order').disabled = true; $('review-check').disabled = true; $('review-close').disabled = true;
    markStatus('review-feedback', 'Enviando sua avaliação…');
    try {
      await api(`/orders/${encodeURIComponent(ref.id)}/review`, { method: 'POST', headers: { 'X-Order-Token': ref.token }, body: JSON.stringify(body) });
      reviewOwner = null; $('review-fields').disabled = true; markStatus('review-feedback', 'Avaliação recebida e aguardando moderação. Seu comentário ainda não está publicado.');
    } catch (error) { markStatus('review-feedback', error.http ? error.message : 'Não foi possível confirmar o envio. Consulte novamente antes de tentar outra vez.'); }
    finally { reviewSending = false; $('review-submit').disabled = false; $('review-order').disabled = false; $('review-check').disabled = false; $('review-close').disabled = false; }
  }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128;
    const h = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join(''); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  }
  async function sendEvent(kind) {
    if (!isWeb()) return;
    let job = eventJobs.get(kind);
    if (!job) { const body = { eventId: uuid(), kind }; if (kind === 'cart') { const id = commerce()?.cart?.[0]?.productId; if (commerce()?.products?.some(item => item.id === id)) body.productId = id; } job = { body, sent: false, busy: false, tries: 0 }; eventJobs.set(kind, job); }
    if (job.sent || job.busy || job.tries >= 3) return;
    job.busy = true; job.tries++;
    try { await api('/events', { method: 'POST', body: JSON.stringify(job.body) }); job.sent = true; }
    catch { /* Analytics never block a customer action; the same UUID allows a safe retry. */ }
    finally { job.busy = false; }
  }
  function trackCart() { if (commerce()?.cart?.length) void sendEvent('cart'); }
  function init() {
    if (ready || !commerce()) return; ready = true;
    renderPicks(); populateOrderSelects(); renderLoyaltyRule();
    $('delivery-form')?.addEventListener('submit', event => { event.preventDefault(); void consultDelivery(); });
    $('delivery-cep')?.addEventListener('input', event => { const before = digits(event.target.value); event.target.value = formattedCep(before); invalidateQuote('Consulte este CEP para ver a taxa e o prazo.'); event.target.removeAttribute('aria-invalid'); $('delivery-form').removeAttribute('aria-busy'); $('delivery-submit').disabled = false; $('delivery-submit').textContent = 'Consultar entrega'; });
    $('delivery-use')?.addEventListener('click', () => selectDelivery());
    $('checkout-delivery-check')?.addEventListener('click', async event => {
      const button = event.currentTarget; button.disabled = true;
      markStatus('checkout-delivery-feedback', 'Consultando região, taxa e prazo…');
      try {
        const result = await consultDelivery($('address-cep')?.value);
        if (result?.served) {
          selectDelivery(false);
          markStatus('checkout-delivery-feedback', `Entrega selecionada: ${result.zone.neighborhood}, ${money(result.zone.feeCents)}, ${result.zone.estimate}${result.simulated ? ' (simulação offline)' : ''}.`);
        } else markStatus('checkout-delivery-feedback', $('delivery-feedback')?.textContent || 'Não foi possível consultar a entrega.', true);
      } finally { button.disabled = false; }
    });
    $('address-cep')?.addEventListener('input', event => { const newCep = digits(event.target.value); if (currentQuote && newCep !== currentQuote.cep) { invalidateQuote('O CEP do endereço mudou. Consulte a nova região antes de concluir.'); if ($('delivery-cep')) $('delivery-cep').value = formattedCep(newCep); } });
    $('address-neighborhood')?.addEventListener('change', event => { if (currentQuote?.served && event.target.value !== currentQuote.zone.neighborhood) invalidateQuote('O bairro mudou. Consulte novamente o CEP de entrega.'); });
    $('loyalty-form')?.addEventListener('submit', event => { void consultLoyalty(event); }); $('loyalty-apply')?.addEventListener('click', () => { void applyLoyalty(); });
    $('loyalty-order')?.addEventListener('change', () => { loyaltyGeneration++; loyaltyOwner = null; $('loyalty-result').hidden = true; $('loyalty-consult').disabled = !references().length; markStatus('loyalty-status', 'Consulte este pedido para ver seu benefício.'); });
    $('review-open')?.addEventListener('click', event => openReview(event.currentTarget)); $('review-check')?.addEventListener('click', () => { void checkReviewOrder(); });
    $('review-form')?.addEventListener('submit', event => { void submitReview(event); }); $('review-close')?.addEventListener('click', () => $('review-dialog')?.close());
    $('review-order')?.addEventListener('change', () => { reviewGeneration++; reviewOwner = null; $('review-fields').disabled = true; $('review-check').disabled = !references().length; markStatus('review-feedback', 'Consulte este pedido antes de avaliar.'); });
    $('review-dialog')?.addEventListener('cancel', event => { if (reviewSending) event.preventDefault(); });
    $('review-dialog')?.addEventListener('close', () => { reviewGeneration++; modalOpener?.focus(); });
    $('review-dialog')?.addEventListener('keydown', event => { if (event.key !== 'Tab') return; const fields = Array.from($('review-dialog').querySelectorAll('button,input,select,textarea,a[href]')).filter(el => !el.disabled && !el.closest('fieldset[disabled]') && el.getClientRects().length); if (!fields.length) return; const first = fields[0], last = fields.at(-1); if (event.shiftKey && (document.activeElement === first || document.activeElement === $('review-title'))) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } });
    document.addEventListener('click', event => {
      const ordersButton = event.target.closest('[data-experience-orders]'); if (ordersButton) $('orders-open')?.click();
      const reviewButton = event.target.closest('[data-review-order]'); if (reviewButton) { const id = reviewButton.dataset.reviewOrder; document.querySelector('dialog[open]')?.close(); openReview(reviewButton, id); }
      const loyaltyButton = event.target.closest('[data-loyalty-order]'); if (loyaltyButton) { populateOrderSelects(); if (ownReference(loyaltyButton.dataset.loyaltyOrder)) { $('loyalty-order').value = loyaltyButton.dataset.loyaltyOrder; document.querySelector('dialog[open]')?.close(); $('clientes')?.scrollIntoView({ block: 'start' }); void consultLoyalty(); } }
    });
    document.addEventListener('brasa:cart-change', trackCart);
    document.addEventListener('brasa:order-updated', populateOrderSelects);
    document.addEventListener('brasa:shop-change', event => { const shop = event.detail?.shop || event.detail; if (shop?.operations) { const changed = JSON.stringify(latestShop?.operations) !== JSON.stringify(shop.operations); latestShop = shop; renderPicks(); renderKitchen(shop); renderLoyaltyRule(shop.loyalty); if (changed && currentQuote?.served) void consultDelivery(currentQuote.cep, { keepSelection: selectedQuote }); } });
    const checkout = $('checkout-dialog'); if (checkout) new MutationObserver(() => { if (checkout.open && !commerce()?.activeOrder) void sendEvent('checkout'); }).observe(checkout, { attributes: true, attributeFilter: ['open'] });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { void refreshShop(); eventJobs.forEach((job, kind) => { if (!job.sent) void sendEvent(kind); }); } });
    window.addEventListener('online', () => { void refreshShop(); if (currentQuote?.simulated) void consultDelivery(currentQuote.cep, { keepSelection: selectedQuote }); });
    setInterval(() => { if (!document.hidden) { void refreshShop(); eventJobs.forEach((job, kind) => { if (!job.sent) void sendEvent(kind); }); } }, 45000);
    void refreshShop(); void loadReviews(); void sendEvent('visit'); trackCart();
  }
  window.BrasaExperience = Object.freeze({ get quote() { return currentQuote ? { ...currentQuote, selected: selectedQuote } : null; }, refreshQuote: () => consultDelivery(currentQuote?.cep || $('delivery-cep')?.value, { keepSelection: selectedQuote }), photoFor, openReview });
  document.addEventListener('brasa:ready', init, { once: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
