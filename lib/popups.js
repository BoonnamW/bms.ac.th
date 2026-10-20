// ป๊อปอัปก่อนเข้าเว็บ และช่วงไว้อาลัย (โบว์ดำ / เว็บโทนขาวดำ) ที่ตั้งไว้กับป๊อปอัป
import crypto from 'node:crypto';
import { db } from './db.js';
import { nowUtc } from './events.js';

export const POPUP_STYLES = {
  card: 'การ์ด — รูปด้านบน หัวข้อ ข้อความ และปุ่ม',
  poster: 'โปสเตอร์ — ภาพใหญ่ ข้อความเล็กด้านล่าง (ข่าวสำคัญ)',
  mourning: 'ไว้อาลัย — พื้นดำ ภาพใหญ่ ข้อความเล็ก พร้อมโบว์ดำ',
};
export const POPUP_SIZES = { m: 'กลาง', l: 'ใหญ่', xl: 'ใหญ่มาก (เกือบเต็มจอ)' };

const inWindow = "active=1 AND (COALESCE(start_at,'')='' OR start_at<=?) AND (COALESCE(end_at,'')='' OR end_at>=?)";
const currentSql = db.prepare(`SELECT * FROM popups WHERE ${inWindow} ORDER BY sort, id LIMIT 1`);
const byIdSql = db.prepare('SELECT * FROM popups WHERE id=?');
const mourningSql = db.prepare(`SELECT title, ribbon, mono FROM popups WHERE ${inWindow} AND (ribbon=1 OR mono=1) ORDER BY sort, id`);

// key เปลี่ยนเมื่อแก้เนื้อหา ผู้ชมจะเห็นอีกครั้ง
const withKey = (pop) => pop && {
  ...pop,
  key: crypto.createHash('md5').update([pop.id, pop.title, pop.image, pop.body, pop.link, pop.start_at, pop.end_at, pop.style, pop.size].join('|')).digest('hex').slice(0, 10),
};

// ป๊อปอัปที่อยู่ในช่วงเวลาแสดง (ทีละ 1 อัน)
export const currentPopup = () => { const now = nowUtc(); return withKey(currentSql.get(now, now)); };
// ผู้ดูแลดูตัวอย่างป๊อปอัปได้ทุกอัน (ไม่สนช่วงเวลา/การเปิดใช้)
export const previewPopup = (id) => { const pop = byIdSql.get(id); return pop && { ...withKey(pop), frequency: 'always', preview: true }; };

// ช่วงไว้อาลัย: ป๊อปอัปที่อยู่ในช่วงเวลาและติ๊กโบว์ดำ/โทนขาวดำไว้ → ใช้กับทุกหน้า (อ่านซ้ำทุก 30 วินาที)
let cache = { at: 0, v: null };
export function mourning() {
  if (Date.now() - cache.at > 30e3) {
    const now = nowUtc(), rows = mourningSql.all(now, now);
    const ribbon = rows.find((x) => x.ribbon);
    cache = { at: Date.now(), v: rows.length ? { ribbon: ribbon ? ribbon.title : '', mono: rows.some((x) => x.mono) } : null };
  }
  return cache.v;
}
export const resetMourning = () => { cache = { at: 0, v: null }; };
