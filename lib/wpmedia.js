// รูป/ไฟล์จากเว็บ WordPress เดิมที่ยังไม่มีในเครื่อง: เซิร์ฟเวอร์ดึงมาเองครั้งแรกแล้วเก็บไว้ใน uploads/wp
// (ครั้งต่อไปส่งจากเครื่องนี้ทันที และไม่ติดการกันลิงก์รูปข้ามเว็บ) — ดึงไม่ได้จึงส่งผู้ชมไปที่เว็บเดิมแทน
// โฟลเดอร์อื่นบนโฮสต์เดิม (ระบบจองห้อง ระบบชุมนุม รูปผู้บริหาร ไฟล์แนบเว็บรุ่นก่อน) ใช้ที่อยู่เดิมได้ต่อหลังเปลี่ยน DNS:
// รูป/เอกสารเก็บสำเนาไว้ใน uploads/old · หน้าของระบบส่งต่อไปยังโฮสต์เดิม (OLD_SITE_URL)
import fs from 'node:fs';
import path from 'node:path';
import { db, UPLOAD_DIR } from './db.js';
import { WP_FILE } from './helpers.js';

// ติดตั้งบนโฮสต์เดียวกับเว็บเดิม: ตั้ง WP_UPLOADS_DIR เป็นโฟลเดอร์ wp-content/uploads เดิม ใช้ไฟล์ได้เลยไม่ต้องคัดลอก
export const WP_DIR = process.env.WP_UPLOADS_DIR ? path.resolve(process.env.WP_UPLOADS_DIR) : path.join(UPLOAD_DIR, 'wp');
const OLD_DIR = path.join(UPLOAD_DIR, 'old');
const MAX_BYTES = 20 * 1024 * 1024;
const TYPES = /^(image\/|video\/mp4|application\/(pdf|msword|zip|x-zip|octet-stream|vnd\.))/i;
const NET = /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|UND_ERR_CONNECT|CERT|SSL|TLS/;
const unreachable = (e) => e.name === 'TimeoutError' || e.name === 'AbortError' || NET.test(`${e.cause?.code || ''} ${e.cause?.message || ''}`);
const bare = (h) => String(h || '').toLowerCase().replace(/^www\./, '');
// ชี้ชื่อเว็บเดิมมาที่เซิร์ฟเวอร์นี้แล้ว → ส่งต่อไปก็วนกลับมาที่นี่ไม่รู้จบ
const sameHost = (url, req) => bare(url.hostname) === bare(req.hostname);

async function download(url, file) {
  const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'school-website-media/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!TYPES.test(res.headers.get('content-type') || '')) throw new Error('ชนิดไฟล์ไม่ถูกต้อง');
  if (Number(res.headers.get('content-length') || 0) > MAX_BYTES) throw new Error('ไฟล์ใหญ่เกิน');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error('ไฟล์ใหญ่เกิน');
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.part-${process.pid}-${Date.now()}`;
  await fs.promises.writeFile(tmp, buf);
  await fs.promises.rename(tmp, file);
}

// ส่งไฟล์จาก dir ถ้ามีแล้ว · ไม่มี → ดึงจาก baseUrl (เส้นทางเดียวกัน) มาเก็บไว้ก่อนส่ง
function mirror(dir, baseUrl, warning) {
  const inflight = new Map(); // ไฟล์ที่กำลังดึง — คำขอซ้ำรอผลเดียวกัน
  const missing = new Map(); // ไฟล์ที่ดึงไม่ได้ → เวลาที่ลองใหม่ได้
  let downUntil = 0; // เว็บเดิมติดต่อไม่ได้ → ไม่ลองดึงชั่วคราว (ผู้ชมไม่ต้องรอ)
  let warned = false;
  return async (req, res, next) => {
    if (!baseUrl || (req.method !== 'GET' && req.method !== 'HEAD')) return next();
    let rel;
    try { rel = decodeURIComponent(req.path).replace(/^\/+/, ''); } catch { return res.status(400).end(); }
    const local = path.resolve(dir, rel);
    const remote = new URL(req.path.replace(/^\/+/, ''), baseUrl);
    if (!rel || rel.includes('\0') || !local.startsWith(dir + path.sep) || !remote.href.startsWith(baseUrl)) return res.status(404).end();
    const send = () => res.sendFile(local, { maxAge: '30d', headers: { 'Content-Disposition': 'inline' } }, (err) => { if (err && !res.headersSent) next(err); });
    if (fs.existsSync(local)) return send();
    if (sameHost(remote, req)) { // ต้องคัดลอกไฟล์มาไว้ในเครื่อง หรือบอกที่อยู่ใหม่ของโฮสต์เดิม
      if (!warned) { warned = true; console.warn(warning); }
      return res.status(404).end();
    }
    // ส่งต่อไปเว็บเดิม: ไม่ส่งชื่อเว็บนี้ไปด้วย (กันระบบกันลิงก์รูปข้ามเว็บของโฮสต์เดิม)
    const redirect = () => res.set('Referrer-Policy', 'no-referrer').redirect(302, remote.href);
    if (Date.now() < downUntil || (missing.get(rel) || 0) > Date.now()) return redirect();
    if (!inflight.has(rel) && inflight.size >= 8) return redirect();
    if (!inflight.has(rel)) inflight.set(rel, download(remote, local).finally(() => inflight.delete(rel)));
    try {
      await inflight.get(rel);
    } catch (e) {
      if (unreachable(e)) downUntil = Date.now() + 10 * 60e3;
      else { // ไม่มีไฟล์ / ชนิดไฟล์ผิด / ถูกส่งต่อไปที่อื่น
        if (missing.size > 5000) missing.clear();
        missing.set(rel, Date.now() + 30 * 60e3);
      }
      return redirect();
    }
    send();
  };
}

export const wpMedia = (baseUrl) => mirror(WP_DIR, baseUrl,
  `ไม่พบไฟล์ของเว็บเดิมใน ${WP_DIR} และที่อยู่ไฟล์เดิมชี้มาที่เว็บนี้เอง — คัดลอก wp-content/uploads มาไว้ที่โฟลเดอร์นี้ หรือตั้ง OLD_SITE_URL (ดู README)`);

// รายชื่อโฟลเดอร์จากหน้าตั้งค่า เช่น "room-booking bms-club img/boss"
export const oldFolders = (v) => String(v || '').split(/[\s,]+/).map((s) => s.replace(/^\/+|\/+$/g, ''))
  .filter((s) => /^[\w.~-]+(\/[\w.~-]+)*$/.test(s) && !s.split('/').some((x) => /^\.+$/.test(x))).slice(0, 30);

// ทำงานเมื่อไม่มีหน้าไหนของเว็บนี้ตรงกับที่อยู่นั้น (วางไว้ก่อนหน้า 404) — ตั้งรายชื่อโฟลเดอร์ผิดก็ไม่ทับหน้าของเว็บนี้
export function oldSite(baseUrl, folders, headers) {
  const files = mirror(OLD_DIR, baseUrl,
    `ไม่พบไฟล์ของโฮสต์เดิมใน ${OLD_DIR} และ OLD_SITE_URL ยังชี้มาที่เว็บนี้ — ตั้งเป็นที่อยู่ใหม่ของโฮสต์เดิม เช่น https://old.bms.ac.th (ดู README)`);
  return (req, res, next) => {
    if (!baseUrl || !folders().some((f) => req.path === `/${f}` || req.path.startsWith(`/${f}/`))) return next();
    if (WP_FILE.test(req.path)) return headers(req, res, () => files(req, res, next));
    const to = new URL(req.originalUrl.replace(/^\/+/, ''), baseUrl);
    if (to.origin !== new URL(baseUrl).origin || sameHost(to, req)) return next();
    res.redirect(req.method === 'GET' || req.method === 'HEAD' ? 302 : 307, to.href); // 307 = ส่งฟอร์มต่อได้ด้วยวิธีเดิม
  };
}

// รูป/เอกสารบนโฮสต์เดิมที่เนื้อหาในเว็บอ้างถึง (รูปผู้บริหาร ไฟล์แนบข่าวเก่า): ดึงมาเก็บไว้ตั้งแต่เริ่มระบบ
// ทำก่อนเปลี่ยน DNS → หลังเปลี่ยนแล้วเว็บนี้ส่งไฟล์เหล่านี้เองได้ทันที ไม่ต้องพึ่งโฮสต์เดิม
export async function prefetchOld(baseUrl, folders, contentHost) {
  const dirs = folders();
  if (!baseUrl || !contentHost || !dirs.length) return;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const host = bare(contentHost);
  // ชื่อไฟล์มีวงเล็บได้ เช่น "รายงานการประชุม 1..2562 (9 ม.ค.62).docx" — วงเล็บปิดเกินมาเท่านั้นที่ตัดทิ้ง (ลิงก์ที่เขียนไว้ในวงเล็บ)
  const re = new RegExp(`https?://(?:www\\.)?${esc(host)}/((?:${dirs.map(esc).join('|')})/[^"'\\s<>?#]+)`, 'gi');
  const trim = (p) => ((p.match(/\)/g) || []).length > (p.match(/\(/g) || []).length ? p.replace(/\)+$/, '') : p);
  const want = new Set();
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('sessions', 'users', 'wp_media')").all()) {
    const cols = db.prepare(`PRAGMA table_info("${name}")`).all().filter((c) => /TEXT/i.test(c.type)).map((c) => `"${c.name}"`);
    if (!cols.length) continue;
    for (const row of db.prepare(`SELECT ${cols.join(', ')} FROM "${name}"`).all()) {
      for (const v of Object.values(row)) {
        if (typeof v !== 'string' || !v.includes(host)) continue;
        for (const m of v.matchAll(re)) { const p = trim(m[1]); if (WP_FILE.test(p)) want.add(p); }
      }
    }
  }
  let got = 0;
  for (const p of want) {
    let rel;
    try { rel = decodeURIComponent(p); } catch { continue; }
    const local = path.resolve(OLD_DIR, rel);
    if (!local.startsWith(OLD_DIR + path.sep) || fs.existsSync(local)) continue;
    try { await download(new URL(rel, baseUrl), local); got++; } catch (e) { if (unreachable(e)) break; }
  }
  if (got) console.log(`เก็บสำเนาไฟล์จากโฮสต์เดิมแล้ว ${got} ไฟล์ (${OLD_DIR})`);
}
