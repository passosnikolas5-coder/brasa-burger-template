(() => {
  'use strict';
  const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const categories = new Set(['bovino', 'frango', 'vegetariano']);
  const create = (tag, className, value) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value !== undefined) element.textContent = value;
    return element;
  };
  function init() {
    const dialog = document.getElementById('finder-dialog');
    const form = document.getElementById('finder-form');
    const api = window.BrasaCommerce;
    if (!dialog || !form || !api) return;
    let trigger = null, productHandoff = false;
    const value = name => form.querySelector(`input[name="${name}"]:checked`)?.value || 'all';
    const matches = () => {
      const type = value('finder-type'), ingredient = value('finder-ingredient'), budget = value('finder-budget');
      return api.products.filter(item => categories.has(item.category) && api.isAvailable(item)
        && (type === 'all' || item.category === type)
        && (ingredient === 'all' || item.ingredients.some(part => normalize(part).includes(ingredient)))
        && (budget === 'all' || item.price <= Number(budget)))
        .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name, 'pt-BR')).slice(0, 6);
    };
    const photoFor = item => {
      if (window.BrasaExperience?.photoFor) {
        const image = window.BrasaExperience.photoFor(item, '(max-width: 760px) 82px, 96px');
        image.className = 'finder-photo'; image.alt = ''; image.setAttribute('aria-hidden', 'true'); return image;
      }
      const photo = item.photo, image = create(photo?.columns === 1 && photo?.rows === 1 ? 'img' : 'div', 'finder-photo');
      image.setAttribute('aria-hidden', 'true');
      if (!photo) return image;
      if (image.tagName === 'IMG') {
        image.src = photo.smallSrc || photo.src;
        if (photo.smallSrc) image.srcset = `${photo.smallSrc} 640w, ${photo.src} ${photo.width}w`;
        image.sizes = '(max-width: 760px) 82px, 96px'; image.width = photo.width; image.height = photo.height;
        image.alt = ''; image.loading = 'lazy'; image.decoding = 'async'; return image;
      }
      image.style.backgroundImage = `url("${photo.src.replace(/"/g, '%22')}")`;
      image.style.backgroundSize = `${photo.columns * 100}% ${photo.rows * 100}%`;
      image.style.backgroundPosition = `${photo.columns > 1 ? photo.col / (photo.columns - 1) * 100 : 0}% ${photo.rows > 1 ? photo.row / (photo.rows - 1) * 100 : 0}%`;
      return image;
    };
    function render() {
      const items = matches(), fragment = document.createDocumentFragment();
      items.forEach(item => {
        const card = create('article', 'finder-card');
        card.dataset.finderResult = item.id;
        const copy = create('div', 'finder-card-copy');
        const name = create('h3', '', item.name);
        const ingredients = create('p', 'finder-card-ingredients', item.ingredients.join(' · '));
        const bottom = create('div', 'finder-card-bottom');
        const choose = create('button', 'finder-personalize', 'Personalizar');
        choose.type = 'button'; choose.dataset.finderProduct = item.id;
        choose.setAttribute('aria-label', `Personalizar ${item.name}`);
        bottom.append(create('strong', 'finder-price', api.formatMoney(item.price)), choose);
        copy.append(name, ingredients, bottom); card.append(photoFor(item), copy); fragment.append(card);
      });
      document.getElementById('finder-results').replaceChildren(fragment);
      document.getElementById('finder-empty').hidden = items.length > 0;
      document.getElementById('finder-count').textContent = items.length
        ? `${items.length} ${items.length === 1 ? 'burger combina' : 'burgers combinam'} com suas escolhas`
        : 'Nenhuma opção com essas escolhas';
    }
    function reset() { form.reset(); render(); }
    function open(control) {
      if (dialog.open) return;
      trigger = control; productHandoff = false; render(); dialog.showModal();
      document.getElementById('finder-title').focus({ preventScroll: true });
    }
    document.addEventListener('click', event => {
      const control = event.target instanceof Element ? event.target.closest('#burger-finder-open, [data-open-finder]') : null;
      if (control) { event.preventDefault(); open(control); }
    });
    document.getElementById('finder-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex="0"]'))
        .filter(control => control.getClientRects().length > 0 && (control.type !== 'radio' || control.checked));
      const first = controls[0], last = controls[controls.length - 1];
      if (!first) return;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !controls.includes(active))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (active === last || !controls.includes(active))) {
        event.preventDefault(); first.focus();
      }
    });
    dialog.addEventListener('click', event => {
      if (event.target === dialog) {
        const rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
      }
      const choose = event.target instanceof Element ? event.target.closest('[data-finder-product]') : null;
      if (!choose) return;
      const item = api.products.find(product => product.id === choose.dataset.finderProduct);
      if (!item || !categories.has(item.category)) return;
      const returnTo = trigger?.isConnected ? trigger : document.getElementById('burger-finder-open');
      productHandoff = true;
      dialog.close();
      api.openProduct(item.id, returnTo);
    });
    dialog.addEventListener('close', () => {
      if (!productHandoff && trigger?.isConnected) trigger.focus({ preventScroll: true });
      productHandoff = false;
    });
    form.addEventListener('change', render);
    document.addEventListener('brasa:shop-change', () => { if (dialog.open) render(); });
    form.addEventListener('submit', event => event.preventDefault());
    document.getElementById('finder-reset').addEventListener('click', reset);
    document.getElementById('finder-empty-reset').addEventListener('click', () => {
      reset(); form.querySelector('input[name="finder-type"]')?.focus({ preventScroll: true });
    });
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
