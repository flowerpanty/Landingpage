(function () {
  'use strict';
  const heroAction = document.querySelector('.ac-hero-actions .ac-button-primary');
  const sticky = document.querySelector('.ac-mobile-sticky');
  if (heroAction && sticky) {
    const syncSticky = function () {
      const show = window.matchMedia('(max-width: 740px)').matches && heroAction.getBoundingClientRect().bottom < 0;
      sticky.classList.toggle('is-visible', show);
      sticky.inert = !show;
      sticky.setAttribute('aria-hidden', String(!show));
    };
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(syncSticky).observe(heroAction);
    }
    window.addEventListener('scroll', syncSticky, { passive: true });
    window.addEventListener('resize', syncSticky);
    syncSticky();
  }
  const buttons = document.querySelectorAll('.ac-message-choices button[data-msg]');
  const message = document.getElementById('ac-message-text');
  const label = document.getElementById('ac-message-label');
  for (const button of buttons) {
    button.addEventListener('click', function () {
      buttons.forEach(function (item) {
        const selected = item === button;
        item.classList.toggle('is-selected', selected);
        item.setAttribute('aria-pressed', String(selected));
      });
      if (message) message.textContent = button.dataset.msg || 'LOVE';
      if (label) label.textContent = button.dataset.caption || '';
    });
  }
  for (const link of document.querySelectorAll('a[data-event]')) {
    link.addEventListener('click', function () {
      if (typeof window.gtag === 'function') {
        window.gtag('event', link.dataset.event, {
          page_context: 'anniversary_cookie',
          link_url: link.href
        });
      }
    });
  }
})();
