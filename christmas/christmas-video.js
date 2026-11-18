/* Native product previews: no player dependency or offscreen video downloads. */
(() => {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection;
  const gallery = document.getElementById('xmas-gallery');
  document.querySelectorAll('[data-product-video]').forEach(thumbnail => {
    const video = thumbnail.querySelector('video');
    const toggle = thumbnail.closest('figure').querySelector('.xmas-video-toggle');
    if (!video || !toggle) return;
    let visible = false, userPaused = false, manual = false, starting = false, failed = false;
    video.muted = video.defaultMuted = true;
    toggle.hidden = false;
    const label = () => {
      toggle.textContent = video.paused ? '영상 재생' : '영상 멈춤';
      toggle.setAttribute('aria-label', `${thumbnail.dataset.productVideo} ${toggle.textContent}`);
    };
    const shouldPlay = () => visible && !document.hidden && !gallery?.open && !failed && !userPaused && (manual || (!motion.matches && !connection?.saveData));
    const sync = () => {
      if (!shouldPlay()) { video.pause(); return; }
      if (!video.paused || starting) return;
      starting = true;
      if (!video.hasAttribute('src')) video.src = video.dataset.src;
      video.play().then(() => {
        if (!shouldPlay()) video.pause();
      }).catch(error => {
        if (error.name !== 'AbortError') userPaused = true;
        label();
      }).finally(() => { starting = false; });
    };
    video.addEventListener('playing', () => { thumbnail.setAttribute('data-playing', ''); label(); });
    video.addEventListener('pause', label);
    video.addEventListener('error', () => {
      failed = true;
      video.pause();
      thumbnail.removeAttribute('data-playing');
      toggle.hidden = true;
    });
    toggle.addEventListener('click', () => {
      userPaused = !video.paused;
      manual = true;
      sync();
    });
    label();
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        visible = entries[0].isIntersecting && entries[0].intersectionRatio >= .15;
        sync();
      }, { threshold: [0, .15] });
      observer.observe(thumbnail);
    } else { visible = true; userPaused = true; }
    document.addEventListener('visibilitychange', sync);
    const preferencesChanged = () => { manual = false; sync(); };
    motion.addEventListener('change', preferencesChanged);
    connection?.addEventListener('change', preferencesChanged);
    if (gallery) new MutationObserver(sync).observe(gallery, { attributes: true, attributeFilter: ['open'] });
  });
})();
