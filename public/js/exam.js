(() => {
  const form = document.querySelector('[data-exam-form]');
  if (form) {
    const qs = [...form.querySelectorAll('[data-q]')];
    const out = form.querySelector('[data-progress]');
    const count = () => qs.filter((f) => f.querySelector('input:checked')).length;
    const update = () => { out.textContent = `ตอบแล้ว ${count()}/${qs.length} ข้อ`; };
    let dirty = false, sending = false;
    form.addEventListener('change', (e) => {
      dirty = true; update();
      e.target.closest('[data-q]')?.classList.remove('missing');
    });
    update();
    form.addEventListener('submit', (e) => {
      const miss = qs.filter((f) => !f.querySelector('input:checked'));
      if (miss.length) {
        miss.forEach((f) => f.classList.add('missing'));
        if (!confirm(`ยังไม่ได้ตอบ ${miss.length} ข้อ (ข้อ ${miss.map((f) => +f.id.slice(1) + 1).slice(0, 10).join(', ')}${miss.length > 10 ? ' …' : ''})\nต้องการส่งคำตอบเลยหรือไม่?`)) {
          e.preventDefault(); miss[0].scrollIntoView({ behavior: 'smooth' }); return;
        }
      } else if (!confirm('ยืนยันการส่งคำตอบ? ส่งแล้วแก้ไขไม่ได้')) { e.preventDefault(); return; }
      if (sending) { e.preventDefault(); return; }
      sending = true;
    });
    // กันปิดหน้า/รีเฟรชโดยไม่ตั้งใจระหว่างทำข้อสอบ
    window.addEventListener('beforeunload', (e) => { if (dirty && !sending) e.preventDefault(); });
  }
  const only = document.querySelector('[data-only-wrong]');
  if (only) only.addEventListener('change', () => document.body.classList.toggle('only-wrong', only.checked));
})();
