// หน้า "จัดเมนูและหน้าแรก": ลากวาง (เมาส์และนิ้ว) + ปุ่ม ↑ ↓ → ← และปุ่มลูกศรบนแป้นพิมพ์ — บันทึกครั้งเดียวเมื่อกดปุ่มบันทึก
(() => {
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
  const btn = (act, label, text, cls = '') => { const b = el('button', `ar-b ${cls}`, text); b.type = 'button'; b.dataset.act = act; b.title = label; b.setAttribute('aria-label', label); return b; };
  const dlg = document.getElementById('arEdit');
  let unsaved = 0;
  addEventListener('beforeunload', (e) => { if (unsaved) { e.preventDefault(); e.returnValue = ''; } });

  document.querySelectorAll('form[data-arrange]').forEach((form) => {
    const kind = form.dataset.arrange, nest = form.hasAttribute('data-nest');
    const tree = form.querySelector('.ar-tree'), status = form.querySelector('.ar-status'), save = form.querySelector('[data-save]');
    let data = [];
    try { data = JSON.parse(form.querySelector('.ar-data').textContent); } catch { data = []; }
    let dirty = false;
    const say = (t) => { status.textContent = t; };
    const changed = (msg) => {
      if (!dirty) { dirty = true; unsaved++; }
      save.disabled = false; form.classList.add('dirty');
      say(msg || 'มีการเปลี่ยนแปลงที่ยังไม่บันทึก');
      refresh();
    };
    const items = (list) => [...list.children].filter((x) => x.classList.contains('ar-item'));
    const isChild = (li) => !!li.parentElement?.classList.contains('ar-sub');
    const subOf = (li) => li.querySelector(':scope > .ar-sub');
    const hasKids = (li) => !!subOf(li)?.querySelector(':scope > .ar-item');
    const name = (li) => li.dataset.title || li.dataset.label || 'รายการ';
    const ensureSub = (li) => {
      if (!nest || isChild(li) || subOf(li)) return;
      const ol = el('ol', 'ar-sub');
      ol.dataset.empty = 'วางที่นี่เพื่อเป็นเมนูย่อย';
      li.append(ol);
    };
    const dropSub = (li) => { if (isChild(li)) subOf(li)?.remove(); };

    // ---------- สร้างรายการ ----------
    const label = (li) => {
      const box = li.querySelector(':scope > .ar-row .ar-label');
      box.textContent = '';
      if (kind === 'home') { box.append(el('b', '', li.dataset.label)); return; }
      box.append(el('b', '', li.dataset.title || '(ยังไม่ได้ตั้งชื่อ)'));
      if (li.dataset.en && !isChild(li)) box.append(el('small', 'ar-en', li.dataset.en));
      box.append(el('code', 'ar-url', li.dataset.url || 'ไม่มีลิงก์'));
      if (li.dataset.active !== '1') box.append(el('span', 'ar-tag off', 'ซ่อนอยู่'));
      const warn = el('span', 'ar-tag warn', 'ไม่มีลิงก์และเมนูย่อย — ไม่แสดงบนเว็บ');
      warn.hidden = true;
      box.append(warn);
    };
    const build = (x, child) => {
      const li = el('li', 'ar-item');
      const row = el('div', 'ar-row');
      const grip = el('button', 'ar-grip');
      grip.type = 'button';
      grip.setAttribute('aria-label', 'จับลากเพื่อย้าย หรือกดลูกศรบนแป้นพิมพ์เพื่อเลื่อน');
      grip.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><g fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></g></svg>';
      const acts = el('div', 'ar-acts');
      if (kind === 'home') {
        li.dataset.k = x.k; li.dataset.label = x.label;
        const on = el('label', 'ar-on');
        const cb = el('input'); cb.type = 'checkbox'; cb.checked = x.on !== false; cb.dataset.on = '';
        on.append(cb, ' แสดง');
        acts.append(on, btn('up', 'เลื่อนขึ้น', '↑'), btn('down', 'เลื่อนลง', '↓'));
        li.classList.toggle('off', !cb.checked);
      } else {
        Object.assign(li.dataset, { id: x.id || '', title: x.title || '', en: x.title_en || '', url: x.url || '', active: x.active ? '1' : '0' });
        acts.append(btn('up', 'เลื่อนขึ้น', '↑'), btn('down', 'เลื่อนลง', '↓'), btn('in', 'ทำเป็นเมนูย่อยของเมนูด้านบน', '→'),
          btn('out', 'ยกขึ้นเป็นเมนูหลัก', '←'), btn('edit', 'แก้ไขชื่อและลิงก์', 'แก้ไข'), btn('toggle', 'ซ่อน / แสดงเมนูนี้', 'ซ่อน'),
          btn('add', 'เพิ่มเมนูย่อย', '+ เมนูย่อย'), btn('del', 'ลบเมนูนี้', 'ลบ', 'del'));
      }
      const fold = el('button', 'ar-fold');
      fold.type = 'button'; fold.dataset.fold = '';
      row.append(grip, fold, el('div', 'ar-label'), acts);
      li.append(row);
      if (nest && !child) {
        ensureSub(li);
        (x.children || []).forEach((c) => subOf(li).append(build(c, true)));
        li.classList.toggle('folded', (x.children || []).length > 0); // เริ่มแบบย่อเมนูย่อย เห็นภาพรวมเมนูหลักก่อน
      }
      return li;
    };
    data.forEach((x) => tree.append(build(x, false)));
    if (nest) { const end = el('li', 'ar-end', 'วางที่นี่เพื่อย้ายไปท้ายสุด'); tree.append(end); }

    // ปุ่มที่กดได้ตามตำแหน่ง + ป้ายเตือน
    const refresh = () => tree.querySelectorAll('.ar-item').forEach((li) => {
      const sibs = items(li.parentElement), i = sibs.indexOf(li);
      const b = (a) => li.querySelector(`:scope > .ar-row [data-act="${a}"]`);
      label(li);
      if (b('up')) b('up').disabled = i === 0;
      if (b('down')) b('down').disabled = i === sibs.length - 1;
      if (b('in')) b('in').disabled = isChild(li) || i === 0 || hasKids(li);
      if (b('out')) b('out').disabled = !isChild(li);
      if (b('add')) b('add').hidden = isChild(li);
      if (b('toggle')) b('toggle').textContent = li.dataset.active === '1' ? 'ซ่อน' : 'แสดง';
      const fold = li.querySelector(':scope > .ar-row .ar-fold'), n = subOf(li)?.querySelectorAll(':scope > .ar-item').length || 0;
      if (fold) {
        fold.hidden = !n;
        const open = !li.classList.contains('folded');
        fold.textContent = `${open ? '▾' : '▸'} ${n}`;
        fold.setAttribute('aria-expanded', String(open));
        fold.setAttribute('aria-label', `${open ? 'ย่อ' : 'แสดง'}เมนูย่อย ${n} รายการ`);
      }
      li.classList.toggle('off', kind === 'home' ? !li.querySelector('[data-on]').checked : li.dataset.active !== '1');
      const warn = li.querySelector(':scope > .ar-row .warn');
      if (warn) warn.hidden = isChild(li) || !!li.dataset.url || hasKids(li);
    });
    refresh();

    // ---------- เลื่อนด้วยปุ่ม / แป้นพิมพ์ ----------
    const move = (li, act) => {
      const sibs = items(li.parentElement), i = sibs.indexOf(li);
      if (act === 'up' && i > 0) sibs[i - 1].before(li);
      else if (act === 'down' && i < sibs.length - 1) sibs[i + 1].after(li);
      else if (act === 'in' && nest && !isChild(li) && i > 0 && !hasKids(li)) { subOf(sibs[i - 1]).append(li); sibs[i - 1].classList.remove('folded'); dropSub(li); }
      else if (act === 'out' && isChild(li)) { li.parentElement.closest('.ar-item').after(li); ensureSub(li); }
      else return false;
      const where = isChild(li) ? `เมนูย่อยของ “${name(li.parentElement.closest('.ar-item'))}”` : 'เมนูหลัก';
      changed(`ย้าย “${name(li)}” ไปลำดับที่ ${items(li.parentElement).indexOf(li) + 1}${kind === 'menu' ? ` ใน${where}` : ''}`);
      return true;
    };

    // ---------- แก้ไข / เพิ่ม (หน้าต่างเล็ก) ----------
    const edit = (li, onOk) => {
      const f = dlg.querySelector('form'), err = dlg.querySelector('.ar-err');
      const t = dlg.querySelector('#arTitle'), en = dlg.querySelector('#arEn'), url = dlg.querySelector('#arUrl'), act = dlg.querySelector('#arActive');
      t.value = li.dataset.title; en.value = li.dataset.en; url.value = li.dataset.url; act.checked = li.dataset.active === '1';
      dlg.querySelector('[data-top-only]').hidden = isChild(li) || li.dataset.child === '1';
      dlg.querySelector('#arEditT').textContent = li.dataset.title ? 'แก้ไขเมนู' : 'เพิ่มเมนู';
      err.hidden = true;
      const done = () => {
        dlg.removeEventListener('close', done);
        if (dlg.returnValue !== 'ok') return;
        Object.assign(li.dataset, { title: t.value.replace(/\s+/g, ' ').trim(), en: en.value.trim(), url: url.value.trim(), active: act.checked ? '1' : '0' });
        onOk?.();
        changed(`แก้ไข “${name(li)}” แล้ว`);
      };
      f.onsubmit = (e) => {
        const v = url.value.trim();
        if (e.submitter?.value === 'ok' && v && !/^(\/(?!\/)\S*|https?:\/\/\S+|mailto:\S+|tel:[\d+\-\s]+)$/i.test(v)) {
          e.preventDefault(); err.textContent = 'ลิงก์ต้องขึ้นต้นด้วย / หรือ https://'; err.hidden = false; url.focus();
        }
      };
      dlg.addEventListener('close', done);
      dlg.returnValue = '';
      dlg.showModal();
      t.focus();
    };
    form.querySelector('[data-add-top]')?.addEventListener('click', () => {
      const li = build({ title: '', active: 1 }, false);
      edit(li, () => { tree.querySelector(':scope > .ar-end').before(li); li.querySelector('.ar-grip').focus(); });
    });

    const foldAll = form.querySelector('[data-fold-all]');
    foldAll?.addEventListener('click', () => {
      const open = foldAll.dataset.open !== '1';
      items(tree).forEach((li) => li.classList.toggle('folded', !open));
      foldAll.dataset.open = open ? '1' : '';
      foldAll.textContent = open ? 'ย่อเมนูย่อยทั้งหมด' : 'แสดงเมนูย่อยทั้งหมด';
      refresh();
    });
    tree.addEventListener('click', (e) => {
      const f = e.target.closest('[data-fold]');
      if (f) { f.closest('.ar-item').classList.toggle('folded'); refresh(); return; }
      const b = e.target.closest('[data-act]'); if (!b) return;
      const li = b.closest('.ar-item'), a = b.dataset.act;
      if (['up', 'down', 'in', 'out'].includes(a)) { move(li, a); b.disabled ? li.querySelector('.ar-grip').focus() : b.focus(); }
      else if (a === 'edit') edit(li);
      else if (a === 'toggle') { li.dataset.active = li.dataset.active === '1' ? '0' : '1'; changed(`${li.dataset.active === '1' ? 'แสดง' : 'ซ่อน'} “${name(li)}”`); }
      else if (a === 'add') {
        const c = build({ title: '', active: 1 }, true);
        c.dataset.child = '1';
        edit(c, () => { subOf(li).append(c); li.classList.remove('folded'); delete c.dataset.child; c.querySelector('.ar-grip').focus(); });
      } else if (a === 'del') {
        const n = subOf(li)?.querySelectorAll(':scope > .ar-item').length || 0;
        if (!confirm(`ลบเมนู “${name(li)}”${n ? ` และเมนูย่อยอีก ${n} รายการ` : ''}? (ยังไม่หายจากเว็บจนกว่าจะกดบันทึก)`)) return;
        const next = li.nextElementSibling?.querySelector('.ar-grip') || li.previousElementSibling?.querySelector('.ar-grip');
        li.remove(); next?.focus();
        changed(`ลบ “${name(li)}” แล้ว`);
      }
    });
    tree.addEventListener('change', (e) => { if (e.target.matches('[data-on]')) changed(`${e.target.checked ? 'แสดง' : 'ซ่อน'} “${name(e.target.closest('.ar-item'))}”`); });
    tree.addEventListener('keydown', (e) => {
      const grip = e.target.closest('.ar-grip'); if (!grip) return;
      const act = { ArrowUp: 'up', ArrowDown: 'down', ArrowRight: 'in', ArrowLeft: 'out' }[e.key];
      if (!act) return;
      e.preventDefault();
      move(grip.closest('.ar-item'), act);
      grip.focus();
    });

    // ---------- ลากวาง ----------
    let drag = null;
    const place = (target, x, y) => {
      const { li, ph, kids } = drag;
      if (!target || li.contains(target) || target.closest('.ar-ph')) return;
      if (target.closest('.ar-end')) { tree.querySelector(':scope > .ar-end').before(ph); return; }
      const row = target.closest('.ar-row');
      if (row) {
        const t = row.parentElement, r = row.getBoundingClientRect(), before = y < r.top + r.height / 2;
        if (isChild(t)) {
          if (kids) { const p = t.parentElement.closest('.ar-item'); p.after(ph); } // เมนูที่มีเมนูย่อยเป็นเมนูย่อยไม่ได้
          else if (before) t.before(ph); else t.after(ph);
        } else if (before) t.before(ph);
        else if (nest && !kids) { // ครึ่งล่างของเมนูหลัก = เป็นเมนูย่อยตัวแรก (เมนูที่ย่ออยู่: ชี้ค้างไว้ครู่หนึ่งจึงขยาย)
          if (!t.classList.contains('folded')) subOf(t).prepend(ph);
          else if (drag.hover === t && Date.now() - drag.since > 450) { t.classList.remove('folded'); subOf(t).prepend(ph); refresh(); }
          else {
            if (drag.hover !== t) {
              drag.hover = t; drag.since = Date.now();
              clearTimeout(drag.timer);
              drag.timer = setTimeout(() => drag && place(document.elementFromPoint(drag.x, drag.y), drag.x, drag.y), 500);
            }
            t.after(ph);
          }
        } else t.after(ph);
        return;
      }
      const sub = target.closest('.ar-sub');
      if (sub && nest && !kids && !sub.querySelector(':scope > .ar-item:not(.ar-drag)')) sub.append(ph); // ช่องว่างใต้เมนูหลัก
    };
    let scrollTimer = 0;
    const autoscroll = (y) => {
      clearInterval(scrollTimer);
      const d = y < 80 ? -14 : y > innerHeight - 80 ? 14 : 0;
      if (d) scrollTimer = setInterval(() => scrollBy(0, d), 30);
    };
    tree.addEventListener('pointerdown', (e) => {
      const grip = e.target.closest('.ar-grip');
      if (!grip || e.button > 0) return;
      e.preventDefault();
      const li = grip.closest('.ar-item'), r = li.getBoundingClientRect();
      const ph = el('li', 'ar-ph');
      ph.style.height = `${r.height}px`;
      li.before(ph);
      li.style.width = `${r.width}px`; li.style.left = `${r.left}px`; li.style.top = `${r.top}px`;
      li.classList.add('ar-drag');
      drag = { li, ph, grip, kids: hasKids(li), dy: e.clientY - r.top, id: e.pointerId };
      grip.setPointerCapture(e.pointerId);
      tree.classList.add('ar-dragging');
      tree.classList.toggle('ar-can-nest', nest && !drag.kids);
    });
    tree.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag.li.style.top = `${e.clientY - drag.dy}px`;
      drag.x = e.clientX; drag.y = e.clientY;
      const target = document.elementFromPoint(e.clientX, e.clientY);
      if (drag.hover && !drag.hover.querySelector(':scope > .ar-row')?.contains(target)) { drag.hover = null; clearTimeout(drag.timer); }
      place(target, e.clientX, e.clientY);
      autoscroll(e.clientY);
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      clearInterval(scrollTimer);
      clearTimeout(drag.timer);
      const { li, ph, grip } = drag;
      const from = ph.previousElementSibling === li || ph.nextElementSibling === li;
      ph.replaceWith(li);
      li.classList.remove('ar-drag'); li.style.width = li.style.left = li.style.top = '';
      tree.classList.remove('ar-dragging', 'ar-can-nest');
      drag = null;
      if (isChild(li)) { dropSub(li); li.parentElement.closest('.ar-item').classList.remove('folded'); } else ensureSub(li);
      grip.focus();
      if (!from) changed(`ย้าย “${name(li)}” แล้ว`);
      refresh();
    };
    tree.addEventListener('pointerup', end);
    tree.addEventListener('pointercancel', end);

    // ---------- บันทึก ----------
    const serialize = () => (kind === 'home'
      ? items(tree).map((li) => ({ k: li.dataset.k, on: li.querySelector('[data-on]').checked }))
      : items(tree).map((li) => ({
        id: Number(li.dataset.id) || null, title: li.dataset.title, title_en: li.dataset.en, url: li.dataset.url, active: li.dataset.active === '1' ? 1 : 0,
        children: items(subOf(li) || el('ol')).map((c) => ({ id: Number(c.dataset.id) || null, title: c.dataset.title, title_en: c.dataset.en, url: c.dataset.url, active: c.dataset.active === '1' ? 1 : 0 })),
      })));
    form.addEventListener('submit', (e) => {
      if (kind === 'menu') {
        const blank = [...tree.querySelectorAll('.ar-item')].find((li) => !li.dataset.title);
        if (blank) { e.preventDefault(); say('มีเมนูที่ยังไม่ได้ตั้งชื่อ'); edit(blank); return; }
      }
      form.elements.data.value = JSON.stringify(serialize());
      if (dirty) unsaved--;
      dirty = false;
    });
  });
})();
