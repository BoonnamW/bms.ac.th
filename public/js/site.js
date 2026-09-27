(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // ---------- mobile nav ----------
  const burger = $('#burger'), nav = $('#nav');
  burger?.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    burger.setAttribute('aria-expanded', open);
  });
  $$('.sub-btn').forEach((b) => b.addEventListener('click', () => {
    const li = b.parentElement, open = li.classList.toggle('open');
    b.setAttribute('aria-expanded', open);
  }));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { nav?.classList.remove('open'); $$('.has-sub.open').forEach((l) => l.classList.remove('open')); }
  });

  // ---------- hero slider ----------
  const slides = $$('.hero .slide');
  if (slides.length > 1) {
    const dots = $$('#dots button');
    let i = 0, timer;
    const go = (n) => {
      slides[i].classList.remove('on'); dots[i].classList.remove('on');
      i = (n + slides.length) % slides.length;
      slides[i].classList.add('on'); dots[i].classList.add('on');
    };
    const auto = () => { clearInterval(timer); if (!matchMedia('(prefers-reduced-motion: reduce)').matches) timer = setInterval(() => go(i + 1), 6500); };
    $('#next').addEventListener('click', () => { go(i + 1); auto(); });
    $('#prev').addEventListener('click', () => { go(i - 1); auto(); });
    dots.forEach((d, n) => d.addEventListener('click', () => { go(n); auto(); }));
    const hero = $('#hero');
    hero.addEventListener('mouseenter', () => clearInterval(timer));
    hero.addEventListener('mouseleave', auto);
    auto();
  }

  // ---------- news tabs (หน้าแรก) ----------
  const tabs = $('#tabs');
  tabs?.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    $$('button', tabs).forEach((x) => x.classList.toggle('on', x === b));
    let shown = 0;
    $$('#newsGrid .card').forEach((c) => {
      const ok = !b.dataset.cat || c.dataset.cat === b.dataset.cat;
      c.hidden = !ok; if (ok) shown++;
    });
    $('#newsEmpty').hidden = shown > 0;
  });

  // ---------- reveal + counters ----------
  const fmt = (n) => n.toLocaleString('th-TH');
  const count = (el) => {
    const to = +el.dataset.to || 0, t0 = performance.now(), dur = 1600;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      el.textContent = fmt(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      $$('.count', e.target).forEach(count);
      io.unobserve(e.target);
    }), { threshold: 0.12 });
    $$('.reveal').forEach((el, n) => { el.style.transitionDelay = `${(n % 6) * 70}ms`; io.observe(el); });
  } else {
    $$('.reveal').forEach((el) => el.classList.add('in'));
    $$('.count').forEach((el) => (el.textContent = fmt(+el.dataset.to || 0)));
  }
})();
