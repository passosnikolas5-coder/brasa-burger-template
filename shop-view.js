(() => {
  'use strict';
  function init() {
    const grid = document.getElementById('menu-grid');
    const controls = [...document.querySelectorAll('[data-menu-view]')];
    const key = 'brasa-burger-menu-view-v1';
    let view = 'photos';
    try { if (localStorage.getItem(key) === 'list') view = 'list'; } catch { /* View preferences are optional. */ }
    function update() {
      grid?.classList.toggle('is-list', view === 'list');
      controls.forEach(control => control.setAttribute('aria-pressed', String(control.dataset.menuView === view)));
    }
    controls.forEach(control => control.addEventListener('click', () => {
      view = control.dataset.menuView === 'list' ? 'list' : 'photos';
      update();
      try { localStorage.setItem(key, view); } catch { /* Shopping still works without storage. */ }
    }));
    update();
    const burgers = (window.BrasaCommerce?.products || []).filter(item => ['bovino', 'frango', 'vegetariano'].includes(item.category));
    const price = document.getElementById('hero-starting-price');
    if (price && burgers.length) price.textContent = `Burgers a partir de ${window.BrasaCommerce.formatMoney(Math.min(...burgers.map(item => item.price)))}`;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
