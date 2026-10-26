(() => {
  'use strict';
  const root = document.querySelector('.museum-page');
  const initialized = Symbol.for('nothingmatters.museum.analytics');
  if (!root || window[initialized]) return;
  window[initialized] = true;

  const products = new Set(['cookie-flight', 'cookie-crew', 'terminal-sand-cookie', 'handmade-cookie']);
  const actions = {
    pickup: { destination: 'naver_pickup', collection: 'museum_pickup_click', floating: 'museum_floating_pickup_click' },
    shipping: { destination: 'smartstore_shipping', collection: 'museum_shipping_click', floating: 'museum_floating_shipping_click' },
    inquiry: { destination: 'kakao_inquiry', collection: 'museum_shipping_inquiry_click' },
  };

  document.addEventListener('click', event => {
    const link = event.target?.closest?.('a[data-museum-action]');
    if (!link || !root.contains(link) || !link.closest('.museum-purchase-actions, .museum-mobile-actions')) return;
    const action = actions[link.dataset.museumAction];
    const product = link.closest('[data-museum-product]')?.dataset.museumProduct;
    const placement = link.closest('.museum-mobile-actions') ? 'floating' : 'collection';
    if (!action?.[placement] || !products.has(product) || typeof window.gtag !== 'function') return;
    try {
      window.gtag('event', action[placement], {
        product_id: product,
        placement,
        destination_type: action.destination,
        page_path: '/national-aviation-museum/',
      });
    } catch {
      // Analytics is optional. Native link navigation must never depend on it.
    }
  });
})();
