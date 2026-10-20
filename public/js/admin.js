(() => {
  // ยืนยันก่อนลบ
  document.querySelectorAll('form[data-confirm]').forEach((f) =>
    f.addEventListener('submit', (e) => { if (!confirm(f.dataset.confirm)) e.preventDefault(); }));

  // ตัวแก้ไขข้อความ (rich text) — เนื้อหาจะถูก sanitize ซ้ำที่ฝั่งเซิร์ฟเวอร์เสมอ
  document.querySelectorAll('.rte').forEach((rte) => {
    const area = rte.querySelector('.rte-area');
    const target = document.getElementById(rte.dataset.target);
    const sync = () => { target.value = area.innerHTML; };
    sync();
    area.addEventListener('input', sync);
    rte.querySelector('.rte-bar').addEventListener('mousedown', (e) => e.preventDefault());
    rte.querySelector('.rte-bar').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      area.focus();
      let val = b.dataset.val || null;
      if (b.dataset.cmd === 'createLink') {
        val = prompt('ใส่ลิงก์ (เช่น https://example.com)');
        if (!val) return;
        if (!/^(https?:\/\/|mailto:|tel:|\/)/i.test(val)) val = 'https://' + val;
      }
      document.execCommand(b.dataset.cmd, false, val);
      sync();
    });
    rte.closest('form').addEventListener('submit', sync);
    // วางแบบข้อความล้วน กันสไตล์แปลก ๆ จาก Word/เว็บอื่น
    area.addEventListener('paste', (e) => {
      e.preventDefault();
      document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain'));
    });
  });

  // แถบความคืบหน้า (กำหนดความกว้างด้วย JS เพราะ CSP ไม่อนุญาต style ในหน้า)
  document.querySelectorAll('[data-pct]').forEach((el) => { el.style.width = `${Math.max(0, Math.min(100, +el.dataset.pct || 0))}%`; });

  // รูปที่เลือก: ย่อให้ด้านยาวไม่เกิน 2000 px ในเครื่องก่อนอัปโหลด (รูปจากมือถือ 5–10 MB เหลือราว 0.5 MB) แล้วแสดงตัวอย่าง
  const MAX_SIDE = 2000, MB = 1024 * 1024;
  const shrink = async (f) => {
    if (!/^image\/(jpeg|png|webp)$/.test(f.type) || !window.createImageBitmap) return f;
    try {
      const bmp = await createImageBitmap(f);
      const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      if (k === 1 && f.size < 1.5 * MB) return f;
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const type = f.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const blob = await new Promise((r) => c.toBlob(r, type, 0.85));
      return blob && blob.size < f.size ? new File([blob], f.name.replace(/\.\w+$/, type === 'image/png' ? '.png' : '.jpg'), { type }) : f;
    } catch { return f; }
  };
  document.querySelectorAll('input[type=file]').forEach((inp) => inp.addEventListener('change', async () => {
    const list = [...inp.files];
    if (!list.length) return;
    const isDoc = inp.hasAttribute('data-doc'), max = Number(inp.dataset.max || 0);
    if (max && list.length > max) { alert(`เลือกได้ไม่เกิน ${max} ไฟล์ต่อครั้ง`); inp.value = ''; return; }
    if (isDoc) {
      const big = list.find((f) => f.size > 10 * MB);
      if (big) { alert(`ไฟล์ "${big.name}" ใหญ่เกิน 10 MB`); inp.value = ''; }
      return;
    }
    const out = await Promise.all(list.map(shrink));
    const big = out.find((f) => f.size > 5 * MB);
    if (big) { alert(`รูป "${big.name}" ใหญ่เกิน 5 MB`); inp.value = ''; return; }
    if (window.DataTransfer) { try { const dt = new DataTransfer(); out.forEach((f) => dt.items.add(f)); inp.files = dt.files; } catch { /* ใช้ไฟล์เดิม */ } }
    let pv = inp.parentElement.querySelector('.previews');
    if (!pv) { pv = document.createElement('div'); pv.className = 'previews'; inp.after(pv); }
    pv.textContent = '';
    out.forEach((f) => { const im = document.createElement('img'); im.alt = ''; im.src = URL.createObjectURL(f); pv.append(im); });
  }));

  // สีแต่ละส่วน: ติ๊ก "ใช้สีตามธีม" = ปิดช่องเลือกสี
  document.querySelectorAll('[data-copt]').forEach((cb) => {
    const inp = document.getElementById(cb.dataset.copt);
    cb.addEventListener('change', () => { inp.disabled = cb.checked; });
  });
})();
