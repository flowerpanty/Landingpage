/* ============================================
   🎄 NOTHINGMATTERS CHRISTMAS — ANIMATIONS
   가볍고 성능 좋은 크리스마스 애니메이션
   ============================================ */

(function() {
  'use strict';

  // Respect reduced motion
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  // ── 1. SNOWFALL (가벼운 눈 내리기) ──
  function createSnowfall() {
    const container = document.createElement('div');
    container.className = 'snowfall-container';
    container.setAttribute('aria-hidden', 'true');
    document.body.appendChild(container);

    const snowChars = ['❄', '❅', '❆', '✦', '·', '•'];
    const maxSnowflakes = 25; // 성능을 위해 제한

    function createSnowflake() {
      if (container.children.length >= maxSnowflakes) {
        container.removeChild(container.firstChild);
      }

      const flake = document.createElement('span');
      flake.className = 'snowflake';
      flake.textContent = snowChars[Math.floor(Math.random() * snowChars.length)];

      const size = 0.6 + Math.random() * 1;
      const left = Math.random() * 100;
      const duration = 8 + Math.random() * 12;
      const delay = Math.random() * 2;

      flake.style.cssText = `
        left: ${left}%;
        font-size: ${size}rem;
        animation-duration: ${duration}s;
        animation-delay: ${delay}s;
        opacity: ${0.3 + Math.random() * 0.5};
      `;

      container.appendChild(flake);

      // Clean up after animation ends
      setTimeout(() => {
        if (flake.parentNode) flake.remove();
      }, (duration + delay) * 1000);
    }

    // Create initial batch
    for (let i = 0; i < 12; i++) {
      setTimeout(createSnowflake, i * 300);
    }

    // Add new snowflakes periodically
    setInterval(createSnowflake, 1500);
  }

  // ── 2. SCROLL REVEAL (스크롤 리빌) ──
  function initScrollReveal() {
    const sections = document.querySelectorAll('.christmas-section');
    const products = document.querySelectorAll('.christmas-product');
    const occasions = document.querySelectorAll('.christmas-occasion-grid');
    const timeline = document.querySelectorAll('.christmas-timeline');
    const faq = document.querySelectorAll('.christmas-faq');

    // Add reveal classes
    sections.forEach(el => el.classList.add('xmas-reveal'));
    products.forEach(el => el.classList.add('xmas-reveal'));

    occasions.forEach(el => el.classList.add('xmas-reveal-stagger'));
    timeline.forEach(el => el.classList.add('xmas-reveal-stagger'));
    faq.forEach(el => el.classList.add('xmas-reveal-stagger'));

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('xmas-visible');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -40px 0px'
    });

    document.querySelectorAll('.xmas-reveal, .xmas-reveal-stagger').forEach(el => {
      observer.observe(el);
    });
  }

  // ── 3. CURSOR SPARKLE (커서 반짝이) ──
  function initCursorSparkle() {
    const sparkleEmojis = ['✦', '⭐', '❄', '✨', '🎄'];
    let lastSparkle = 0;
    const throttleMs = 120; // 성능을 위해 쓰로틀

    document.addEventListener('mousemove', (e) => {
      const now = Date.now();
      if (now - lastSparkle < throttleMs) return;
      lastSparkle = now;

      // Only 30% chance to create a sparkle (more subtle)
      if (Math.random() > 0.3) return;

      const sparkle = document.createElement('span');
      sparkle.className = 'cursor-sparkle';
      sparkle.textContent = sparkleEmojis[Math.floor(Math.random() * sparkleEmojis.length)];
      sparkle.style.left = e.clientX + 'px';
      sparkle.style.top = e.clientY + 'px';

      document.body.appendChild(sparkle);

      setTimeout(() => sparkle.remove(), 800);
    }, { passive: true });
  }

  // ── 4. FAQ SMOOTH TOGGLE ──
  function initFAQToggle() {
    const details = document.querySelectorAll('.christmas-faq details');
    details.forEach(detail => {
      detail.addEventListener('toggle', () => {
        if (detail.open) {
          // Close others
          details.forEach(d => {
            if (d !== detail && d.open) d.open = false;
          });
        }
      });
    });
  }

  // ── 5. BUTTON HOVER SOUND EFFECT (visual only) ──
  function initButtonEffects() {
    const buttons = document.querySelectorAll('.christmas-button, .showroom-button');
    buttons.forEach(btn => {
      btn.addEventListener('mouseenter', () => {
        btn.style.setProperty('--bounce', '1');
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.setProperty('--bounce', '0');
      });
    });
  }

  // ── 6. PARALLAX DOODLES (subtle) ──
  function initParallaxDoodles() {
    const doodles = document.querySelectorAll('.christmas-doodle, .christmas-holiday-art');
    let ticking = false;

    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const scrollY = window.pageYOffset;
          doodles.forEach((doodle, i) => {
            const speed = 0.02 + (i % 3) * 0.01;
            const rect = doodle.getBoundingClientRect();
            if (rect.top < window.innerHeight && rect.bottom > 0) {
              const offset = scrollY * speed;
              doodle.style.transform = `translateY(${offset % 10}px)`;
            }
          });
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  // ── Initialize Everything ──
  function init() {
    createSnowfall();
    initScrollReveal();
    initCursorSparkle();
    initFAQToggle();
    initButtonEffects();
    initParallaxDoodles();

    console.log('🎄 Merry Sweet Christmas! — nothingmatters holiday 2026');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
