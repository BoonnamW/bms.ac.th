// หน้า "ปรับสีเว็บไซต์": ตัวอย่างสีแบบทันที — ใช้สูตรเดียวกับเซิร์ฟเวอร์ (lib/colors.js) จึงเห็นสีที่ใช้จริงหลังปรับให้อ่านง่าย
import { themeColors, sectionColors, SECTION_COLORS } from '/js/colors.mjs';

const form = document.getElementById('colorForm'), prev = document.getElementById('cprev');
if (form && prev) {
  const THEME = ['primary', 'accent', 'dark', 'soft'], SECTIONS = Object.keys(SECTION_COLORS);
  const MAIN = { deep: '--dark', soft: '--bg', mid: '--primary' }; // ตัวแปรหลักของแต่ละบทบาท
  const val = (n) => {
    const inp = form.elements[n], auto = form.elements[`${n}_auto`];
    return !inp || auto?.checked ? '' : inp.value.toLowerCase();
  };
  const set = (el, vars) => Object.entries(vars).forEach(([k, v]) => el.style.setProperty(k, v));
  // บอกสีที่ใช้จริงเมื่อระบบปรับจากสีที่เลือก
  const note = (n, chosen, used) => {
    const fld = form.elements[n]?.closest('.fld');
    if (!fld) return;
    let el = fld.querySelector('.cnote');
    if (!chosen || !used || chosen === used) { el?.remove(); return; }
    if (!el) { el = document.createElement('small'); el.className = 'cnote'; fld.append(el); }
    el.textContent = '';
    const sw = document.createElement('i');
    sw.style.background = used;
    el.append(sw, `ใช้จริง ${used} — ปรับให้ตัวอักษรในส่วนนี้อ่านง่าย`);
  };
  const update = () => {
    const s = Object.fromEntries([...THEME, ...SECTIONS].map((n) => [n, val(n)]));
    const t = themeColors(s);
    set(prev, { '--primary': t.primary, '--accent': t.accent, '--dark': t.dark, '--soft': t.soft, '--bg': t.soft,
      '--on-primary': t.onPrimary, '--on-primary-d': t.onPrimaryD, '--on-accent': t.onAccent });
    THEME.forEach((n) => note(n, s[n], t[n]));
    const sec = sectionColors(s);
    prev.querySelectorAll('.cp-part').forEach((el) => {
      ['--primary', '--on-primary', '--on-primary-d', '--dark', '--bg'].forEach((k) => el.style.removeProperty(k));
      if (sec[el.dataset.part]) set(el, sec[el.dataset.part].vars);
    });
    SECTIONS.forEach((n) => note(n, s[n], sec[n]?.vars[MAIN[SECTION_COLORS[n].role]]));
  };
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  // คืนค่าสีเริ่มต้นของโรงเรียน (ยังไม่บันทึกจนกว่าจะกด "บันทึกสี")
  form.querySelector('[data-color-reset]')?.addEventListener('click', () => {
    const def = JSON.parse(form.dataset.defaults || '{}');
    THEME.forEach((n) => { if (def[n] && form.elements[n]) form.elements[n].value = def[n]; });
    SECTIONS.forEach((n) => {
      const auto = form.elements[`${n}_auto`];
      if (auto && !auto.checked) { auto.checked = true; auto.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    update();
  });
  update();
}
