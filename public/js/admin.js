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

  // ตัวอย่างรูปก่อนอัปโหลด
  document.querySelectorAll('input[type=file]').forEach((inp) => inp.addEventListener('change', () => {
    const f = inp.files[0]; if (!f) return;
    if (f.size > 5 * 1024 * 1024) { alert('ไฟล์ใหญ่เกิน 5 MB'); inp.value = ''; return; }
    let pv = inp.parentElement.querySelector('.preview');
    if (!pv) { pv = document.createElement('img'); pv.className = 'preview'; inp.after(pv); }
    pv.src = URL.createObjectURL(f);
  }));
})();
