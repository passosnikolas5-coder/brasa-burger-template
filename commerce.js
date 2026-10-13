(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const KEYS = { cart: 'brasa-burger-cart-v2', oldCart: 'brasa-burger-cart-v1', favorites: 'brasa-burger-favorites-v1', orders: 'brasa-burger-orders-v1', profile: 'brasa-burger-profile-v1', pending: 'brasa-burger-pending-order-v1', fulfilment: 'brasa-burger-fulfilment-v1' };
  const MAX_LINES = 40, MAX_QUANTITY = 99;
  const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const formatMoney = cents => currency.format(cents / 100);
  const text = (value, max = 180) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max) : '';
  const strings = value => Array.isArray(value) ? [...new Set(value.filter(item => typeof item === 'string'))] : typeof value === 'string' ? [value] : [];
  const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const clone = value => JSON.parse(JSON.stringify(value));
  const stored = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage is optional. */ } };
  const forget = key => { try { localStorage.removeItem(key); } catch { /* Storage is optional. */ } };
  const statusNames = { awaiting_payment: 'Aguardando pagamento', awaiting_confirmation: 'Aguardando confirmação', confirmed: 'Confirmado', preparing: 'Em preparo', ready: 'Pronto para retirada', out_for_delivery: 'Saiu para entrega', completed: 'Concluído', cancelled: 'Cancelado' };
  const paymentNames = { pix: 'Pix no recebimento', card: 'Cartão no recebimento', cash: 'Dinheiro no recebimento' };
  let products = [], extras = [], store = {}, cart = [], favorites = new Set(), savedOrders = [], orderCache = new Map();
  let coupon = '', filter = 'all', query = '', sort = 'featured', favoritesOnly = false, selectedProduct = null, editingLine = null;
  let activeOrder = null, submitting = false, apiOnline = false, healthPromise = null, toastTimer, refreshGeneration = 0;
  const dialogTriggers = new WeakMap();
  let checkoutItemsKey='';
  let removedCart = null;
    let deliveryQuote = null, reward = null, shop = null, pollTimer = null, pollBusy = false;
  let operations = { acceptingOrders: true, pausedProductIds: [], extraMinutes: 0 }, media = { productImages: {} };
  const emit = (name, detail = {}) => document.dispatchEvent(new CustomEvent(`brasa:${name}`, { detail }));
  const bundleRule = () => window.BRASA_DATA?.bundles?.[0];
  function validBundle(value, item) {
    const rule = bundleRule();
    return value && rule && value.id === rule.id && rule.categories.includes(item.category) && rule.sideIds.includes(value.sideId) && rule.drinkIds.includes(value.drinkId) && product(value.sideId) && product(value.drinkId)
      ? { id: rule.id, sideId: value.sideId, drinkId: value.drinkId } : null;
  }
  function bundlePrice(value) { return value ? product(value.sideId).price + product(value.drinkId).price - bundleRule().discountCents : 0; }
  function bundleText(value) { return value ? `Combo: ${product(value.sideId)?.name || value.side?.name} + ${product(value.drinkId)?.name || value.drink?.name}` : ''; }
  function isAvailable(value) { const item = typeof value === 'string' ? product(value) : value; return Boolean(item) && !operations.pausedProductIds.includes(item.id); }
  function lineAvailable(item) { return isAvailable(item.productId) && (!item.bundle || isAvailable(item.bundle.sideId) && isAvailable(item.bundle.drinkId)); }
  function selectedBundle() {
    if (!$('product-bundle-enabled')?.checked || !selectedProduct) return null;
    return validBundle({ id: bundleRule()?.id, sideId: $('product-bundle-side')?.value, drinkId: $('product-bundle-drink')?.value }, selectedProduct);
  }
  function node(tag, className, value) { const result = document.createElement(tag); if (className) result.className = className; if (value !== undefined) result.textContent = value; return result; }
  function button(label, className, attributes = {}) { const result = node('button', className, label); result.type = 'button'; Object.entries(attributes).forEach(([key, value]) => result.setAttribute(key, value)); return result; }
  function content(id, value) { if ($(id)) $(id).textContent = value; }
  function show(id, visible) { if ($(id)) $(id).hidden = !visible; }
  function checkoutStatus(message) { content('checkout-status', message); }
  function toast(message) { const target = $('toast'); if (!target) return; clearTimeout(toastTimer); target.textContent = message; target.hidden = false; target.classList.add('is-visible'); toastTimer = setTimeout(() => { target.classList.remove('is-visible'); target.hidden = true; }, 4500); }
  function productFeedback(message, invalidQuantity = false) {
    content('product-feedback', message); show('product-feedback', Boolean(message));
    $('product-quantity')?.setAttribute('aria-invalid', String(invalidQuantity));
  }
  function cartFeedback(message, undoable = false) {
    const target = $('cart-feedback'); if (!target) return;
    target.replaceChildren(node('span', '', message));
    if (undoable && removedCart) target.append(button('Desfazer', 'cart-undo', { id: 'cart-undo', 'aria-label': 'Desfazer última remoção da sacola' }));
    target.hidden = !message;
  }
  function invalidateUndo() { removedCart = null; cartFeedback(''); }
  function undoRemoval() {
    if (!removedCart || submitting) return;
    const snapshot = removedCart; removedCart = null;
    cart = clone(snapshot.items); coupon = snapshot.coupon;
    if ($('cart-coupon')) $('cart-coupon').value = coupon;
    persistCart(); renderCart(); cartFeedback('Remoção desfeita. Seus itens e o cupom foram restaurados.');
    const restored = $('cart-items')?.querySelector(`[data-index="${snapshot.index}"][data-action="${snapshot.action}"]`);
    (restored || $('cart-close'))?.focus({ preventScroll: true });
  }
  function setupFeedback() {
    if ($('product-dialog') && !$('product-feedback')) {
      const feedback = node('p', 'product-feedback'); feedback.id = 'product-feedback'; feedback.hidden = true; feedback.setAttribute('role', 'alert'); feedback.setAttribute('aria-atomic', 'true');
      const bottom = $('product-dialog').querySelector('.product-dialog-bottom'); if (bottom) bottom.before(feedback); else $('product-dialog').append(feedback);
      $('product-quantity')?.setAttribute('aria-describedby', [...new Set(`${$('product-quantity').getAttribute('aria-describedby') || ''} product-feedback`.trim().split(/\s+/))].join(' '));
    }
    if ($('cart-dialog') && !$('cart-feedback')) {
      const feedback = node('p', 'cart-feedback'); feedback.id = 'cart-feedback'; feedback.hidden = true; feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite'); feedback.setAttribute('aria-atomic', 'true');
      const heading = $('cart-dialog').querySelector('.dialog-heading'); if (heading) heading.after(feedback); else $('cart-dialog').prepend(feedback);
    }
  }
  const product = id => products.find(item => item.id === id);
  const extra = id => extras.find(item => item.id === id);
  const lineKey = item => JSON.stringify([item.productId, item.extras, item.removed, item.note, item.bundle || null]);
  const unitPrice = item => product(item.productId).price + item.extras.reduce((sum, id) => sum + extra(id).price, 0) + bundlePrice(item.bundle);
  const quantityCount = () => cart.reduce((sum, item) => sum + item.quantity, 0);
  const fulfilment = () => $('fulfilment')?.value === 'delivery' ? 'delivery' : 'pickup';
  function totals() {
    const subtotalCents = cart.reduce((sum, item) => sum + unitPrice(item) * item.quantity, 0), rule = store.coupon;
    const discountCents = coupon === rule.code && subtotalCents >= rule.minSubtotalCents ? Math.min(rule.maxDiscountCents, Math.floor(subtotalCents * rule.percent / 100)) : 0;
    const rewardCents = reward && !coupon ? Math.min(store.loyalty?.rewardCents || 0, subtotalCents) : 0;
    const deliveryCents = fulfilment() === 'delivery' && cart.length && deliveryQuote?.served ? deliveryQuote.zone.feeCents : 0;
    return { subtotalCents, discountCents, rewardCents, deliveryCents, totalCents: subtotalCents - discountCents - rewardCents + deliveryCents, deliveryPending: fulfilment() === 'delivery' && !deliveryQuote?.served };
  }
  function persistCart() { save(KEYS.cart, { items: cart, coupon }); }
  function validOrderToken(value) { return value && typeof value.id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value.id) && typeof value.token === 'string' && /^[A-Za-z0-9_-]{16,180}$/.test(value.token); }
  function hydrate() {
    const saved = stored(KEYS.cart), legacy = saved === null ? stored(KEYS.oldCart) : null;
    const list = Array.isArray(saved) ? saved : Array.isArray(saved?.items) ? saved.items : Array.isArray(legacy) ? legacy : [];
    cart = [];
    list.slice(0, MAX_LINES).forEach(raw => {
      const found = product(raw?.productId);
      if (!found || !Number.isInteger(raw.quantity) || raw.quantity < 1 || raw.quantity > MAX_QUANTITY || !Array.isArray(raw.extras)) return;
      if (raw.extras.length > extras.length || raw.extras.some(id => !found.extras.includes(id) || !extra(id))) return;
      const removed = raw.removed === undefined ? [] : raw.removed;
      if (!Array.isArray(removed) || removed.length > found.removable.length || removed.some(value => !found.removable.includes(value))) return;
      const item = { productId: found.id, quantity: raw.quantity, extras: found.extras.filter(id => raw.extras.includes(id)), removed: found.removable.filter(value => removed.includes(value)), note: text(raw.note), bundle: validBundle(raw.bundle, found) };
      const duplicate = cart.find(line => lineKey(line) === lineKey(item));
      if (duplicate) duplicate.quantity = Math.min(MAX_QUANTITY, duplicate.quantity + item.quantity); else cart.push(item);
    });
    coupon = saved?.coupon === store.coupon.code ? saved.coupon : '';
    const mode = stored(KEYS.fulfilment);
    if ($('fulfilment') && ['pickup', 'delivery'].includes(mode)) $('fulfilment').value = mode;
    document.querySelectorAll('[data-service-mode]').forEach(control => control.setAttribute('aria-pressed', String(control.dataset.serviceMode === fulfilment())));
    const liked = stored(KEYS.favorites); favorites = new Set(Array.isArray(liked) ? liked.filter(id => Boolean(product(id))).slice(0, products.length) : []);
    const orders = stored(KEYS.orders); savedOrders = Array.isArray(orders) ? orders.filter(validOrderToken).slice(0, 30).map(item => ({ id: item.id, token: item.token, createdAt: text(item.createdAt, 50) })) : [];
    persistCart();
  }
  function setupDialog(id, closeId) {
    const dialog = $(id); if (!dialog) return;
    $(closeId)?.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target !== dialog) return; const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); });
    dialog.addEventListener('close', () => { const trigger = dialogTriggers.get(dialog); if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true }); else if ($('cart-dialog')?.open) $('cart-close')?.focus({ preventScroll: true }); });
  }
  function openDialog(id, trigger = document.activeElement) { const dialog = $(id); if (!dialog || dialog.open) return; dialogTriggers.set(dialog, trigger); dialog.showModal(); }
  function imageFor(item, sizes = '(max-width: 760px) calc(100vw - 34px), (max-width: 1080px) calc((100vw - 90px) / 2), 390px') {
    const photo = media.productImages?.[item.id] ? { ...media.productImages[item.id], columns: 1, rows: 1, smallSrc: null } : item.photo;
    if (photo.columns === 1 && photo.rows === 1) {
      const image = node('img', 'menu-sprite product-image');
      image.src = photo.smallSrc || photo.src;
      if (photo.smallSrc) image.srcset = `${photo.smallSrc} 640w, ${photo.src} ${photo.width}w`;
      image.sizes = sizes; image.width = photo.width; image.height = photo.height;
      image.alt = item.name; image.loading = 'lazy'; image.decoding = 'async';
      return image;
    }
    const image = node('div', 'menu-sprite');
    image.style.backgroundImage = `url("${photo.src.replace(/"/g, '%22')}")`;
    image.style.backgroundSize = `${photo.columns * 100}% ${photo.rows * 100}%`;
    image.style.backgroundPosition = `${photo.columns > 1 ? photo.col / (photo.columns - 1) * 100 : 0}% ${photo.rows > 1 ? photo.row / (photo.rows - 1) * 100 : 0}%`;
    image.setAttribute('role', 'img'); image.setAttribute('aria-label', item.name); return image;
  }
  function renderMenu() {
    const grid = $('menu-grid'); if (!grid) return;
    let visible = products.filter(item => (filter === 'all' || item.category === filter) && (!favoritesOnly || favorites.has(item.id)) && normalize([item.name, item.description, item.categoryLabel, ...item.ingredients].join(' ')).includes(normalize(query)));
    if (sort === 'price-asc') visible.sort((a, b) => a.price - b.price);
    if (sort === 'price-desc') visible.sort((a, b) => b.price - a.price);
    if (sort === 'name') visible.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const fragment = document.createDocumentFragment();
    visible.forEach(item => {
      const card = node('article', 'menu-card'); card.dataset.category = item.category; card.dataset.productId = item.id;
      const photo = node('div', 'product-photo'), preview = button('', 'product-preview', {'data-product':item.id,'aria-label':`Ver ingredientes e personalizar ${item.name}`}); preview.append(imageFor(item)); photo.append(preview);
      photo.append(button(favorites.has(item.id) ? '♥' : '♡', 'favorite-product', { 'data-favorite': item.id, 'aria-label': `${favorites.has(item.id) ? 'Remover' : 'Adicionar'} ${item.name} ${favorites.has(item.id) ? 'dos' : 'aos'} favoritos`, 'aria-pressed': String(favorites.has(item.id)) }));
      const info = node('div', 'product-info'); if (item.tag) info.append(node('span', 'product-tag', item.tag));
      info.append(node('span', 'product-category', item.categoryLabel), node('h3', '', item.name), node('p', 'product-description', item.description));
      const bottom = node('div', 'product-bottom'), choose = button(isAvailable(item) ? 'Escolher +' : 'Indisponível', 'add-product', { 'data-product': item.id, 'aria-label': `Escolher ${item.name}` });
      choose.disabled = !isAvailable(item); card.classList.toggle('is-unavailable', !isAvailable(item));
      bottom.append(node('span', 'product-price', formatMoney(item.price)), choose);
      info.append(bottom); card.append(photo, info); fragment.append(card);
    });
    grid.replaceChildren(fragment); content('menu-count', `${visible.length} ${visible.length === 1 ? 'item' : 'itens'}`); show('menu-empty', !visible.length);
    $('menu-filters')?.querySelectorAll('[data-filter]').forEach(control => { const active = control.dataset.filter === filter; control.setAttribute('aria-pressed', String(active)); control.classList.toggle('is-active', active); });
    $('favorites-only')?.setAttribute('aria-pressed', String(favoritesOnly));
  }
  function selectedOptions(id) { return Array.from($(id)?.querySelectorAll('input:checked') || []).map(input => input.value); }
  function showMenuResults() {
    const grid=$('menu-grid'), toolbar=document.querySelector('.menu-tools');if(!grid)return;
    const header=document.querySelector('.site-header')?.offsetHeight||76;
    window.scrollTo({top:Math.max(0,grid.getBoundingClientRect().top+scrollY-header-(toolbar?.offsetHeight||64)-20),behavior:'instant'});
  }
  function productQuantity() { return $('product-quantity') ? Number($('product-quantity').value) : 1; }
  function updateProductPrice() {
    if (!selectedProduct) return;
    const options = selectedOptions('product-options'), removed = selectedOptions('product-removals');
    const bundle = selectedBundle(), extrasCents = options.reduce((sum, id) => sum + (extra(id)?.price || 0), 0), price = selectedProduct.price + extrasCents + bundlePrice(bundle);
    const entered = productQuantity(), quantity = Number.isInteger(entered) && entered >= 1 && entered <= MAX_QUANTITY ? entered : 1;
    content('product-price', formatMoney(price * quantity));
    content('product-price-detail', `${quantity} × ${formatMoney(price)} por unidade${extrasCents ? ` · Adicionais: ${formatMoney(extrasCents)} por unidade` : ''}${bundle ? ` · Economia no combo: ${formatMoney(bundleRule().discountCents * quantity)}` : ''}`);
    show('product-bundle-options', Boolean(bundle));
    content('product-bundle-price', bundle ? `+ ${formatMoney(bundlePrice(bundle))} por combo · economize ${formatMoney(bundleRule().discountCents)} em relação aos itens avulsos` : 'Escolha porção e bebida para acompanhar seu burger.');
    const choices = [];
    if (options.length) choices.push(`Extras: ${options.map(id => extra(id)?.name).filter(Boolean).join(', ')}`);
    if (removed.length) choices.push(`Sem: ${removed.join(', ')}`);
    if (bundle) choices.push(bundleText(bundle));
    content('product-customization-summary', choices.length ? choices.join(' · ') : 'Receita original, sem personalizações.');
    show('product-customization-summary', choices.length > 0);
  }
  function openProduct(id, trigger, currentLine = null) {
    if (submitting) return checkoutStatus('Aguarde o resultado do registro antes de alterar sua sacola.');
    const item = product(id); if (!item || !$('product-dialog')) return; selectedProduct = item; editingLine = currentLine; productFeedback('');
    content('product-add', currentLine ? 'Salvar alterações' : 'Adicionar à sacola');
    $('product-add')?.setAttribute('aria-label', `${currentLine ? 'Salvar alterações de' : 'Adicionar à sacola'} ${item.name}`);
    content('product-title', item.name); content('product-description', item.description); content('product-ingredients', item.ingredients.join(' · '));
    content('product-allergens', item.allergens.length ? `Contém: ${item.allergens.join(', ')}.` : 'Nenhum alergênico declarado nesta receita de demonstração.');
    if ($('product-photo')) $('product-photo').replaceChildren(imageFor(item, '(max-width: 760px) 260px, 310px'));
    if ($('product-note')) { $('product-note').value = currentLine?.note || ''; $('product-note').maxLength = 180; }
    if ($('product-quantity')) { $('product-quantity').value = String(currentLine?.quantity || 1); $('product-quantity').min = '1'; $('product-quantity').max = '99'; $('product-quantity').step = '1'; $('product-quantity').setCustomValidity(''); }
    const options = item.extras.map(id => { const option = extra(id), label = node('label', 'extra-option'), input = node('input'); input.type = 'checkbox'; input.value = id; input.name = 'extra'; input.checked = Boolean(currentLine?.extras.includes(id)); label.append(input, node('span', 'extra-name', option.name), node('span', 'extra-price', `+ ${formatMoney(option.price)}`)); return label; });
    $('product-options')?.replaceChildren(...(options.length ? options : [node('p', 'options-empty', 'Este item não tem adicionais.')]));
    const removals = item.removable.map(ingredient => { const label = node('label', 'product-removal'), input = node('input'); input.type = 'checkbox'; input.name = 'removed'; input.value = ingredient; input.checked = Boolean(currentLine?.removed.includes(ingredient)); label.append(input, node('span', '', `Sem ${ingredient.toLowerCase()}`)); return label; });
    $('product-removals')?.replaceChildren(...(removals.length ? removals : [node('p', 'options-empty', 'Receita sem opções de retirada.')]));
    const rule = bundleRule(), canBundle = rule?.categories.includes(item.category);
    show('product-bundle', Boolean(canBundle));
    if ($('product-bundle-enabled')) $('product-bundle-enabled').checked = Boolean(currentLine?.bundle);
    for (const [id, ids, selected] of [['product-bundle-side', rule?.sideIds || [], currentLine?.bundle?.sideId], ['product-bundle-drink', rule?.drinkIds || [], currentLine?.bundle?.drinkId]]) {
      const select = $(id); if (!select) continue;
      select.replaceChildren(...ids.map(value => { const target = product(value), option = node('option', '', `${target.name} · ${formatMoney(target.price)}${isAvailable(target) ? '' : ' · indisponível'}`); option.value = value; option.disabled = !isAvailable(target); return option; }));
      if (selected) select.value = selected; else select.value = ids.find(isAvailable) || '';
    }
    $('product-add').disabled = !isAvailable(item) || !operations.acceptingOrders;
    if (!isAvailable(item)) productFeedback('Este produto está indisponível no momento. Você ainda pode conhecer os ingredientes.');
    else if (!operations.acceptingOrders) productFeedback('A loja pausou novos pedidos. Você pode continuar explorando o cardápio.');
    updateProductPrice(); openDialog('product-dialog', trigger);
  }
  function editCart(index, trigger) {
    if (!Number.isInteger(index) || !cart[index]) return cartFeedback('Esse item não está mais na sacola. Confira os itens atuais.');
    openProduct(cart[index].productId, trigger, cart[index]);
  }
  function addSelectedProduct() {
    if (!selectedProduct || submitting) return;
    if (!isAvailable(selectedProduct) || !operations.acceptingOrders) return productFeedback('Este produto ou novos pedidos estão temporariamente indisponíveis.');
    const bundle = selectedBundle();
    if ($('product-bundle-enabled')?.checked && (!bundle || !isAvailable(bundle.sideId) || !isAvailable(bundle.drinkId))) return productFeedback('Escolha uma porção e uma bebida disponíveis para o combo.');
    const quantity = productQuantity(), field = $('product-quantity');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) { const message = 'Escolha uma quantidade inteira entre 1 e 99.'; productFeedback(message, true); field?.setCustomValidity(message); field?.reportValidity(); return; }
    const item = { productId: selectedProduct.id, quantity, extras: selectedProduct.extras.filter(id => selectedOptions('product-options').includes(id)), removed: selectedProduct.removable.filter(value => selectedOptions('product-removals').includes(value)), note: text($('product-note')?.value), bundle };
    const editingIndex = editingLine ? cart.indexOf(editingLine) : -1;
    if (editingLine && editingIndex < 0) return productFeedback('Esse item mudou enquanto você editava. Feche esta janela e abra a edição novamente.');
    const existing = cart.find(line => line !== editingLine && lineKey(line) === lineKey(item));
    if (existing && existing.quantity + quantity > MAX_QUANTITY) { const message = `Essa combinação já tem ${existing.quantity} unidades na sacola. A soma pode ter no máximo 99. Reduza a quantidade ou escolha outra personalização.`; productFeedback(message, true); field?.setCustomValidity(message); field?.reportValidity(); return; }
    if (!editingLine && !existing && cart.length >= MAX_LINES) return productFeedback('A sacola pode ter até 40 combinações diferentes. Edite ou remova um item para adicionar outro.');
    invalidateUndo();
    let savedLine;
    if (existing) { existing.quantity += quantity; savedLine = existing; if (editingLine) cart.splice(editingIndex, 1); }
    else if (editingLine) { cart[editingIndex] = item; savedLine = item; }
    else { cart.push(item); savedLine = item; }
    const wasEditing = Boolean(editingLine); editingLine = null; persistCart(); renderCart();
    if ($('cart-dialog')?.open) dialogTriggers.set($('product-dialog'), $('cart-items')?.querySelector(`[data-index="${cart.indexOf(savedLine)}"][data-action="edit"]`) || $('cart-close'));
    $('product-dialog').close(); const message = `${selectedProduct.name} ${wasEditing ? existing ? 'atualizado e unido à combinação igual na sacola' : 'atualizado na sacola' : 'adicionado à sacola'}.`; cartFeedback(message); toast(message);
  }
  function couponFeedback() {
    const rule = store.coupon;
    if (!coupon) { content('coupon-feedback', `${rule.code}: ${rule.percent}% a partir de ${formatMoney(rule.minSubtotalCents)}, desconto máximo de ${formatMoney(rule.maxDiscountCents)}.`); return; }
    const amount = totals(); content('coupon-feedback', amount.discountCents ? `${coupon} aplicado: ${formatMoney(amount.discountCents)} de desconto.` : `Faltam ${formatMoney(Math.max(0, rule.minSubtotalCents - amount.subtotalCents))} em produtos para usar ${coupon}.`);
  }
  function suggestedProducts() {
    const categories = new Set(cart.map(item => product(item.productId).category)), present = new Set(cart.map(item => item.productId));
    const hasBurger = ['bovino', 'frango', 'vegetariano'].some(category => categories.has(category)), hasCombo = categories.has('combo');
    const wanted = [];
    if (hasBurger && !hasCombo && !categories.has('bebida')) wanted.push('bebida');
    if (hasBurger && !hasCombo && !categories.has('acompanhamento')) wanted.push('acompanhamento');
    if (!categories.has('sobremesa')) wanted.push('sobremesa');
    return wanted.map(category => products.find(item => item.category === category && !present.has(item.id) && isAvailable(item))).filter(Boolean).slice(0, 3);
  }
  function renderCart() {
    const count = quantityCount(), amount = totals();
    content('cart-count', count); content('cart-mobile-count', count); content('cart-total-mini', formatMoney(amount.totalCents)); content('cart-mobile-total', formatMoney(amount.totalCents));
    content('cart-total', formatMoney(amount.subtotalCents)); content('cart-discount', amount.discountCents ? `− ${formatMoney(amount.discountCents)}` : formatMoney(0)); content('cart-delivery', amount.deliveryPending ? 'Consultar CEP' : formatMoney(amount.deliveryCents)); content('cart-grand-total', formatMoney(amount.totalCents));
    content('cart-total-label', amount.deliveryPending ? 'Total parcial' : 'Total'); content('cart-reward', amount.rewardCents ? `− ${formatMoney(amount.rewardCents)}` : formatMoney(0)); show('cart-reward-row', amount.rewardCents > 0);
    content('cart-delivery-note', amount.deliveryPending ? 'Consulte seu CEP ao concluir para calcular a entrega.' : fulfilment() === 'delivery' ? `Entrega para ${deliveryQuote.zone.neighborhood} · ${deliveryQuote.zone.estimate}` : 'Retirada na loja, sem taxa de entrega.');
    content('cart-availability', !operations.acceptingOrders ? 'Novos pedidos estão pausados. Sua sacola será preservada.' : cart.some(item => !lineAvailable(item)) ? 'Há itens indisponíveis na sacola. Edite ou remova antes de concluir.' : '');
    show('cart-availability', !operations.acceptingOrders || cart.some(item => !lineAvailable(item)));
    $('cart-open')?.setAttribute('aria-label', `Abrir sacola, ${count} ${count === 1 ? 'item' : 'itens'}`); show('cart-empty', !count); show('cart-mobile', count > 0);
    if ($('cart-checkout')) $('cart-checkout').disabled = !count || !operations.acceptingOrders || cart.some(item => !lineAvailable(item)); if ($('cart-clear')) $('cart-clear').disabled = !count;
    const fragment = document.createDocumentFragment();
    cart.forEach((item, index) => {
      const found = product(item.productId), row = node('article', 'cart-line'), info = node('div', 'cart-line-info'), photo = node('div', 'cart-line-photo'); photo.append(imageFor(found, '82px')); info.append(node('h3', '', found.name));
      if (item.extras.length) info.append(node('p', 'cart-line-options', `Extras: ${item.extras.map(id => extra(id).name).join(', ')}`));
      if (item.removed.length) info.append(node('p', 'cart-removed', `Sem: ${item.removed.join(', ')}`));
      if (item.note) info.append(node('p', 'cart-line-note', `Observação: ${item.note}`));
      if (item.bundle) info.append(node('p', 'cart-line-options', bundleText(item.bundle)));
      if (!lineAvailable(item)) info.append(node('p', 'cart-line-unavailable', 'Produto ou acompanhamento indisponível. Edite ou remova este item.'));
      info.append(node('span', 'cart-line-unit', `${formatMoney(unitPrice(item))} por unidade`), button('Editar item', 'cart-edit', { 'data-action': 'edit', 'data-index': index, 'aria-label': `Editar ${found.name}, item ${index + 1} da sacola` }));
      const controls = node('div', 'cart-line-controls'), quantity = node('div', 'quantity-control');
      const minus = button('−', 'quantity-button', { 'data-action': 'decrease', 'data-index': index, 'aria-label': `Diminuir quantidade de ${found.name}` }), plus = button('+', 'quantity-button', { 'data-action': 'increase', 'data-index': index, 'aria-label': `Aumentar quantidade de ${found.name}` });
      plus.disabled = item.quantity >= MAX_QUANTITY; if (plus.disabled) { plus.title = 'Limite de 99 unidades dessa combinação.'; plus.setAttribute('aria-label', `${found.name}: limite de 99 unidades atingido`); } quantity.append(minus, node('span', 'quantity-value', item.quantity), plus);
      controls.append(quantity, node('strong', 'cart-line-total', formatMoney(unitPrice(item) * item.quantity)), button('Remover', 'cart-remove', { 'data-action': 'remove', 'data-index': index, 'aria-label': `Remover ${found.name}` })); row.append(photo, info, controls); fragment.append(row);
    });
    $('cart-items')?.replaceChildren(fragment);
    const upsells = suggestedProducts().map(item => {
      const row = node('div', 'cart-upsell'), photo = node('div', 'cart-upsell-photo'), info = node('div', 'cart-upsell-info');
      photo.append(imageFor(item, '64px')); info.append(node('span', '', item.name), node('strong', '', formatMoney(item.price)));
      row.append(photo, info, button('+ Adicionar', 'upsell-add', { 'data-product': item.id, 'aria-label': `Adicionar ${item.name}` })); return row;
    });
    $('cart-upsells')?.replaceChildren(...(upsells.length ? [node('h3', '', 'Para acompanhar seu pedido'), ...upsells] : [])); show('cart-upsells', count > 0 && upsells.length > 0); couponFeedback();
    if ($('checkout-dialog')?.open && !activeOrder) updateSummary(); renderCheckoutTotals();
    emit('cart-change', { cart: clone(cart), totals: amount });
  }
  function openCart() { openDialog('cart-dialog', $('cart-open')); }
  function changeCart(action, index) {
    if (!Number.isInteger(index) || index < 0 || index >= cart.length || submitting) return;
    if (action === 'edit') return editCart(index, $('cart-items')?.querySelector(`[data-index="${index}"][data-action="edit"]`));
    const removing = action === 'remove' || action === 'decrease' && cart[index].quantity === 1;
    if (!removing && !(action === 'increase' && cart[index].quantity < MAX_QUANTITY) && action !== 'decrease') return;
    const snapshot = removing ? { items: clone(cart), coupon, index, action } : null, name = product(cart[index].productId).name;
    invalidateUndo();
    if (removing) cart.splice(index, 1); else if (action === 'increase') cart[index].quantity += 1; else cart[index].quantity -= 1;
    persistCart(); renderCart();
    if (snapshot) { removedCart = snapshot; cartFeedback(`${name} removido da sacola.`, true); $('cart-undo')?.focus({ preventScroll: true }); }
    else { const replacement = $('cart-items')?.querySelector(`[data-index="${Math.min(index, cart.length - 1)}"][data-action="${action}"]`); (replacement || $('cart-close'))?.focus({ preventScroll: true }); }
  }
  function clearCart() {
    if (submitting || !cart.length) return;
    const snapshot = { items: clone(cart), coupon, index: 0, action: 'edit' };
    invalidateUndo(); cart = []; coupon = ''; if ($('cart-coupon')) $('cart-coupon').value = '';
    persistCart(); renderCart(); removedCart = snapshot; cartFeedback('Sacola esvaziada.', true); $('cart-undo')?.focus({ preventScroll: true });
  }
  function applyCoupon() { if (submitting) return; const code = text($('cart-coupon')?.value, 30).toUpperCase(); invalidateUndo(); coupon = code === store.coupon.code ? code : ''; if (coupon) reward = null; persistCart(); renderCart(); if (code && !coupon) content('coupon-feedback', 'Cupom não encontrado. Confira o código e tente novamente.'); if (!code) content('coupon-feedback', 'Cupom removido.'); }
  function useCoupon() {
    if (submitting) return toast('Aguarde o resultado do registro antes de alterar sua sacola.');
    invalidateUndo(); coupon = store.coupon.code; reward = null;
    if ($('cart-coupon')) $('cart-coupon').value = coupon;
    persistCart(); renderCart(); openCart();
    cartFeedback(totals().discountCents ? `Cupom ${coupon} aplicado à sacola.` : `Cupom ${coupon} guardado na sacola. O desconto aparece ao atingir ${formatMoney(store.coupon.minSubtotalCents)} em produtos.`);
  }
  function fieldValue(id, max = 180) { return text($(id)?.value, max); }
  function phoneValue() { let value = fieldValue('customer-phone', 30).replace(/\D/g, ''); if ((value.length === 12 || value.length === 13) && value.startsWith('55')) value = value.slice(2); return value; }
  function parseCash(value) {
    if (!value.trim()) return null; let normalized = value.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
    if (normalized.includes(',')) normalized = normalized.replace(/\./g, '').replace(',', '.');
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(normalized)) return NaN;
    const [whole, fraction = ''] = normalized.split('.'); return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  }
  function checkoutPayload() {
    return { items: clone(cart), coupon: totals().discountCents ? coupon : '', rewardOrderId: reward?.orderId || null, rewardToken: reward?.token || null, customer: { name: fieldValue('customer-name', 80), phone: phoneValue() }, fulfilment: fulfilment(), address: { cep: fieldValue('address-cep', 12).replace(/\D/g, ''), street: fieldValue('address-street', 120), number: fieldValue('address-number', 20), complement: fieldValue('address-complement', 100), neighborhood: fieldValue('address-neighborhood', 80), city: fieldValue('address-city', 80) }, payment: { method: ['pix', 'card', 'cash'].includes($('payment-method')?.value) ? $('payment-method').value : 'pix', online: Boolean(window.BrasaPayments?.onlineSelected), changeForCents: $('payment-method')?.value === 'cash' ? parseCash(fieldValue('cash-change', 30)) : null }, note: fieldValue('order-note', 240) };
  }
  function syncFields() {
    const delivery = fulfilment() === 'delivery'; show('address-fields', delivery);
    ['address-cep', 'address-street', 'address-number', 'address-neighborhood', 'address-city'].forEach(id => { if ($(id)) { $(id).required = delivery; $(id).disabled = !delivery; } });
    if ($('address-complement')) $('address-complement').disabled = !delivery;
      const cash = $('payment-method')?.value === 'cash'; show('change-fields', cash); if ($('cash-change')) $('cash-change').disabled = !cash;
      window.BrasaPayments?.syncChoice?.();
  }
  function validity(id, condition, message) { $(id)?.setCustomValidity(condition ? '' : message); return condition; }
  function validCheckout() {
    if (!operations.acceptingOrders || cart.some(item => !lineAvailable(item))) { checkoutStatus('A loja ou um item da sacola está indisponível. Confira a sacola antes de concluir.'); return false; }
    if (fulfilment() === 'delivery' && (!deliveryQuote?.served || fieldValue('address-cep', 12).replace(/\D/g, '') !== deliveryQuote.cep || fieldValue('address-neighborhood', 80) !== deliveryQuote.zone.neighborhood)) { checkoutStatus('Consulte o CEP para confirmar a área, taxa e prazo de entrega.'); $('checkout-delivery-check')?.focus(); return false; }
    syncFields(); if (!cart.length) { checkoutStatus('Sua sacola está vazia. Escolha um item no cardápio.'); return false; }
    const payload = checkoutPayload(), amount = totals();
    validity('customer-name', payload.customer.name.length >= 2, 'Informe seu nome, com pelo menos dois caracteres.'); validity('customer-phone', /^\d{10,11}$/.test(payload.customer.phone), 'Informe um telefone com DDD, com 10 ou 11 números.'); if ($('privacy-accept')) $('privacy-accept').required = true;
    if (payload.fulfilment === 'delivery') {
      validity('address-cep', /^\d{8}$/.test(payload.address.cep), 'Informe um CEP com oito números.'); validity('address-street', payload.address.street.length >= 3, 'Informe a rua do endereço.'); validity('address-number', Boolean(payload.address.number), 'Informe o número ou s/n.'); validity('address-neighborhood', store.delivery.neighborhoods.includes(payload.address.neighborhood), 'Escolha um bairro atendido.'); validity('address-city', payload.address.city.length >= 2, 'Informe a cidade.');
      if (amount.subtotalCents < store.delivery.minSubtotalCents) { checkoutStatus(`Para entrega, adicione pelo menos ${formatMoney(store.delivery.minSubtotalCents)} em produtos. A taxa não entra no mínimo.`); return false; }
    }
    if (payload.payment.method === 'cash') validity('cash-change', payload.payment.changeForCents === null || Number.isSafeInteger(payload.payment.changeForCents) && payload.payment.changeForCents >= amount.totalCents, `Informe um valor para troco igual ou maior que ${formatMoney(amount.totalCents)}, ou deixe vazio para não pedir troco.`);
    return !$('checkout-form') || $('checkout-form').reportValidity();
  }
  function renderCheckoutTotals() {
    const target = $('checkout-totals'); if (!target) return; const amount = activeOrder ? activeOrder.totals : totals(), mode = activeOrder ? activeOrder.fulfilment : fulfilment();
    const items=activeOrder?activeOrder.items:cart, key=JSON.stringify([activeOrder?.id,items]);
    if($('checkout-items')&&key!==checkoutItemsKey){
      checkoutItemsKey=key;
      $('checkout-items').replaceChildren(...items.map(item=>{
        const found=product(item.productId), row=node('div','checkout-item'), info=node('div','checkout-item-info');
        if(found){const photo=node('div','checkout-item-photo');photo.append(imageFor(found, '64px'));row.append(photo);}
        info.append(node('strong','',`${item.quantity} × ${activeOrder?item.name:found.name}`));
        const choices=[];
        if(item.extras?.length)choices.push(`Extras: ${item.extras.map(value=>typeof value==='string'?extra(value)?.name||value:value.name).join(', ')}`);
        if(item.removed?.length)choices.push(`Sem: ${item.removed.join(', ')}`);
        if(item.note)choices.push(item.note);
        if(item.bundle)choices.push(bundleText(item.bundle));
        if(choices.length)info.append(node('p','checkout-item-options',choices.join(' · ')));
        info.append(node('span','checkout-item-price',formatMoney(activeOrder?item.lineCents:unitPrice(item)*item.quantity)));row.append(info);return row;
      }));
    }
    const rows = [['Produtos', amount.subtotalCents], ['Desconto', -amount.discountCents]];
    if (amount.rewardCents) rows.push(['Clube Brasa', -amount.rewardCents]);
    rows.push([mode === 'delivery' ? 'Entrega' : 'Retirada', mode === 'delivery' && amount.deliveryPending ? 'Consultar CEP' : amount.deliveryCents], [amount.deliveryPending ? 'Total parcial' : 'Total', amount.totalCents]);
    target.replaceChildren(...rows.map(([label, value], index) => { const row = node('div', `checkout-total-line${index === rows.length - 1 ? ' is-total' : ''}`); row.append(node('span', '', label), node('strong', '', typeof value === 'string' ? value : formatMoney(value))); return row; }));
  }
  function summaryFor(payload, amount, order = null) {
    const lines = [`BRASA BURGER · ${order ? `PEDIDO ${order.id}` : 'RESUMO DO PEDIDO'}${store.demo ? ' · DEMONSTRAÇÃO' : ''}`, ''];
    if (order) lines.push(`Status: ${statusNames[order.status] || order.status}`);
    lines.push(`Nome: ${payload.customer.name}`, `Telefone: ${payload.customer.phone}`, `Modalidade: ${payload.fulfilment === 'delivery' ? 'Entrega' : 'Retirada'}`);
    if (payload.fulfilment === 'delivery') { const address = payload.address; lines.push(`Endereço: ${address.street}, ${address.number}${address.complement ? `, ${address.complement}` : ''} — ${address.neighborhood}, ${address.city}`, `CEP: ${address.cep}`); }
    lines.push('', 'ITENS');
    (order ? order.items : payload.items).forEach(item => { lines.push(`${item.quantity} × ${order ? item.name : product(item.productId).name} — ${formatMoney(order ? item.lineCents : unitPrice(item) * item.quantity)}`); if (item.extras?.length) lines.push(`  Extras: ${item.extras.map(value => typeof value === 'string' ? extra(value)?.name || value : value.name).join(', ')}`); if (item.removed?.length) lines.push(`  Sem: ${item.removed.join(', ')}`); if (item.bundle) lines.push(`  ${bundleText(item.bundle)}`); if (item.note) lines.push(`  Observação: ${item.note}`); });
    lines.push('', `Produtos: ${formatMoney(amount.subtotalCents)}`, `Desconto: ${formatMoney(amount.discountCents)}`, `Clube Brasa: ${formatMoney(amount.rewardCents || 0)}`, `Entrega: ${amount.deliveryPending ? 'A calcular pelo CEP' : formatMoney(amount.deliveryCents)}`, `${amount.deliveryPending ? 'TOTAL PARCIAL' : 'TOTAL'}: ${formatMoney(amount.totalCents)}`, `Pagamento: ${payload.payment.online ? 'Online · aguarda confirmação do provedor' : paymentNames[payload.payment.method] || 'A combinar'}`);
    if (Number.isSafeInteger(payload.payment.changeForCents)) lines.push(`Troco para: ${formatMoney(payload.payment.changeForCents)}`); if (payload.note) lines.push(`Observação do pedido: ${payload.note}`);
    lines.push('', order ? order.demo ? 'Registro no servidor de demonstração. Não enviado à cozinha. Nenhuma cobrança realizada.' : 'Pedido recebido. Consulte o pagamento e aguarde confirmação da loja.' : 'Este resumo não registra nem envia um pedido. Nenhuma cobrança realizada.'); return lines.join('\n');
  }
  function updateSummary() { if (activeOrder) return; const payload = checkoutPayload(), amount = totals(); if ($('order-summary')) $('order-summary').value = summaryFor(payload, amount); if ($('order-copy')) $('order-copy').disabled = !cart.length; updateWhatsapp(false); renderCheckoutTotals(); }
  function updateWhatsapp(saved) { const link = $('order-whatsapp'), phone = typeof store.whatsapp === 'string' ? store.whatsapp.replace(/\D/g, '') : ''; if (!link) return; const valid = /^\d{10,15}$/.test(phone) && (saved || cart.length > 0); link.hidden = !valid; if (valid) { link.href = `https://wa.me/${phone}?text=${encodeURIComponent($('order-summary')?.value || '')}`; link.target = '_blank'; link.rel = 'noopener noreferrer'; } }
  async function copySummary() {
    if (!activeOrder && !validCheckout()) return; if (!activeOrder) updateSummary(); const summary = $('order-summary')?.value; if (!summary) return;
    try { if (!navigator.clipboard?.writeText) throw new Error('Unavailable'); await navigator.clipboard.writeText(summary); checkoutStatus('Resumo copiado. Nenhuma mensagem foi enviada pelo site.'); toast('Resumo copiado.'); }
    catch { $('order-summary')?.focus(); $('order-summary')?.select(); checkoutStatus('A cópia automática não está disponível. O resumo está selecionado: use Ctrl+C ou mantenha pressionado para copiar.'); }
  }
  async function api(path, options = {}) {
    if (window.BRASA_STATIC_DEMO === true) throw new Error('Esta apresentação funciona sem servidor de pedidos.');
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
    try { const response = await fetch(`/api${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, signal: controller.signal, cache: 'no-store' }); const data = await response.json().catch(() => null); if (!response.ok) { const error = new Error(typeof data?.error === 'string' ? data.error : `O servidor respondeu com erro ${response.status}.`); error.http = response.status; throw error; } if (!data || typeof data !== 'object') throw new Error('Resposta inválida do servidor.'); return data; }
    finally { clearTimeout(timeout); }
  }
  async function checkHealth() {
    if (window.BRASA_STATIC_DEMO === true || location.protocol !== 'http:' && location.protocol !== 'https:') { apiOnline = false; updateSubmitLabel(); return false; } if (healthPromise) return healthPromise;
    healthPromise = api('/health').then(data => { apiOnline = data.ok === true && data.version >= 7; if (data.payments) emit('payments-config', { payments: data.payments }); return apiOnline; }).catch(() => { apiOnline = false; return false; }).finally(() => { healthPromise = null; updateSubmitLabel(); }); return healthPromise;
  }
  function updateSubmitLabel() { const submit = $('checkout-submit'); if (submit) { submit.textContent = submitting ? 'Registrando…' : apiOnline ? store.demo ? 'Registrar pedido de demonstração' : 'Confirmar pedido' : 'Gerar resumo offline'; submit.disabled = submitting; } }
  function setDeliveryQuote(value) {
    const valid = value?.served === true && /^\d{8}$/.test(value.cep || '') && typeof value.zone?.neighborhood === 'string' && Number.isSafeInteger(value.zone?.feeCents) && value.zone.feeCents >= 0;
    deliveryQuote = valid ? clone(value) : null;
    if (deliveryQuote) {
      if ($('address-cep')) $('address-cep').value = deliveryQuote.cep.slice(0, 5) + '-' + deliveryQuote.cep.slice(5);
      if ($('address-neighborhood')) $('address-neighborhood').value = deliveryQuote.zone.neighborhood;
      if ($('address-city') && !$('address-city').value) $('address-city').value = store.address.city;
    }
    renderCart(); emit('delivery-change', { quote: clone(deliveryQuote) }); return deliveryQuote;
  }
  async function applyReward(orderId, token) {
    if (submitting) throw new Error('Aguarde a conclusão do pedido.');
    if (!orderId) { invalidateUndo(); reward = null; renderCart(); return; }
    const reference = savedOrders.find(value => value.id === orderId && value.token === token);
    if (!reference) throw new Error('Consulte um pedido próprio para usar sua recompensa.');
    const result = await api(`/orders/${encodeURIComponent(orderId)}/loyalty`, { headers: { 'X-Order-Token': token } });
    if (!(result.availableRewards > 0)) throw new Error('Você ainda não tem uma recompensa disponível.');
    invalidateUndo(); reward = { orderId, token }; coupon = ''; if ($('cart-coupon')) $('cart-coupon').value = '';
    persistCart(); renderCart(); toast('Recompensa do Clube Brasa selecionada. Ela substitui o cupom neste pedido.'); emit('reward-change', { selected: true });
  }
  function refreshShop(value) {
    if (!value || typeof value !== 'object') return;
    const previous = JSON.stringify([operations, media]); shop = clone(value);
    if (value.operations) operations = { acceptingOrders: value.operations.acceptingOrders !== false, pausedProductIds: strings(value.operations.pausedProductIds).filter(id => Boolean(product(id))), extraMinutes: Number.isInteger(value.operations.extraMinutes) ? value.operations.extraMinutes : 0 };
    if (value.media) media = { ...value.media, productImages: value.media.productImages || {} };
    content('shop-availability-note', operations.acceptingOrders ? operations.extraMinutes ? `Hoje o preparo pode levar mais ${operations.extraMinutes} min. A consulta de entrega já considera esse ajuste.` : '' : 'Novos pedidos estão pausados. Explore o cardápio e consulte novamente em breve.');
    show('shop-availability-note', !operations.acceptingOrders || operations.extraMinutes > 0);
    if (JSON.stringify([operations, media]) !== previous) {
      renderMenu(); renderCart();
      document.querySelectorAll('[data-media-product]').forEach(image => { const photo = media.productImages[image.dataset.mediaProduct]; if (!photo) return; image.removeAttribute('srcset'); image.src = photo.src; image.width = photo.width; image.height = photo.height; });
      if (selectedProduct && $('product-dialog')?.open) { $('product-add').disabled = !isAvailable(selectedProduct) || !operations.acceptingOrders; if ($('product-add').disabled) productFeedback('Este produto ou novos pedidos estão temporariamente indisponíveis.'); }
    }
    emit('shop-change', { shop: clone(shop) });
  }
  async function loadShop() {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    try { refreshShop(await api('/shop')); } catch { /* The local catalog remains usable while disconnected. */ }
  }
  async function pollOrders() {
    if (pollBusy || document.hidden || !$('checkout-dialog')?.open && !$('orders-dialog')?.open) return;
    const references = savedOrders.filter(reference => { const order = orderCache.get(reference.id); return !order || !['completed', 'cancelled'].includes(order.status); }).slice(0, 10);
    if (!references.length) return; pollBusy = true;
    try {
      const before = new Map(references.map(reference => [reference.id, JSON.stringify([orderCache.get(reference.id)?.status, orderCache.get(reference.id)?.updatedAt, orderCache.get(reference.id)?.payment])]));
      const results = await Promise.allSettled(references.map(reference => fetchOrder(reference)));
      const changed = results.some(result => result.status === 'fulfilled' && before.get(result.value.id) !== JSON.stringify([result.value.status, result.value.updatedAt, result.value.payment]));
      if (changed) { renderOrders(); if (activeOrder && orderCache.has(activeOrder.id)) displayOrder(orderCache.get(activeOrder.id)); toast('O status do seu pedido foi atualizado pela loja.'); }
      content('order-live-status', results.some(result => result.status === 'rejected') ? 'Conexão indisponível. Tentaremos consultar novamente; o último status continua visível.' : 'Acompanhamento atualizado automaticamente a cada 15 segundos enquanto esta janela estiver aberta.');
    } finally { pollBusy = false; }
  }
  function applyProfile() { const profile = stored(KEYS.profile); if (!profile || typeof profile !== 'object') return; if ($('customer-name')) $('customer-name').value = text(profile.name, 80); if ($('customer-phone')) $('customer-phone').value = text(profile.phone, 30); const ids = { cep: 'address-cep', street: 'address-street', number: 'address-number', complement: 'address-complement', neighborhood: 'address-neighborhood', city: 'address-city' }; Object.entries(ids).forEach(([key, id]) => { if ($(id) && typeof profile.address?.[key] === 'string') $(id).value = text(profile.address[key], 120); }); if ($('customer-remember')) $('customer-remember').checked = true; }
  function rememberProfile(payload) { if ($('customer-remember')?.checked) save(KEYS.profile, { name: payload.customer.name, phone: payload.customer.phone, address: payload.address }); else forget(KEYS.profile); }
  function resetCheckout() { activeOrder = null; show('checkout-success', false); show('checkout-form', true); if ($('order-refresh')) $('order-refresh').disabled = true; if ($('order-cancel')) $('order-cancel').disabled = true; syncFields(); updateSummary(); }
  async function openCheckout() { if (!cart.length) return; $('cart-dialog')?.close(); resetCheckout(); checkoutStatus('Demonstração: confira seus dados e valores. Nenhuma cobrança será feita.'); openDialog('checkout-dialog', $('cart-open')); await checkHealth(); if (!activeOrder) checkoutStatus(apiOnline ? 'Servidor de demonstração conectado. O registro fica salvo para acompanhamento, sem envio à cozinha.' : 'Modo offline: você pode gerar e copiar um resumo. Pedidos não serão registrados.'); }
  async function fingerprint(payload) { const input = new TextEncoder().encode(JSON.stringify(payload)); if (crypto.subtle) { const digest = await crypto.subtle.digest('SHA-256', input); return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join(''); } let a = 2166136261, b = 5381; input.forEach(value => { a = Math.imul(a ^ value, 16777619); b = Math.imul(b, 33) ^ value; }); return `${(a >>> 0).toString(16)}${(b >>> 0).toString(16)}`; }
  function uuid() { if (crypto.randomUUID) return crypto.randomUUID(); const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128; const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join(''); return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`; }
  function validOrder(order) { return validOrderToken(order) && Object.hasOwn(statusNames, order.status) && ['pickup', 'delivery'].includes(order.fulfilment) && (order.fulfilment === 'pickup' || order.address && typeof order.address === 'object') && Array.isArray(order.items) && order.items.length > 0 && order.customer && order.payment && order.totals && ['subtotalCents', 'discountCents', 'deliveryCents', 'totalCents'].every(key => Number.isSafeInteger(order.totals[key]) && order.totals[key] >= 0) && order.items.every(item => typeof item.name === 'string' && Number.isInteger(item.quantity) && item.quantity > 0 && Number.isSafeInteger(item.lineCents) && item.lineCents >= 0); }
  function saveOrder(order) { orderCache.set(order.id, order); savedOrders = [{ id: order.id, token: order.token, createdAt: order.createdAt }, ...savedOrders.filter(item => item.id !== order.id)].slice(0, 30); save(KEYS.orders, savedOrders); }
  function orderTimeline(order) {
    const timeline = node('ol', 'order-timeline'); timeline.setAttribute('aria-label', 'Etapas de atendimento do pedido');
    const steps = ['awaiting_confirmation', 'confirmed', 'preparing', order.fulfilment === 'pickup' ? 'ready' : 'out_for_delivery', 'completed'];
    if (order.payment.online) steps.unshift('awaiting_payment');
    const current = steps.indexOf(order.status);
    steps.forEach((status, index) => { const item = node('li', index < current ? 'is-done' : index === current ? 'is-current' : '', statusNames[status]); if (index === current) item.setAttribute('aria-current', 'step'); timeline.append(item); });
    if (order.status === 'cancelled') { const item = node('li', 'is-current', 'Cancelado'); item.setAttribute('aria-current', 'step'); timeline.append(item); }
    return timeline;
  }
  function displayOrder(order) {
    activeOrder = order; saveOrder(order); show('checkout-success', true); show('checkout-form', false); content('order-number', order.id); content('order-status', statusNames[order.status]);
    const detail = $('order-detail');
    if (detail) { detail.replaceChildren(node('p', 'order-meta', order.demo ? 'Pedido salvo no servidor de demonstração. Sem cobrança e sem envio à cozinha.' : 'Pedido recebido. Aguarde confirmação da loja.')); detail.append(orderTimeline(order)); order.items.forEach(item => { const row = node('div', 'order-receipt-line'); row.append(node('strong', '', `${item.quantity} × ${item.name}`), node('span', '', formatMoney(item.lineCents))); if (item.bundle) row.append(node('small', '', bundleText(item.bundle))); if (item.removed?.length) row.append(node('small', '', `Sem: ${item.removed.join(', ')}`)); if (item.note) row.append(node('small', '', item.note)); detail.append(row); }); detail.append(node('p', 'order-total', `Total: ${formatMoney(order.totals.totalCents)}`), communityActions(order)); }
    if ($('order-summary')) $('order-summary').value = summaryFor(order, order.totals, order); if ($('order-copy')) $('order-copy').disabled = false; if ($('order-refresh')) $('order-refresh').disabled = false; if ($('order-cancel')) $('order-cancel').disabled = !['awaiting_payment', 'awaiting_confirmation'].includes(order.status);
    updateWhatsapp(true); renderCheckoutTotals(); checkoutStatus(order.status === 'cancelled' ? 'Cancelamento registrado no servidor.' : order.status === 'awaiting_payment' ? 'O pedido ainda aguarda pagamento. O retorno do provedor será conferido pelo servidor.' : order.demo ? 'Registro de demonstração salvo. As etapas acompanham as atualizações do painel.' : 'Pedido registrado. As etapas acompanham as atualizações da loja.'); renderOrders(); emit('order-updated', { order: clone(order) });
  }
  async function submitCheckout(event) {
    event.preventDefault(); if (submitting || !validCheckout()) return; submitting = true; updateSubmitLabel(); if ($('checkout-edit')) $('checkout-edit').disabled = true;
    const payload = checkoutPayload(), submittedCart = JSON.stringify(cart); rememberProfile(payload); updateSummary();
    try {
      if (!await checkHealth()) { checkoutStatus('Resumo offline preparado. Este pedido não foi registrado nem enviado. Copie o resumo se quiser guardá-lo.'); return; }
      const hash = await fingerprint(payload), pending = stored(KEYS.pending), requestId = pending?.fingerprint === hash && typeof pending.requestId === 'string' && /^[a-f0-9-]{36}$/i.test(pending.requestId) ? pending.requestId : uuid();
      save(KEYS.pending, { requestId, fingerprint: hash });
      const response = await api('/orders', { method: 'POST', body: JSON.stringify({ requestId, ...payload }) });
      if (!validOrder(response.order)) throw new Error('Não foi possível validar o recibo. Atualize seus pedidos antes de tentar novamente.');
      forget(KEYS.pending); if (JSON.stringify(cart) === submittedCart) { invalidateUndo(); cart = []; coupon = ''; reward = null; if ($('cart-coupon')) $('cart-coupon').value = ''; persistCart(); renderCart(); }
      displayOrder(response.order); toast(response.order.demo ? 'Pedido de demonstração registrado. Nenhuma cobrança realizada.' : 'Pedido registrado. Confira o acompanhamento.');
    } catch (error) { checkoutStatus(error.http ? error.message : 'Não conseguimos confirmar o registro. Tente novamente: o mesmo pedido será recuperado sem duplicação.'); }
    finally { submitting = false; updateSubmitLabel(); if ($('checkout-edit')) $('checkout-edit').disabled = false; }
  }
  function orderDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: store.timezone || 'America/Sao_Paulo' }).format(date); }
  function repeatOrder(id) {
    if (submitting) return toast('Aguarde o resultado do registro antes de alterar sua sacola.');
    const order = orderCache.get(id); if (!order || !Array.isArray(order.items)) return toast('Consulte o pedido antes de refazê-lo.');
    const next = clone(cart), adjustments = [], unavailable = [];
    let added = 0;
    for (const snapshot of order.items) {
      const found = product(snapshot.productId);
      if (!found || !isAvailable(found)) { unavailable.push(text(snapshot.name,80) || 'Item indisponível'); continue; }
      if (!Number.isInteger(snapshot.quantity) || snapshot.quantity < 1 || snapshot.quantity > MAX_QUANTITY) return toast('O pedido contém uma quantidade inválida. Escolha os itens novamente no cardápio.');
      const requestedExtras = strings((Array.isArray(snapshot.extras) ? snapshot.extras : []).map(value => typeof value === 'string' ? value : value?.id));
      const requestedRemovals = strings(snapshot.removed);
      const bundle = validBundle(snapshot.bundle ? { id: snapshot.bundle.id, sideId: snapshot.bundle.sideId || snapshot.bundle.side?.id, drinkId: snapshot.bundle.drinkId || snapshot.bundle.drink?.id } : null, found);
      if (snapshot.bundle && (!bundle || !isAvailable(bundle.sideId) || !isAvailable(bundle.drinkId))) { unavailable.push(`${found.name} com combo`); continue; }
      const item = {productId:found.id,quantity:snapshot.quantity,extras:found.extras.filter(value=>requestedExtras.includes(value)),removed:found.removable.filter(value=>requestedRemovals.includes(value)),note:text(snapshot.note),bundle};
      if (requestedExtras.some(value=>!item.extras.includes(value)) || requestedRemovals.some(value=>!item.removed.includes(value))) adjustments.push(found.name);
      const existing = next.find(line=>lineKey(line)===lineKey(item));
      if (existing && existing.quantity+item.quantity>MAX_QUANTITY || !existing && next.length>=MAX_LINES) {
        $('orders-dialog')?.close(); openCart(); cartFeedback('Não foi possível refazer: a sacola chegaria ao limite de 99 unidades por combinação ou 40 combinações. Reduza os itens e tente de novo. Nenhum item foi acrescentado.'); return;
      }
      if (existing) existing.quantity += item.quantity; else next.push(item);
      added += item.quantity;
    }
    if (!added) return toast('Os itens deste pedido não estão disponíveis no cardápio atual.');
    invalidateUndo(); cart = next; persistCart(); renderCart(); $('orders-dialog')?.close(); $('checkout-dialog')?.close(); resetCheckout(); openCart();
    const details = [`${added} ${added===1?'item foi acrescentado':'itens foram acrescentados'} à sacola com os preços atuais. Confira antes de concluir. Nenhum pedido foi enviado.`];
    if (unavailable.length) details.push(`Indisponíveis: ${unavailable.join(', ')}.`);
    if (adjustments.length) details.push(`Opções alteradas no cardápio: ${[...new Set(adjustments)].join(', ')}. Confira a personalização.`);
    cartFeedback(details.join(' '));
  }
  function communityActions(order) {
    const actions = node('div', 'order-community-actions');
    if (order.status === 'completed') actions.append(button('Avaliar este pedido', '', { 'data-review-order': order.id }));
    if (order.status !== 'cancelled') actions.append(button('Consultar meu clube', '', { 'data-loyalty-order': order.id }));
    return actions;
  }
  function renderOrders() {
    const list = $('orders-list'); if (!list) return;
    if (!savedOrders.length) { list.replaceChildren(node('p', 'orders-empty', 'Seus pedidos aparecerão aqui após o registro. Resumos offline não são pedidos registrados.')); return; }
    const fragment = document.createDocumentFragment();
    savedOrders.forEach(reference => {
      const order = orderCache.get(reference.id), card = node('article', 'order-card');
      card.append(node('h3', '', `Pedido ${reference.id}`), node('p', 'order-meta', orderDate(reference.createdAt)));
      if (order) {
        card.append(node('p', 'order-status', statusNames[order.status]), node('strong', 'order-total', formatMoney(order.totals.totalCents)));
        const actions = node('div', 'order-actions');
        actions.append(button('Ver pedido', 'order-view', { 'data-order-view': order.id }), button('Atualizar', 'order-refresh', { 'data-order-refresh': order.id }), button('Refazer pedido', 'order-repeat', { 'data-order-repeat': order.id }));
        if (['awaiting_payment', 'awaiting_confirmation'].includes(order.status)) actions.append(button('Cancelar', 'order-cancel', { 'data-order-cancel': order.id }));
        card.append(actions, communityActions(order));
      } else card.append(node('p', 'order-status', 'Status ainda não consultado.'), button('Consultar pedido', 'order-refresh', { 'data-order-refresh': reference.id }));
      fragment.append(card);
    }); list.replaceChildren(fragment);
  }
  async function fetchOrder(reference) { const response = await api(`/orders/${encodeURIComponent(reference.id)}`, { headers: { 'X-Order-Token': reference.token } }); if (!validOrder(response.order)) throw new Error('O servidor retornou um pedido inválido.'); const previous = orderCache.get(reference.id); orderCache.set(reference.id, response.order); if (!previous || previous.updatedAt !== response.order.updatedAt || previous.status !== response.order.status) emit('order-updated', { order: clone(response.order) }); return response.order; }
  async function refreshOrders() { const generation = ++refreshGeneration; renderOrders(); if (!savedOrders.length) return []; const results = await Promise.allSettled(savedOrders.map(reference => fetchOrder(reference))); if (generation !== refreshGeneration) return []; renderOrders(); const successful = results.filter(result => result.status === 'fulfilled').map(result => result.value); if (activeOrder) { const latest = successful.find(order => order.id === activeOrder.id); if (latest) displayOrder(latest); } if (results.some(result => result.status === 'rejected')) toast('Não foi possível atualizar todos os pedidos. O status exibido pode estar desatualizado.'); return successful; }
  async function refreshOne(id) { const reference = savedOrders.find(order => order.id === id); if (!reference) return; try { const order = await fetchOrder(reference); if (activeOrder?.id === id) displayOrder(order); renderOrders(); toast('Status consultado no servidor.'); } catch (error) { toast(error.http ? error.message : 'Servidor indisponível. Não foi possível consultar o status.'); } }
  async function cancelOrder(id) {
    const reference = savedOrders.find(order => order.id === id), order = orderCache.get(id); if (!reference || !['awaiting_payment', 'awaiting_confirmation'].includes(order?.status)) return; if ($('order-cancel')) $('order-cancel').disabled = true;
    try { const response = await api(`/orders/${encodeURIComponent(id)}/cancel`, { method: 'POST', headers: { 'X-Order-Token': reference.token }, body: '{}' }); if (!validOrder(response.order)) throw new Error('Recibo de cancelamento inválido.'); orderCache.set(id, response.order); if (activeOrder?.id === id) displayOrder(response.order); renderOrders(); toast('Cancelamento registrado no servidor.'); }
    catch (error) { toast(error.http ? error.message : 'Não foi possível confirmar o cancelamento. Atualize o pedido antes de tentar novamente.'); await refreshOne(id); }
    finally { if ($('order-cancel') && activeOrder) $('order-cancel').disabled = !['awaiting_payment', 'awaiting_confirmation'].includes(activeOrder.status); }
  }
  function init() {
    const data = window.BRASA_DATA; if (!data || !Array.isArray(data.products) || !Array.isArray(data.extras) || !data.store?.delivery || !data.store?.coupon) { content('menu-count', 'Cardápio indisponível. Recarregue a página.'); return; }
    store = clone(data.store);
    extras = data.extras.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string' && Number.isSafeInteger(item.price) && item.price >= 0).map(item => Object.freeze({ ...item }));
    products = data.products.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string' && Number.isSafeInteger(item.price) && item.price >= 0 && item.photo && typeof item.photo.src === 'string').map(item => Object.freeze({ ...item, ingredients: Object.freeze(strings(item.ingredients)), allergens: Object.freeze(strings(item.allergens)), removable: Object.freeze(strings(item.removable)), extras: Object.freeze(strings(item.extras).filter(id => Boolean(extra(id)))), photo: Object.freeze({ ...item.photo }) }));
    Object.freeze(products); Object.freeze(extras); setupFeedback();
    setupDialog('product-dialog', 'product-close'); setupDialog('cart-dialog', 'cart-close'); setupDialog('checkout-dialog', 'checkout-close'); setupDialog('orders-dialog', 'orders-close');
    hydrate();
    const neighborhood = $('address-neighborhood');
    if (neighborhood) { const placeholder = node('option', '', 'Selecione o bairro'); placeholder.value = ''; neighborhood.replaceChildren(placeholder, ...store.delivery.neighborhoods.map(name => { const option = node('option', '', name); option.value = name; return option; })); }
    applyProfile(); if ($('cart-coupon')) $('cart-coupon').value = coupon; syncFields(); renderMenu(); renderCart(); renderOrders(); void checkHealth();
    document.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target : null; if (!target) return;
      const liked = target.closest('[data-favorite]'); if (liked) { const id = liked.dataset.favorite; if (!product(id)) return; if (favorites.has(id)) favorites.delete(id); else favorites.add(id); save(KEYS.favorites, [...favorites]); renderMenu(); ($('menu-grid')?.querySelector(`[data-favorite="${id}"]`)||$('favorites-only'))?.focus({ preventScroll: true }); return; }
      const selected = target.closest('[data-product]'); if (selected) { event.preventDefault(); openProduct(selected.dataset.product, selected); return; }
      const repeat = target.closest('[data-order-repeat]'); if (repeat) { repeatOrder(repeat.dataset.orderRepeat); return; }
      const view = target.closest('[data-order-view]'); if (view && orderCache.has(view.dataset.orderView)) { $('orders-dialog')?.close(); displayOrder(orderCache.get(view.dataset.orderView)); openDialog('checkout-dialog', $('orders-open')); return; }
      const refresh = target.closest('[data-order-refresh]'); if (refresh) { void refreshOne(refresh.dataset.orderRefresh); return; }
      const cancel = target.closest('[data-order-cancel]'); if (cancel) void cancelOrder(cancel.dataset.orderCancel);
    });
    $('menu-filters')?.addEventListener('click', event => { const control = event.target instanceof Element ? event.target.closest('[data-filter]') : null; if (control && (control.dataset.filter === 'all' || products.some(item => item.category === control.dataset.filter))) { filter = control.dataset.filter; renderMenu(); showMenuResults(); } });
    $('menu-search')?.addEventListener('input', () => { query = fieldValue('menu-search', 100); renderMenu(); });
    $('menu-sort')?.addEventListener('change', () => { sort = ['featured', 'price-asc', 'price-desc', 'name'].includes($('menu-sort').value) ? $('menu-sort').value : 'featured'; renderMenu(); });
    $('favorites-only')?.addEventListener('click', () => { favoritesOnly = !favoritesOnly; renderMenu(); });
    $('menu-reset')?.addEventListener('click', () => { filter = 'all'; query = ''; sort = 'featured'; favoritesOnly = false; if ($('menu-search')) $('menu-search').value = ''; if ($('menu-sort')) $('menu-sort').value = 'featured'; renderMenu(); });
    $('product-options')?.addEventListener('change', () => { $('product-quantity')?.setCustomValidity(''); productFeedback(''); updateProductPrice(); }); $('product-quantity')?.addEventListener('input', () => { $('product-quantity').setCustomValidity(''); productFeedback(''); updateProductPrice(); }); $('product-bundle')?.addEventListener('change', updateProductPrice);
    $('product-removals')?.addEventListener('change',()=>{$('product-quantity')?.setCustomValidity('');productFeedback('');updateProductPrice();});
    $('product-note')?.addEventListener('input',()=>{$('product-quantity')?.setCustomValidity('');productFeedback('');});
    $('product-add')?.addEventListener('click', event => { event.preventDefault(); addSelectedProduct(); }); $('cart-open')?.addEventListener('click', openCart); $('cart-mobile')?.addEventListener('click', openCart);
    $('cart-items')?.addEventListener('click', event => { const control = event.target instanceof Element ? event.target.closest('[data-action][data-index]') : null; if (control) changeCart(control.dataset.action, Number(control.dataset.index)); });
    $('cart-clear')?.addEventListener('click', clearCart);
    $('cart-feedback')?.addEventListener('click', event => { if (event.target instanceof Element && event.target.closest('#cart-undo')) undoRemoval(); });
    $('use-coupon')?.addEventListener('click', useCoupon);
    $('coupon-apply')?.addEventListener('click', applyCoupon); $('cart-coupon')?.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); applyCoupon(); } });
    $('cart-checkout')?.addEventListener('click', () => { void openCheckout(); }); $('checkout-form')?.addEventListener('submit', event => { void submitCheckout(event); });
    const updateForm = () => { $('checkout-form')?.querySelectorAll('input,select,textarea').forEach(field => field.setCustomValidity('')); syncFields(); renderCart(); if (!activeOrder) updateSummary(); };
    $('checkout-form')?.addEventListener('input', updateForm); $('checkout-form')?.addEventListener('change', updateForm); $('fulfilment')?.addEventListener('change', () => { save(KEYS.fulfilment, fulfilment()); updateForm(); });
    $('customer-remember')?.addEventListener('change', () => { if (!$('customer-remember').checked) forget(KEYS.profile); });
    $('checkout-edit')?.addEventListener('click', () => { if (submitting) return; $('checkout-dialog')?.close(); resetCheckout(); openCart(); });
    $('order-copy')?.addEventListener('click', event => { event.preventDefault(); void copySummary(); }); $('order-whatsapp')?.addEventListener('click', event => { if (!activeOrder && !validCheckout()) event.preventDefault(); });
    $('order-refresh')?.addEventListener('click', () => { if (activeOrder) void refreshOne(activeOrder.id); }); $('order-cancel')?.addEventListener('click', () => { if (activeOrder) void cancelOrder(activeOrder.id); });
    $('orders-open')?.addEventListener('click', () => { openDialog('orders-dialog', $('orders-open')); void refreshOrders(); });
    void loadShop(); pollTimer = setInterval(() => { void pollOrders(); }, 15000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { void loadShop(); void pollOrders(); } });
    window.addEventListener('pagehide', () => { clearInterval(pollTimer); });
    window.addEventListener('pageshow', event => { if (event.persisted) { clearInterval(pollTimer); pollTimer = setInterval(() => { void pollOrders(); }, 15000); void loadShop(); } });
    emit('ready', { demo: store.demo });
  }
  const publicApi = Object.freeze({ get products() { return products; }, get extras() { return extras; }, get cart() { return clone(cart); }, get orders() { return clone(savedOrders); }, get activeOrder() { return activeOrder ? clone(activeOrder) : null; }, get shop() { return shop ? clone(shop) : null; }, get reward() { return reward ? { orderId: reward.orderId } : null; }, formatMoney, openProduct, openCart, totals, refreshOrders, api, setDeliveryQuote, applyReward, refreshShop, isAvailable, loadShop });
  window.BrasaCommerce = publicApi; window.BrasaStore = publicApi;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
