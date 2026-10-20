/* ตัวอ่านวารสารแบบรูปเล่ม: จัดเนื้อหาเป็นหน้ากระดาษขนาดคงที่ (สัดส่วน A4) แล้วพลิกหน้าเหมือนหนังสือ
   จอกว้าง = หน้าคู่ · จอแคบ = ทีละหน้า · "เลื่อนอ่าน" = หน้าเรียงลงมา · พิมพ์/บันทึก PDF ได้ทีละหน้า A4
   ไม่มีสคริปต์ = อ่านเป็นหน้าเว็บปกติ · ไม่มี inline script/style (CSP) */
(() => {
  'use strict';
  const book = document.getElementById('ebook');
  if (!book) return;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const src = $('.eb-src', book), stage = $('.eb-stage', book), scale = $('.eb-scale', book), view = $('.eb-book', book);
  const nav = $('.eb-nav', book), count = $('.eb-count', book), hint = $('.eb-hint', book), tools = $('.eb-tools');
  const prevB = $('[data-eb-prev]', book), nextB = $('[data-eb-next]', book);
  const NAME = book.dataset.name || '', MONTH = book.dataset.month || '';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SIZE = { spread: [460, 650], single: [360, 509] }; // ขนาดฐานของหน้า (px) ก่อนย่อ/ขยายให้พอดีจอ
  const pristine = src.cloneNode(true); // ต้นฉบับ ใช้จัดหน้าใหม่เมื่อเปลี่ยนขนาดจอ
  let layout = '', pages = [], sheets = [], cur = 0, busy = false, W = 0, H = 0, mode = 'book';
  try { if (localStorage.getItem('ebMode') === 'scroll') mode = 'scroll'; } catch { /* ไม่มีที่เก็บค่า */ }

  const pickLayout = () => (book.clientWidth >= 880 && innerHeight >= 520 ? 'spread' : 'single');
  const headerH = () => Math.max(0, document.querySelector('.header')?.getBoundingClientRect().bottom || 0); // แถบเมนูที่ติดด้านบน
  // พลิกหน้าแล้วเล่มอยู่นอกจอ → เลื่อนให้เห็นทั้งเล่ม (ใต้แถบเมนู)
  const ensureVisible = () => {
    if (document.fullscreenElement) return;
    const r = stage.getBoundingClientRect(), top = headerH() + 8;
    if (r.top < top - 2 || r.bottom > innerHeight - 70) scrollBy({ top: r.top - top, behavior: reduced ? 'auto' : 'smooth' });
  };

  // ---------- จัดหน้า ----------
  function newPage(cls, run) {
    const pg = el('section', `eb-pg ${cls}`);
    const head = el('div', 'eb-run');
    head.append(el('span', '', `${NAME} · ${MONTH}`), el('b', '', run));
    const body = el('div', 'eb-body');
    const foot = el('div', 'eb-foot');
    foot.append(el('span'));
    pg.append(head, body, foot);
    return { pg, body };
  }
  const fits = (body) => body.scrollHeight <= body.clientHeight + 1;

  // แยกเนื้อหาเป็นก้อน (ย่อหน้า รูป รายการทีละข้อ) แล้วเติมลงหน้าทีละก้อน
  function blocks(part) {
    const out = [];
    const push = (n) => {
      if (n.nodeType === 3) { if (n.textContent.trim()) out.push(el('p', '', n.textContent.trim())); return; }
      if (n.nodeType !== 1) return;
      if (n.classList.contains('eb-text')) { [...n.childNodes].forEach(push); return; }
      const frame = n.tagName === 'IFRAME' ? n : n.querySelector('iframe');
      if (frame) { // วิดีโอ/เอกสารฝัง → ลิงก์
        const p = el('p', 'eb-more'), a = el('a', '', 'ชมวิดีโอ / เอกสารประกอบ');
        a.href = frame.src; a.target = '_blank'; a.rel = 'noopener';
        p.append(a); out.push(p); return;
      }
      if (/^(UL|OL)$/.test(n.tagName)) {
        const start = Number(n.getAttribute('start') || 1);
        [...n.children].forEach((li, i) => { const l = n.cloneNode(false); if (n.tagName === 'OL') l.setAttribute('start', start + i); l.append(li); out.push(l); });
        return;
      }
      if (n.tagName === 'P' && !n.textContent.replace(/[\s ]/g, '') && !n.querySelector('img')) return; // ย่อหน้าว่าง
      out.push(n);
    };
    [...part.childNodes].forEach(push);
    return out;
  }

  // ตัดย่อหน้าที่ยาวเกินหน้า: หาจุดตัดที่ขอบคำ (ภาษาไทยใช้ตัวตัดคำของเบราว์เซอร์) ให้ได้ข้อความยาวที่สุดที่ยังพอดีหน้า
  const SEG = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
  const cuts = (text) => {
    const out = [];
    if (SEG) { for (const s of SEG.segment(text)) if (s.index > 0) out.push(s.index); }
    else for (let i = 1; i < text.length; i++) if (/\s/.test(text[i - 1])) out.push(i);
    return out;
  };
  const locate = (root, k) => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n, seen = 0;
    while ((n = w.nextNode())) { if (seen + n.length >= k) return [n, k - seen]; seen += n.length; }
    return null;
  };
  const headOf = (block, k) => {
    const c = block.cloneNode(true), at = locate(c, k);
    if (!at || !c.lastChild) return null;
    const r = document.createRange();
    r.setStart(at[0], at[1]); r.setEndAfter(c.lastChild); r.deleteContents();
    return c;
  };
  const tailOf = (block, k) => {
    const c = block.cloneNode(true), at = locate(c, k);
    if (!at || !c.firstChild) return null;
    const r = document.createRange();
    r.setStartBefore(c.firstChild); r.setEnd(at[0], at[1]); r.deleteContents();
    c.classList.add('eb-cont');
    return c;
  };
  function split(block, body) {
    if (!/^(P|LI|BLOCKQUOTE|UL|OL)$/.test(block.tagName) || block.querySelector('img,table,iframe,figure')) return null;
    const text = block.textContent, ks = cuts(text).filter((k) => k > 20 && k < text.length - 8);
    let lo = 0, hi = ks.length - 1, best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1, h = headOf(block, ks[mid]);
      if (!h) break;
      body.append(h);
      const ok = fits(body);
      h.remove();
      if (ok) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (best < 0) return null;
    const head = headOf(block, ks[best]), tail = tailOf(block, ks[best]);
    return head && tail ? [head, tail] : null;
  }

  // พื้นที่ว่างที่เหลือในหน้า (สัดส่วน 0–1)
  const spaceLeft = (body) => {
    const last = body.lastElementChild;
    return last ? 1 - (last.offsetTop + last.offsetHeight - body.offsetTop) / body.clientHeight : 1;
  };
  const KEEP = (n) => n && (/^H[2-4]$/.test(n.tagName) || n.matches('.eb-ah,.eb-photos-h,.eb-sep')); // ห้ามค้างท้ายหน้า

  function paginate() {
    const fresh = pristine.cloneNode(true);
    const meas = el('div', 'eb-measure');
    book.append(meas);
    const out = [];
    let lastArt = null; // หน้าสุดท้ายของบทความก่อนหน้า — บทความสั้นต่อกันในหน้าเดียวได้ถ้ายังเหลือที่
    for (const part of [...fresh.children]) {
      const cls = [...part.classList].filter((c) => c.startsWith('sec-')).join(' ');
      if (part.hasAttribute('data-fixed')) { // ปกหน้า/ปกหลัง/ภาพเต็มหน้า ออกแบบไว้พอดีหนึ่งหน้า
        const pg = el('section', 'eb-pg eb-pg-fixed');
        pg.append(part);
        out.push(pg);
        lastArt = null; // บทความถัดไปขึ้นหน้าใหม่
        continue;
      }
      const isArt = part.classList.contains('eb-art');
      let page;
      if (!$('.eb-ah[data-art]', part)) $('.eb-ah', part)?.setAttribute('data-art', part.id); // หน้าที่หัวบทความอยู่ = หน้าเริ่มบทความ (ใช้กับสารบัญ)
      const queue = blocks(part);
      if (isArt && lastArt && spaceLeft(lastArt.body) > 0.4) { // ต่อท้ายบทความก่อนหน้า คั่นด้วยเส้น
        page = lastArt;
        out.pop();
        queue.unshift(el('hr', 'eb-sep'));
      } else {
        page = newPage(cls, part.dataset.run || '');
        meas.append(page.pg);
      }
      while (queue.length) {
        const b = queue.shift();
        page.body.append(b);
        if (fits(page.body)) continue;
        b.remove();
        const parts = split(b, page.body);
        if (parts) { page.body.append(parts[0]); queue.unshift(parts[1]); }
        else if (!page.body.children.length) { b.classList.add('eb-clip'); page.body.append(b); } // ก้อนใหญ่เกินหน้า แสดงเท่าที่พอดี
        else {
          queue.unshift(b);
          while (page.body.children.length > 1 && KEEP(page.body.lastElementChild)) { // หัวข้อ/เส้นคั่นไม่ค้างท้ายหน้า
            const n = page.body.lastElementChild;
            n.remove();
            queue.unshift(n);
          }
          if (queue[0]?.classList.contains('eb-sep')) queue.shift(); // ขึ้นหน้าใหม่แล้วไม่ต้องมีเส้นคั่น
        }
        out.push(page.pg);
        page = newPage(cls, part.dataset.run || '');
        meas.append(page.pg);
      }
      out.push(page.pg);
      lastArt = isArt ? page : null;
    }
    meas.remove();
    // หน้าคู่: ปกหลังต้องอยู่หน้าซ้ายสุดท้าย — จำนวนหน้าไม่ลงตัว แทรกหน้าว่างก่อนปกหลัง
    if (layout === 'spread' && out.length % 2) {
      const blank = el('section', 'eb-pg');
      blank.append(el('div', 'eb-blankpg', NAME));
      out.splice(out.length - 1, 0, blank);
    }
    const startOf = {};
    out.forEach((pg, i) => {
      const n = $('.eb-foot span', pg);
      if (n) n.textContent = i + 1;
      $$('.eb-ah[data-art]', pg).forEach((h) => { if (!(h.dataset.art in startOf)) startOf[h.dataset.art] = i; });
    });
    out.forEach((pg) => $$('[data-goto]', pg).forEach((a) => {
      const t = $('.toc-pg', a), n = startOf[a.dataset.goto];
      if (t && n !== undefined) t.textContent = n + 1;
    }));
    out.startOf = startOf;
    return out;
  }

  function build() {
    layout = pickLayout();
    [W, H] = SIZE[layout];
    book.style.setProperty('--pw', `${W}px`);
    book.style.setProperty('--ph', `${H}px`);
    book.style.setProperty('--print-zoom', (793.7 / W).toFixed(4)); // พิมพ์ = กว้างเต็มกระดาษ A4
    pages = paginate();
    view.textContent = '';
    view.className = `eb-book ${layout}`;
    scale.classList.toggle('clip', layout === 'single');
    const face = (pg, side) => { const f = el('div', `eb-face ${side}`); if (pg) f.append(pg); else f.classList.add('blank'); return f; };
    const pairs = [];
    if (layout === 'spread') for (let i = 0; i < pages.length; i += 2) pairs.push([pages[i], pages[i + 1]]);
    else pages.forEach((pg) => pairs.push([pg, null]));
    sheets = pairs.map(([a, b]) => { const s = el('div', 'eb-sheet'); s.append(face(a, 'front'), face(b, 'back')); view.append(s); return s; });
  }

  // ---------- แสดงหน้า / พลิกหน้า ----------
  const maxCur = () => (layout === 'spread' ? sheets.length : sheets.length - 1);
  const pageToCur = (p) => (layout === 'spread' ? Math.ceil(p / 2) : p);
  const firstVisible = () => (layout === 'spread' ? Math.max(0, 2 * cur - 1) : cur);

  function render() {
    const S = sheets.length;
    sheets.forEach((s, i) => {
      s.classList.toggle('flipped', i < cur);
      s.style.zIndex = i < cur ? i + 1 : 2 * S - i;
      const show = layout === 'spread' ? i === cur - 1 || i === cur : i === cur;
      const near = layout === 'spread' ? i >= cur - 2 && i <= cur + 1 : i >= cur - 1 && i <= cur + 1;
      s.style.visibility = near || mode === 'scroll' ? '' : 'hidden';
      s.inert = mode === 'book' && !show;
      if (mode === 'book' && !show) s.setAttribute('aria-hidden', 'true'); else s.removeAttribute('aria-hidden');
    });
    const N = pages.length;
    let text;
    if (layout === 'spread') {
      const vis = [2 * cur - 1, 2 * cur].filter((x) => x >= 0 && x < N);
      text = vis.length === 2 ? `หน้า ${vis[0] + 1}–${vis[1] + 1} จาก ${N}` : `หน้า ${vis[0] + 1} จาก ${N}`;
      view.classList.toggle('at-start', cur === 0);
      view.classList.toggle('at-end', cur === S);
    } else text = `หน้า ${cur + 1} จาก ${N}`;
    count.textContent = cur === 0 ? `ปกหน้า · ${text}` : text;
    prevB.disabled = cur <= 0;
    nextB.disabled = cur >= maxCur();
  }

  const remember = () => { try { history.replaceState(null, '', `#p${firstVisible() + 1}`); } catch { /* ไม่เป็นไร */ } };
  function flip(dir) {
    if (busy || mode !== 'book') return;
    const next = cur + dir;
    if (next < 0 || next > maxCur()) return;
    const s = sheets[dir > 0 ? cur : cur - 1];
    busy = true;
    s.style.visibility = '';
    s.style.zIndex = 3 * sheets.length; // แผ่นที่กำลังพลิกอยู่บนสุด
    cur = next;
    s.classList.toggle('flipped', dir > 0);
    let done = false;
    const finish = () => { if (done) return; done = true; busy = false; render(); };
    if (reduced) finish();
    else { s.addEventListener('transitionend', finish, { once: true }); setTimeout(finish, 950); }
    remember();
    ensureVisible();
  }
  function goPage(p) {
    p = Math.max(0, Math.min(pages.length - 1, p));
    if (mode === 'scroll') { pages[p]?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); return; }
    cur = Math.min(maxCur(), pageToCur(p));
    render();
    remember();
    ensureVisible();
  }
  const goArticle = (id) => { const p = pages.startOf?.[id]; if (p !== undefined) goPage(p); };

  function fit() {
    const avW = stage.clientWidth || book.clientWidth;
    if (mode === 'scroll') { book.style.setProperty('--fit', Math.min(1.25, (avW - 8) / W).toFixed(3)); return; }
    const full = document.fullscreenElement === book;
    const bw = layout === 'spread' ? 2 * W : W;
    const avH = Math.max(320, innerHeight - (full ? 110 : headerH() + 112)); // เหลือที่ให้ปุ่มพลิกหน้าใต้เล่ม
    const k = Math.min(avW / bw, avH / H, layout === 'spread' ? 1.45 : 1.6);
    scale.style.width = `${bw}px`;
    scale.style.height = `${H}px`;
    scale.style.transform = `scale(${k})`;
    scale.style.marginLeft = `${Math.max(0, (avW - bw * k) / 2)}px`;
    stage.style.height = `${Math.ceil(H * k)}px`;
  }

  function setMode(m) {
    mode = m;
    try { localStorage.setItem('ebMode', m); } catch { /* ไม่มีที่เก็บค่า */ }
    book.classList.toggle('is-scroll', m === 'scroll');
    $$('[data-eb-mode]', tools).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ebMode === m)));
    render();
    fit();
  }

  // ---------- การควบคุม ----------
  prevB.addEventListener('click', () => flip(-1));
  nextB.addEventListener('click', () => flip(1));
  $$('[data-eb-mode]', tools).forEach((b) => b.addEventListener('click', () => setMode(b.dataset.ebMode)));
  const fullB = $('[data-eb-full]', tools);
  if (!document.fullscreenEnabled) fullB.hidden = true;
  fullB.addEventListener('click', () => Promise.resolve(document.fullscreenElement ? document.exitFullscreen() : book.requestFullscreen?.()).catch(() => {}));
  $('[data-eb-print]', tools).addEventListener('click', () => print());
  document.addEventListener('keydown', (e) => {
    if (mode !== 'book' || e.altKey || e.ctrlKey || e.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) return;
    if (document.querySelector('dialog[open]')) return;
    const k = { ArrowRight: 1, ArrowLeft: -1, PageDown: 1, PageUp: -1 }[e.key];
    if (k) { e.preventDefault(); flip(k); } else if (e.key === 'Home') goPage(0); else if (e.key === 'End') goPage(pages.length - 1);
  });
  let x0 = null, swiped = false;
  stage.addEventListener('pointerdown', (e) => { x0 = e.clientX; swiped = false; });
  stage.addEventListener('pointerup', (e) => {
    if (x0 === null || mode !== 'book') return;
    const dx = e.clientX - x0; x0 = null;
    if (Math.abs(dx) > 40) { swiped = true; flip(dx < 0 ? 1 : -1); }
  });
  book.addEventListener('click', (e) => {
    const go = e.target.closest('[data-goto]');
    if (go && view.contains(go)) { e.preventDefault(); goArticle(go.dataset.goto); return; }
    if (swiped) { swiped = false; return; }
    if (mode !== 'book' || !stage.contains(e.target) || e.target.closest('a,button')) return;
    const r = view.getBoundingClientRect();
    flip((e.clientX - r.left) / r.width >= (layout === 'spread' ? 0.5 : 0.35) ? 1 : -1); // กดครึ่งขวา = หน้าถัดไป
  });
  const relayout = () => {
    if (pickLayout() === layout) { fit(); return; }
    let art = ''; // จัดหน้าใหม่แล้วกลับไปบทความเดิม (บทความล่าสุดที่เริ่มก่อนหรือในหน้าที่เปิดอยู่)
    for (let i = firstVisible(); i >= 0 && !art; i--) art = $$('.eb-ah[data-art]', pages[i]).pop()?.dataset.art || '';
    build();
    cur = 0;
    if (art && pages.startOf[art] !== undefined) cur = pageToCur(pages.startOf[art]);
    render();
    fit();
  };
  let timer = 0;
  addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(relayout, 160); });
  document.addEventListener('fullscreenchange', relayout);

  // ---------- เริ่มต้น: รอแบบอักษรโหลดก่อน (ขนาดตัวอักษรมีผลกับการแบ่งหน้า) ----------
  const ready = document.fonts?.ready || Promise.resolve();
  Promise.race([ready, new Promise((r) => setTimeout(r, 2500))]).then(() => {
    build();
    src.hidden = true;
    stage.hidden = false; nav.hidden = false; hint.hidden = false; tools.hidden = false;
    const m = location.hash.match(/^#p(\d+)$/), a = location.hash.match(/^#(art-\d+)$/);
    if (m) cur = Math.min(maxCur(), pageToCur(Number(m[1]) - 1));
    else if (a && pages.startOf[a[1]] !== undefined) cur = pageToCur(pages.startOf[a[1]]);
    setMode(mode);
    if (mode === 'scroll' && (m || a)) goPage(m ? Number(m[1]) - 1 : pages.startOf[a[1]]);
  });
})();
