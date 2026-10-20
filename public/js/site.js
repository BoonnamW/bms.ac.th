/* สคริปต์หน้าเว็บไซต์ — ไม่มี inline script/style (เป็นไปตาม CSP) สร้างเนื้อหาด้วย textContent เท่านั้น */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const smooth = reduced ? 'auto' : 'smooth';
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const getCookie = (k) => {
    const m = document.cookie.match(new RegExp(`(?:^|; )${k}=([^;]*)`));
    try { return m ? decodeURIComponent(m[1]) : ''; } catch { return ''; }
  };
  const setCookie = (k, v, days) => {
    document.cookie = `${k}=${encodeURIComponent(v)}; Max-Age=${days * 86400}; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  };
  // ไอคอนจาก <template id="icons"> ที่เซิร์ฟเวอร์สร้างไว้ (ชุดเดียวกับในหน้าเว็บ)
  const icon = (name, size) => {
    const svg = $('#icons')?.content.querySelector(`[data-i="${name}"] svg`);
    if (!svg) return document.createTextNode('');
    const c = svg.cloneNode(true);
    if (size) { c.setAttribute('width', size); c.setAttribute('height', size); }
    return c;
  };
  const getJSON = (url) => fetch(url, { headers: { Accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))));
  // แต่ละส่วนทำงานแยกกัน — ส่วนใดผิดพลาดจะไม่ทำให้ส่วนอื่นหยุดทำงาน
  const part = (name, fn) => { try { fn(); } catch (err) { console.error(`[site] ${name}`, err); } };
  let openNav = () => {};

  // ---------- ขนาดตัวอักษร / ความคมชัดสูง (จำค่าไว้ในคุกกี้ เซิร์ฟเวอร์ใส่ให้ตั้งแต่โหลดหน้า) ----------
  part('a11y', () => {
    const FS = ['md', 'lg', 'sm'];
    const fs = () => root.dataset.fs || 'md';
    const sync = () => {
      $$('button[data-fs]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fs === fs())));
      $$('[data-hc]').forEach((b) => b.setAttribute('aria-pressed', String(root.classList.contains('hc'))));
    };
    const save = () => setCookie('a11y', [fs(), root.classList.contains('hc') ? 'hc' : ''].filter(Boolean).join('.'), 365);
    const setFs = (v) => { if (v === 'md') delete root.dataset.fs; else root.dataset.fs = v; sync(); save(); };
    // หน้าที่เปิดจากแคชตอนออฟไลน์อาจยังไม่มีค่า — ใส่จากคุกกี้อีกครั้ง
    const saved = getCookie('a11y');
    if (saved) {
      const v = (saved.match(/\b(sm|lg)\b/) || [])[1];
      if (v) root.dataset.fs = v; else delete root.dataset.fs;
      root.classList.toggle('hc', /\bhc\b/.test(saved));
    }
    $$('button[data-fs]').forEach((b) => b.addEventListener('click', () => setFs(b.dataset.fs)));
    $$('[data-fs-cycle]').forEach((b) => b.addEventListener('click', () => setFs(FS[(FS.indexOf(fs()) + 1) % FS.length])));
    $$('[data-hc]').forEach((b) => b.addEventListener('click', () => { root.classList.toggle('hc'); sync(); save(); }));
    sync();
  });

  // ---------- รูปที่โหลดไม่ได้ (เช่น รูปที่ยังอยู่บนเว็บเดิม): ใช้รูปสำรอง หรือเอารูปที่เสียออก ----------
  part('images', () => {
    const fix = (img) => {
      const alt = img.dataset.fallback;
      if (alt && img.getAttribute('src') !== alt) { img.src = alt; return; }
      if (!img.closest('.prose')) img.remove(); // รูปในเนื้อหาข่าว/หน้าเว็บคงไว้ ให้ผู้ดูแลเห็นว่ารูปหาย
    };
    document.addEventListener('error', (e) => { if (e.target.tagName === 'IMG') fix(e.target); }, true);
    $$('img').forEach((img) => { if (img.complete && img.getAttribute('src') && !img.naturalWidth) fix(img); });
  });

  // ---------- ป๊อปอัปก่อนเข้าเว็บ (หน้าแรก): ครั้งเดียวต่อการเปิดเว็บ / วันละครั้ง / ทุกครั้ง ตามที่ตั้งไว้ ----------
  part('popup', () => {
    const d = $('#popup');
    if (!d || typeof d.showModal !== 'function') return;
    const freq = d.dataset.frequency;
    const key = `popup-${d.dataset.key}`, today = new Date().toLocaleDateString('en-CA');
    let store = null;
    try { store = freq === 'day' ? localStorage : sessionStorage; } catch { /* เบราว์เซอร์ปิดการเก็บข้อมูล */ }
    let seen = '';
    try { seen = store?.getItem(key) || ''; } catch { /* เช่นเดียวกัน */ }
    if (freq !== 'always' && (freq === 'day' ? seen === today : seen)) return;
    d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
    // โปสเตอร์/ไว้อาลัย: ย่อภาพให้ภาพและข้อความใต้ภาพพอดีจอ ไม่ต้องเลื่อน
    const fit = () => {
      const cap = $('.popup-b', d);
      if (cap && d.open && d.matches('.p-poster, .p-mourning')) for (let i = 0; i < 2; i++) d.style.setProperty('--cap', `${cap.offsetHeight}px`);
    };
    addEventListener('resize', fit);
    const show = () => {
      d.showModal();
      fit();
      try { store?.setItem(key, today); } catch { /* ไม่เป็นไร */ } // แสดงแล้ว = เห็นแล้ว
    };
    // รอภาพโหลดก่อน (สูงสุด 2.5 วินาที) กล่องจะได้ขนาดพอดีภาพตั้งแต่แรก ไม่กระตุก
    const img = $('.popup-img img', d);
    if (img && !img.complete && img.decode) Promise.race([img.decode().catch(() => {}), new Promise((r) => setTimeout(r, 2500))]).then(show);
    else show();
  });

  // ---------- ประกาศสำคัญ (ปิดแล้วไม่แสดงซ้ำจนกว่าจะมีประกาศใหม่) ----------
  part('announce', () => {
    const a = $('#announce');
    if (!a) return;
    if (getCookie('ann') === a.dataset.key) { a.remove(); return; }
    $('.ann-x', a)?.addEventListener('click', () => { setCookie('ann', a.dataset.key, 60); a.remove(); });
  });

  // ---------- เมนูหลัก ----------
  part('nav', () => {
    const burger = $('#burger'), nav = $('#nav');
    if (!burger || !nav) return;
    const desktop = matchMedia('(min-width: 1101px)');
    const behind = ['.topbar', '#announce', '#main', '.footer', '.fab'];
    const isOpen = () => nav.classList.contains('open');
    const setOpen = (open, focusBurger) => {
      nav.classList.toggle('open', open);
      document.body.classList.toggle('nav-open', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'ปิดเมนู' : 'เปิดเมนู');
      behind.forEach((s) => { const x = $(s); if (x) x.inert = open; }); // กันโฟกัสหลุดไปด้านหลังเมนู
      if (open) $('.nav-top', nav)?.focus();
      else if (focusBurger) burger.focus();
    };
    openNav = () => { if (!desktop.matches && !isOpen()) setOpen(true); };
    burger.addEventListener('click', () => setOpen(!isOpen()));

    const closeSubs = (except) => $$('.has-sub.open', nav).forEach((li) => {
      if (li === except) return;
      li.classList.remove('open');
      $('.sub-btn', li)?.setAttribute('aria-expanded', 'false');
    });
    $$('.sub-btn', nav).forEach((b) => {
      const li = b.parentElement;
      b.addEventListener('click', () => {
        const open = !li.classList.contains('open');
        closeSubs(li);
        li.classList.toggle('open', open);
        b.setAttribute('aria-expanded', String(open));
      });
      // จอใหญ่: เลื่อนโฟกัสออกจากเมนูย่อยแล้วปิดให้เอง
      li.addEventListener('focusout', (e) => { if (desktop.matches && !li.contains(e.relatedTarget)) closeSubs(); });
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.has-sub')) closeSubs();
      if (isOpen() && !nav.contains(e.target) && !burger.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const sub = document.activeElement?.closest?.('.has-sub.open');
      closeSubs();
      if (sub) $('.sub-btn', sub)?.focus();
      else if (isOpen()) setOpen(false, true);
    });
    desktop.addEventListener('change', (m) => { if (m.matches && isOpen()) setOpen(false); });
  });

  // ---------- ค้นหาด่วน (Ctrl K) ----------
  part('search', () => {
    const form = $('#hsearch'), q = $('#q'), box = $('#suggest');
    if (!form || !q || !box) return;
    const kbd = $('kbd', form);
    if (kbd && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) kbd.textContent = '⌘ K';
    let timer = 0, seq = 0, active = -1;
    const options = () => $$('a', box);
    const close = () => {
      box.hidden = true; active = -1;
      q.setAttribute('aria-expanded', 'false');
      q.removeAttribute('aria-activedescendant');
    };
    const mark = (n) => {
      const list = options();
      if (!list.length) return;
      active = (n + list.length) % list.length;
      list.forEach((a, k) => { a.classList.toggle('on', k === active); a.setAttribute('aria-selected', String(k === active)); });
      q.setAttribute('aria-activedescendant', list[active].id);
      list[active].scrollIntoView({ block: 'nearest' });
    };
    const option = (cls, text, href, k) => {
      const a = el('a', cls, text);
      a.href = href; a.id = `sg-${k}`;
      a.setAttribute('role', 'option'); a.setAttribute('aria-selected', 'false');
      return a;
    };
    const render = (term, results) => {
      box.replaceChildren();
      results.forEach((x, k) => {
        const a = option('', null, x.url, k);
        if (/^https?:/.test(x.url)) { a.target = '_blank'; a.rel = 'noopener'; }
        a.append(el('span', '', x.title), el('small', '', x.type));
        box.append(a);
      });
      if (!results.length) box.append(el('p', 's-none', `ไม่พบ “${term}” ในชื่อเมนู หน้าเว็บ และข่าว`));
      box.append(option('s-all', `ค้นหา “${term}” ทั้งหมด`, `/search?q=${encodeURIComponent(term)}`, results.length));
      box.hidden = false; active = -1;
      q.setAttribute('aria-expanded', 'true');
    };
    const lookup = () => {
      const term = q.value.trim();
      if (term.length < 2) { close(); return; }
      const my = ++seq;
      getJSON(`/api/search?q=${encodeURIComponent(term)}`)
        .then((d) => { if (my === seq && q.value.trim() === term) render(term, d.results || []); })
        .catch(() => {}); // ค้นหาด่วนใช้ไม่ได้ ยังกด Enter ไปหน้าค้นหาได้ตามปกติ
    };
    q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(lookup, 180); });
    q.addEventListener('focus', () => { if (box.childElementCount && q.value.trim().length >= 2) { box.hidden = false; q.setAttribute('aria-expanded', 'true'); } });
    q.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (box.hidden) { lookup(); return; }
        const down = e.key === 'ArrowDown';
        mark(active < 0 ? (down ? 0 : options().length - 1) : active + (down ? 1 : -1));
      } else if (e.key === 'Enter' && active >= 0 && !box.hidden) {
        e.preventDefault();
        options()[active].click();
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        if (!box.hidden) close(); else q.blur();
      }
    });
    document.addEventListener('click', (e) => { if (!form.contains(e.target)) close(); });
    document.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'k') return;
      e.preventDefault();
      if (q.offsetParent) { q.focus(); q.select(); return; }
      openNav(); // จอเล็ก: ช่องค้นหาอยู่ในเมนู
      $('.nav-search input')?.focus();
    });
  });

  // ---------- แถบแท็บที่เลื่อนแนวนอนได้ (จอเล็ก): เลื่อนให้เห็นแท็บที่เลือกอยู่ ----------
  part('tabs', () => {
    $$('.tabs .on').forEach((a) => {
      const bar = a.parentElement;
      if (bar.scrollWidth <= bar.clientWidth) return;
      bar.scrollLeft += a.getBoundingClientRect().left - bar.getBoundingClientRect().left - (bar.clientWidth - a.offsetWidth) / 2;
    });
  });

  // ---------- ภาพสไลด์หน้าแรก ----------
  part('hero', () => {
    const hero = $('#hero');
    const slides = hero ? $$('.slide', hero) : [];
    if (slides.length < 2) return;
    const dots = $$('#dots button');
    let i = 0, timer = 0, hold = false;
    const go = (n) => {
      slides[i].classList.remove('on');
      dots[i]?.classList.remove('on'); dots[i]?.removeAttribute('aria-current');
      i = (n + slides.length) % slides.length;
      slides[i].classList.add('on');
      dots[i]?.classList.add('on'); dots[i]?.setAttribute('aria-current', 'true');
    };
    const stop = () => { clearInterval(timer); timer = 0; };
    const play = () => { stop(); if (!reduced && !hold && !document.hidden) timer = setInterval(() => go(i + 1), 6500); };
    const step = (d) => { go(i + d); play(); };
    $('#next')?.addEventListener('click', () => step(1));
    $('#prev')?.addEventListener('click', () => step(-1));
    dots.forEach((d, n) => d.addEventListener('click', () => { go(n); play(); }));
    dots[0]?.setAttribute('aria-current', 'true');
    hero.addEventListener('mouseenter', () => { hold = true; stop(); });
    hero.addEventListener('mouseleave', () => { hold = false; play(); });
    hero.addEventListener('focusin', () => { hold = true; stop(); });
    hero.addEventListener('focusout', (e) => { if (!hero.contains(e.relatedTarget)) { hold = false; play(); } });
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : play()));
    let x0 = null; // ปัดซ้าย/ขวาบนจอสัมผัส
    hero.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    hero.addEventListener('touchend', (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
    });
    play();
  });

  // ---------- แท็บหมวดข่าวหน้าแรก (โหลดจาก /api/news ไม่ต้องเปลี่ยนหน้า) ----------
  part('newsTabs', () => {
    const tabs = $('#newsTabs'), feat = $('#newsFeat');
    if (!tabs || !feat) return;
    const more = $('.sec-h .more', tabs.parentElement);
    let seq = 0;
    const pic = (n, cls, size) => {
      const a = el('a', cls);
      a.href = n.url; a.tabIndex = -1; a.setAttribute('aria-hidden', 'true');
      if (n.image) {
        const img = el('img'); img.src = n.image; img.alt = ''; img.loading = 'lazy';
        a.append(img);
      } else {
        const ph = el('div', `ph ph-${n.id % 5}`); ph.append(icon('book', size));
        a.append(ph);
      }
      return a;
    };
    const meta = (n) => { const p = el('p', 'meta-row'); p.append(el('span', 'chip', n.category), el('time', '', n.date)); return p; };
    const heading = (n) => { const h = el('h3'), a = el('a', '', n.title); a.href = n.url; h.append(a); return h; };
    const build = (items) => {
      if (!items.length) { feat.replaceChildren(el('p', 'empty', 'ยังไม่มีข่าวในหมวดนี้')); return; }
      const [f, ...rest] = items;
      const main = el('article', 'nf-main');
      main.append(pic(f, 'nf-img', 48), meta(f), heading(f));
      if (f.excerpt) main.append(el('p', 'ex', f.excerpt));
      const rm = el('a', 'readmore', 'อ่านต่อ '); rm.href = f.url; rm.append(icon('arrow', 15));
      main.append(rm);
      const list = el('div', 'nf-list');
      rest.forEach((n) => {
        const art = el('article', 'nf-item'), body = el('div');
        body.append(meta(n), heading(n));
        art.append(pic(n, 'nf-thumb', 26), body);
        list.append(art);
      });
      feat.replaceChildren(main, list);
    };
    tabs.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-cat]');
      if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button) return;
      e.preventDefault();
      if (a.classList.contains('on')) return;
      $$('a', tabs).forEach((x) => {
        x.classList.toggle('on', x === a);
        if (x === a) x.setAttribute('aria-current', 'true'); else x.removeAttribute('aria-current');
      });
      if (more) more.href = a.href;
      feat.classList.add('loading'); feat.setAttribute('aria-busy', 'true');
      const my = ++seq;
      getJSON(`/api/news?limit=4${a.dataset.cat ? `&cat=${encodeURIComponent(a.dataset.cat)}` : ''}`)
        .then((d) => { if (my === seq) build(d.items || []); })
        .catch(() => { location.href = a.href; })
        .finally(() => { if (my === seq) { feat.classList.remove('loading'); feat.removeAttribute('aria-busy'); } });
    });
  });

  // ---------- แถบเลื่อน (ผลงาน / ภาพกิจกรรม) ----------
  part('sliders', () => {
    $$('[data-slider]').forEach((sl) => {
      const track = $('.sl-track', sl);
      if (!track) return;
      const pause = $('[data-pause]', sl);
      const step = () => {
        const first = track.firstElementChild;
        const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
        const w = first ? first.getBoundingClientRect().width + gap : track.clientWidth;
        return Math.max(w, Math.floor(track.clientWidth / w) * w);
      };
      const move = (dir) => {
        const end = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
        const start = track.scrollLeft <= 4;
        if (dir > 0 && end) track.scrollTo({ left: 0, behavior: smooth });
        else if (dir < 0 && start) track.scrollTo({ left: track.scrollWidth, behavior: smooth });
        else track.scrollBy({ left: dir * step(), behavior: smooth });
      };
      const ms = Number(sl.dataset.auto) || 0;
      let timer = 0, hold = false, seen = false, paused = reduced;
      const tick = () => { if (!hold && !paused && seen && !document.hidden) move(1); };
      const restart = () => { if (!ms) return; clearInterval(timer); timer = setInterval(tick, ms); };
      $('[data-prev]', sl)?.addEventListener('click', () => { move(-1); restart(); });
      $('[data-next]', sl)?.addEventListener('click', () => { move(1); restart(); });
      if (!ms) { pause?.remove(); return; }
      pause?.setAttribute('aria-pressed', String(paused));
      pause?.addEventListener('click', () => { paused = !paused; pause.setAttribute('aria-pressed', String(paused)); restart(); });
      sl.addEventListener('mouseenter', () => { hold = true; });
      sl.addEventListener('mouseleave', () => { hold = false; });
      sl.addEventListener('focusin', () => { hold = true; });
      sl.addEventListener('focusout', (e) => { if (!sl.contains(e.relatedTarget)) hold = false; });
      if ('IntersectionObserver' in window) new IntersectionObserver((es) => { seen = es[0].isIntersecting; }, { threshold: 0.3 }).observe(sl);
      else seen = true;
      restart();
    });
  });

  // ---------- เลื่อนแล้วค่อยแสดง + ตัวเลขนับขึ้น (เฉพาะส่วนที่อยู่ใต้จอตอนเปิดหน้า) ----------
  part('reveal', () => {
    const items = $$('.reveal');
    if (!items.length || reduced || !('IntersectionObserver' in window)) return;
    const count = (c) => {
      const raw = c.dataset.to || '0', to = Number(raw) || 0;
      if (!to) return;
      const dec = (raw.split('.')[1] || '').length, t0 = performance.now(), dur = 1400;
      const f = (n) => n.toLocaleString('th-TH', { minimumFractionDigits: dec, maximumFractionDigits: dec });
      const frame = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        c.textContent = f(to * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(frame);
      };
      c.textContent = f(0);
      requestAnimationFrame(frame);
    };
    const io = new IntersectionObserver((entries) => {
      entries.filter((e) => e.isIntersecting).forEach((e, k) => {
        const t = e.target;
        io.unobserve(t);
        t.style.transitionDelay = `${Math.min(k, 6) * 70}ms`;
        t.classList.remove('pre'); t.classList.add('in');
        $$('.count', t).forEach(count);
        setTimeout(() => { t.classList.remove('in'); t.style.transitionDelay = ''; }, 700 + k * 70);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -30px 0px' });
    const fold = innerHeight * 0.92;
    items.forEach((t) => {
      if (t.getBoundingClientRect().top < fold) return; // เห็นอยู่แล้วตั้งแต่เปิดหน้า แสดงตามปกติ
      t.classList.add('pre');
      io.observe(t);
    });
  });

  // ---------- แผนที่ / วิดีโอ (โหลดจากภายนอกเมื่อผู้ชมกดเท่านั้น) ----------
  part('embeds', () => {
    document.addEventListener('click', (e) => {
      const m = e.target.closest('.map-load[data-map]');
      if (m && /^https:\/\/www\.google\.com\/maps\b/.test(m.dataset.map)) {
        const f = el('iframe');
        f.src = m.dataset.map; f.title = 'แผนที่โรงเรียน (Google Maps)';
        f.referrerPolicy = 'no-referrer-when-downgrade'; f.allowFullscreen = true;
        m.replaceWith(f);
        return;
      }
      const v = e.target.closest('[data-video]');
      if (v && /^https:\/\/www\.youtube(-nocookie)?\.com\/embed\//.test(v.dataset.video)) {
        const f = el('iframe');
        f.src = v.dataset.video; f.title = 'วิดีโอแนะนำโรงเรียน';
        f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; f.allowFullscreen = true;
        (v.closest('.tour') || v.parentElement).append(f);
        f.focus();
      }
    });
  });

  // ---------- ผู้ช่วยค้นหาข้อมูล ----------
  part('assistant', () => {
    const btn = $('#botBtn'), box = $('#assistant'), body = $('#asBody'), form = $('#asForm');
    if (!btn || !box || !body || !form) return;
    const input = form.elements.q;
    const show = (on) => {
      box.hidden = !on;
      btn.setAttribute('aria-expanded', String(on));
      if (on) input.focus(); else btn.focus();
    };
    btn.addEventListener('click', () => show(box.hidden));
    $('#botClose')?.addEventListener('click', () => show(false));
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); show(false); } });
    const say = (text, cls = '') => { const p = el('p', `bubble ${cls}`.trim(), text); body.append(p); return p; };
    const toEnd = () => { body.scrollTop = body.scrollHeight; };
    const apply = $('.hbtn-apply')?.getAttribute('href') || '/contact';
    // คำถามที่พบบ่อย → หน้าที่ตอบได้ตรงที่สุด (แสดงก่อนผลค้นหา)
    const INTENTS = [
      [/สมัคร|รับนักเรียน|apply|admission/i, 'การรับสมัครนักเรียน', apply],
      [/ปฏิทิน|กำหนดการ|calendar|event/i, 'ปฏิทินกิจกรรมโรงเรียน', '/calendar'],
      [/ita|oit|เปิดเผยข้อมูล|คุณธรรม|โปร่งใส/i, 'การเปิดเผยข้อมูลสาธารณะ (ITA / OIT)', '/ita'],
      [/ติดต่อ|โทร|เบอร์|อีเมล|ที่อยู่|แผนที่|ร้องเรียน|contact/i, 'ติดต่อโรงเรียน / แผนที่', '/contact'],
      [/ระบบ|บริการ|e-?service|ผลการเรียน|เกรด|login|เข้าสู่ระบบ/i, 'ระบบบริการออนไลน์', '/portal'],
      [/สถิติ|จำนวนนักเรียน|จำนวนครู|data/i, 'ศูนย์ข้อมูลสารสนเทศ', '/data'],
      [/ภาพ|รูป|อัลบั้ม|gallery/i, 'ภาพกิจกรรม', '/gallery'],
      [/หลักสูตร|วิชาการ|แผนการเรียน|academic|program/i, 'หลักสูตรและวิชาการ', '/academics'],
    ];
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const term = input.value.trim().slice(0, 60);
      if (!term) return;
      input.value = '';
      say(term, 'me');
      const wait = say('กำลังค้นหา…', 'wait');
      toEnd();
      const quick = INTENTS.filter(([re]) => re.test(term)).slice(0, 2).map(([, title, url]) => ({ title, url, type: 'แนะนำ' }));
      getJSON(`/api/search?q=${encodeURIComponent(term)}`)
        .then((d) => d.results || [], () => null)
        .then((results) => {
          wait.remove();
          const seen = new Set();
          const links = [...quick, ...(results || [])].filter((x) => !seen.has(x.url) && seen.add(x.url)).slice(0, 6);
          if (!links.length) {
            say(results === null
              ? 'ขออภัย ระบบค้นหาขัดข้องชั่วคราว ลองใหม่อีกครั้ง หรือติดต่อโรงเรียนตามช่องทางด้านล่าง'
              : `ยังไม่พบข้อมูลเกี่ยวกับ “${term}” ลองใช้คำที่สั้นลง หรือดูผลการค้นหาแบบเต็ม`);
          } else say(`ข้อมูลที่เกี่ยวข้องกับ “${term}”`);
          const list = el('div', 'as-res');
          links.forEach((x) => {
            const a = el('a', '', x.title);
            a.href = x.url;
            if (/^https?:/.test(x.url)) { a.target = '_blank'; a.rel = 'noopener'; }
            a.append(el('small', '', x.type));
            list.append(a);
          });
          const all = el('a', 'as-all', 'ดูผลการค้นหาทั้งหมด');
          all.href = `/search?q=${encodeURIComponent(term)}`;
          all.append(icon('arrow', 14));
          list.append(all);
          body.append(list);
          toEnd();
        });
    });
  });

  // ---------- แจ้งการใช้คุกกี้ ----------
  part('cookie', () => {
    const c = $('#cookie');
    if (!c || getCookie('ck') === '1') return;
    c.hidden = false;
    $('#cookieOk')?.addEventListener('click', () => { setCookie('ck', '1', 365); c.hidden = true; });
  });

  // ---------- ปุ่มกลับขึ้นด้านบน ----------
  part('toTop', () => {
    const b = $('#toTop');
    if (!b) return;
    let raf = 0;
    const on = () => { raf = 0; b.classList.toggle('show', scrollY > 600); };
    addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(on); }, { passive: true });
    on();
    b.addEventListener('click', () => {
      scrollTo({ top: 0, behavior: smooth });
      $('.brand')?.focus({ preventScroll: true });
    });
  });

  // ---------- คำอธิบายกราฟ [data-tip="ชื่อ|ค่า"] ----------
  part('tips', () => {
    const tip = $('#tip');
    if (!tip) return;
    let cur = null;
    const place = (x, y) => {
      const w = tip.offsetWidth, h = tip.offsetHeight;
      let left = x + 14, top = y - h - 12;
      if (left + w > innerWidth - 8) left = x - w - 14;
      if (top < 8) top = y + 20;
      tip.style.left = `${Math.max(8, left)}px`;
      tip.style.top = `${Math.min(top, innerHeight - h - 8)}px`;
    };
    const show = (t, x, y) => {
      const [label, value] = String(t.dataset.tip).split('|');
      tip.replaceChildren(el('b', '', value ?? label));
      if (value != null) tip.append(el('span', '', label));
      cur = t; tip.hidden = false;
      place(x, y);
    };
    const hide = () => { cur = null; tip.hidden = true; };
    document.addEventListener('pointerover', (e) => {
      const t = e.target.closest('[data-tip]');
      if (t && t !== cur) show(t, e.clientX, e.clientY);
      else if (!t && cur) hide();
    });
    document.addEventListener('pointermove', (e) => { if (cur) place(e.clientX, e.clientY); }, { passive: true });
    document.addEventListener('focusin', (e) => {
      const t = e.target.closest?.('[data-tip]');
      if (!t) return;
      const r = t.getBoundingClientRect();
      show(t, r.left + r.width / 2, r.top);
    });
    document.addEventListener('focusout', (e) => { if (e.target === cur) hide(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && cur) hide(); });
    addEventListener('scroll', () => { if (cur) hide(); }, { passive: true });
  });

  // ---------- ปุ่มคัดลอกลิงก์ ----------
  part('copy', () => {
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-copy]');
      if (!b || b.disabled) return;
      const text = b.dataset.copy;
      const done = () => {
        const t = $('span', b) || b, old = t.textContent;
        t.textContent = 'คัดลอกแล้ว ✓'; b.disabled = true;
        setTimeout(() => { t.textContent = old; b.disabled = false; }, 1800);
      };
      const fallback = () => {
        const ta = el('textarea', 'sr-only');
        ta.value = text; ta.readOnly = true;
        document.body.append(ta); ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        if (ok) done(); else prompt('คัดลอกลิงก์นี้', text);
      };
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fallback);
      else fallback();
    });
  });

  // ---------- ใช้งานแบบแอป (PWA): ออฟไลน์ + ติดตั้งบนหน้าจอ ----------
  part('pwa', () => {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
      addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
    }
    const btns = $$('[data-install]'), hints = $$('[data-install-hint]');
    const hint = (t) => hints.forEach((h) => { h.textContent = t; });
    if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
      hint('ขณะนี้คุณใช้งานเว็บไซต์ในรูปแบบแอปอยู่แล้ว');
      return;
    }
    let deferred = null;
    addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferred = e;
      btns.forEach((b) => { b.hidden = false; });
      hint('กดปุ่ม “ติดตั้ง” เพื่อเพิ่มไอคอนโรงเรียนบนหน้าจอ เปิดใช้งานได้เหมือนแอป');
    });
    btns.forEach((b) => b.addEventListener('click', () => {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.finally(() => { deferred = null; btns.forEach((x) => { x.hidden = true; }); });
    }));
    addEventListener('appinstalled', () => {
      btns.forEach((b) => { b.hidden = true; });
      hint('ติดตั้งเรียบร้อยแล้ว เปิดได้จากไอคอนบนหน้าจอ');
    });
  });

  // ---------- ดูภาพทีละรูป (อัลบั้มจาก Google Drive): ลูกศร/ปัดซ้ายขวา · Esc ปิด · ไม่มีสคริปต์ = เปิดรูปใหญ่ตามลิงก์ ----------
  part('lightbox', () => {
    $$('[data-lightbox]').forEach((grid) => {
      const links = $$('a', grid);
      if (!links.length) return;
      let dlg, img, count, open, openText, idx = 0, opener = null;
      const show = (i) => {
        idx = (i + links.length) % links.length;
        const a = links[idx];
        img.src = a.getAttribute('href');
        img.alt = $('img', a)?.alt || '';
        count.textContent = `ภาพที่ ${idx + 1} จาก ${links.length}`;
        open.href = a.dataset.open || a.href;
        openText.textContent = a.dataset.open ? 'ดูไฟล์ต้นฉบับใน Google Drive ' : 'เปิดรูปขนาดเต็ม '; // รูปจาก Drive / รูปที่อัปโหลด
        [idx - 1, idx + 1].forEach((k) => { const n = links[(k + links.length) % links.length]; if (n) new Image().src = n.getAttribute('href'); });
      };
      const build = () => {
        dlg = el('dialog', 'lb');
        dlg.setAttribute('aria-label', grid.dataset.caption ? `ภาพ: ${grid.dataset.caption}` : 'ดูภาพ');
        const fig = el('figure', 'lb-fig');
        img = el('img');
        fig.append(img);
        const btn = (cls, label, ic, fn) => { const b = el('button', `lb-btn ${cls}`); b.type = 'button'; b.setAttribute('aria-label', label); b.append(icon(ic)); b.addEventListener('click', fn); return b; };
        const bar = el('div', 'lb-bar');
        count = el('span');
        count.setAttribute('aria-live', 'polite');
        open = el('a');
        openText = document.createTextNode('');
        open.target = '_blank'; open.rel = 'noopener';
        open.append(openText, icon('external'));
        bar.append(count, open);
        dlg.append(fig, btn('lb-prev', 'ภาพก่อนหน้า', 'left', () => show(idx - 1)), btn('lb-next', 'ภาพถัดไป', 'right', () => show(idx + 1)), btn('lb-x', 'ปิด', 'x', () => dlg.close()), bar);
        dlg.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowLeft') { e.preventDefault(); show(idx - 1); }
          if (e.key === 'ArrowRight') { e.preventDefault(); show(idx + 1); }
        });
        let x0 = null, swiped = false; // ปัดซ้าย/ขวาบนจอสัมผัส
        dlg.addEventListener('pointerdown', (e) => { x0 = e.clientX; swiped = false; });
        dlg.addEventListener('pointerup', (e) => {
          if (x0 === null) return;
          const dx = e.clientX - x0; x0 = null;
          if (Math.abs(dx) > 50) { swiped = true; show(idx + (dx < 0 ? 1 : -1)); }
        });
        dlg.addEventListener('click', (e) => {
          if (swiped) { swiped = false; return; }
          if (e.target === dlg || e.target === fig) dlg.close(); // กดพื้นหลัง = ปิด
        });
        dlg.addEventListener('close', () => { img.removeAttribute('src'); opener?.focus(); });
        document.body.append(dlg);
      };
      links.forEach((a, i) => a.addEventListener('click', (e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
        e.preventDefault();
        if (!dlg) build();
        opener = a;
        show(i);
        dlg.showModal();
      }));
    });
  });
})();
