// รูปจากเว็บเดิม: srcset จากรูปย่อที่ WordPress สร้างไว้ — เบราว์เซอร์เลือกโหลดรูปขนาดพอดีจอ (รูปการ์ดข่าวเล็กลงหลายเท่า)
import { db } from './db.js';

const sizesSql = db.prepare('SELECT sizes FROM wp_media WHERE file=?');
const cache = new Map();
const url = (p) => `/uploads/wp/${p.split('/').map(encodeURIComponent).join('/')}`;

// รับ 'wp/…' (ค่าที่เก็บในฐานข้อมูล) หรือ '/uploads/wp/…' — ไม่ใช่รูปจากเว็บเดิม หรือไม่มีข้อมูลขนาด = ''
export function srcsetOf(image) {
  let p = String(image || '');
  if (p.startsWith('/uploads/wp/')) p = p.slice(12);
  else if (p.startsWith('wp/')) p = p.slice(3);
  else return '';
  try { p = decodeURIComponent(p); } catch { /* ใช้ตามเดิม */ }
  if (cache.has(p)) return cache.get(p);
  let out = '';
  try { out = JSON.parse(sizesSql.get(p)?.sizes || '[]').map(([w, f]) => `${url(f)} ${w}w`).join(', '); } catch { out = ''; }
  if (cache.size > 5000) cache.clear();
  cache.set(p, out);
  return out;
}

const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
// ใส่ในแท็ก <img>: <img src="…" <%- imgset(n.image, '400px') %>>
export const imgset = (image, sizes) => { const s = srcsetOf(image); return s ? `srcset="${attr(s)}" sizes="${attr(sizes)}"` : ''; };

// รูปในเนื้อหาข่าว/หน้าเว็บ (HTML ที่ผ่านการกรองแล้ว): เติม srcset ให้รูปจากเว็บเดิม
// และ alt="" ให้รูปที่ไม่มีคำอธิบาย (เนื้อหาเก่า — โปรแกรมอ่านหน้าจอจะไม่อ่านชื่อไฟล์)
export const withSrcset = (html, sizes = '(max-width: 860px) 100vw, 820px') =>
  String(html || '').replace(/<img\b([^>]*?)(\s*\/?)>/g, (m, attrs, end) => {
    let out = attrs;
    if (!/\salt=/.test(out)) out += ' alt=""';
    const src = (out.match(/\ssrc="(\/uploads\/wp\/[^"]+)"/) || [])[1];
    if (src && !/\ssrcset=/.test(out)) { const set = imgset(src, sizes); if (set) out += ` ${set}`; }
    return `<img${out}${end}>`;
  });
