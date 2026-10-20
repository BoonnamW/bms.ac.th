// สีประจำโรงเรียน → ตัวแปรสีของเว็บ (/theme.css) — คำนวณค่าความต่างของสีตาม WCAG ให้ตัวอักษรอ่านง่ายเสมอ
const INK = '#16202e';
const isHex = (v) => /^#[0-9a-f]{6}$/i.test(String(v || ''));
const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const luminance = (hex) => {
  const [r, g, b] = channels(hex).map((v) => v / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => {
  const [x, y] = [luminance(a) + 0.05, luminance(b) + 0.05];
  return Math.max(x, y) / Math.min(x, y);
};
const onColor = (hex) => (contrast(hex, '#ffffff') >= contrast(hex, INK) ? '#fff' : INK);
// = color-mix(in srgb, hex k, base) ใน site.css
const mix = (hex, k, base = '#000000') => toHex(channels(hex).map((v, i) => v * k + channels(base)[i] * (1 - k)));
const darken = (hex, k) => mix(hex, k);

// สีที่มีตัวอักษรวางอยู่ (ปุ่ม แท็บ ป้าย): สีโทนกลางถึงเข้ม → ตัวอักษรขาว และเข้มขึ้นทีละนิดจนอ่านง่าย (≥ 4.5:1 ตาม WCAG AA)
// สีอ่อน เช่น ทอง → ตัวอักษรสีเข้ม
const uiColor = (hex) => {
  if (contrast(hex, '#ffffff') < 3) return [hex, INK];
  let c = hex;
  for (let k = 0.99; contrast(c, '#ffffff') < 4.5 && k > 0.6; k -= 0.01) c = darken(hex, k);
  return [c, '#fff'];
};
// สีเข้ม (หัวข้อ แถบบนสุด ส่วนท้ายเว็บ): ตัวอักษรขาวบนพื้นนี้ต้องชัดมาก (≥ 7:1) — ไม่ได้ตั้งไว้ใช้สีหลักผสมดำ
const deepColor = (hex, primary) => {
  const base = isHex(hex) ? hex.toLowerCase() : darken(primary, 0.46);
  let c = base;
  for (let k = 0.95; contrast(c, '#ffffff') < 7 && k > 0.2; k -= 0.05) c = darken(base, k);
  return c;
};
// สีพื้นอ่อน (พื้นหลังส่วนสลับ หัวหน้าเพจ): ตัวอักษรเข้มต้องอ่านง่าย — ไม่ได้ตั้งไว้หรือเข้มเกินใช้สีหลักผสมขาว
const softColor = (hex, primary) => (isHex(hex) && contrast(hex, INK) >= 12 ? hex.toLowerCase() : mix(primary, 0.05, '#ffffff'));

export function themeColors(s) {
  const [primary, onPrimary] = uiColor(isHex(s.primary) ? s.primary.toLowerCase() : '#14325e');
  const [accent, onAccent] = uiColor(isHex(s.accent) ? s.accent.toLowerCase() : '#c9a227');
  return {
    primary, accent, dark: deepColor(s.dark, primary), soft: softColor(s.soft, primary),
    onPrimary, onAccent, onPrimaryD: onColor(darken(primary, 0.8)), onAccentD: onColor(darken(accent, 0.78)),
  };
}

export const themeCss = (s) => {
  const c = themeColors(s);
  return `:root{--primary:${c.primary};--accent:${c.accent};--dark:${c.dark};--soft:${c.soft};`
    + `--on-primary:${c.onPrimary};--on-primary-d:${c.onPrimaryD};--on-accent:${c.onAccent};--on-accent-d:${c.onAccentD}}`;
};
