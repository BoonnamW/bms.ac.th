// รูป/ไฟล์จากเว็บ WordPress เดิมที่ยังไม่มีในเครื่อง: เซิร์ฟเวอร์ดึงมาเองครั้งแรกแล้วเก็บไว้ใน uploads/wp
// (ครั้งต่อไปส่งจากเครื่องนี้ทันที และไม่ติดการกันลิงก์รูปข้ามเว็บ) — ดึงไม่ได้จึงส่งผู้ชมไปที่เว็บเดิมแทน
import fs from 'node:fs';
import path from 'node:path';
import { UPLOAD_DIR } from './db.js';

const WP_DIR = path.join(UPLOAD_DIR, 'wp');
const MAX_BYTES = 20 * 1024 * 1024;
const TYPES = /^(image\/|video\/mp4|application\/(pdf|msword|zip|x-zip|octet-stream|vnd\.))/i;
const inflight = new Map(); // ไฟล์ที่กำลังดึง — คำขอซ้ำรอผลเดียวกัน
const missing = new Map(); // ไฟล์ที่ดึงไม่ได้ → เวลาที่ลองใหม่ได้
let downUntil = 0; // เว็บเดิมติดต่อไม่ได้ → ไม่ลองดึงชั่วคราว (ผู้ชมไม่ต้องรอ)
const NET = /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|UND_ERR_CONNECT|CERT|SSL|TLS/;
const unreachable = (e) => e.name === 'TimeoutError' || e.name === 'AbortError' || NET.test(`${e.cause?.code || ''} ${e.cause?.message || ''}`);
const bare = (h) => String(h || '').toLowerCase().replace(/^www\./, '');
let warned = false;

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

export function wpMedia(baseUrl) {
  return async (req, res, next) => {
    if (!baseUrl || (req.method !== 'GET' && req.method !== 'HEAD')) return next();
    let rel;
    try { rel = decodeURIComponent(req.path).replace(/^\/+/, ''); } catch { return res.status(400).end(); }
    const local = path.resolve(WP_DIR, rel);
    const remote = new URL(req.path.replace(/^\/+/, ''), baseUrl);
    if (!rel || rel.includes('\0') || !local.startsWith(WP_DIR + path.sep) || !remote.href.startsWith(baseUrl)) return res.status(404).end();
    // ชี้ชื่อเว็บเดิมมาที่เซิร์ฟเวอร์นี้แล้ว → ส่งต่อไปก็วนกลับมาที่นี่ไม่รู้จบ — ต้องคัดลอกไฟล์มาไว้ในเครื่องแทน
    if (bare(remote.hostname) === bare(req.hostname)) {
      if (!warned) { warned = true; console.warn(`ไม่พบไฟล์ของเว็บเดิมใน ${WP_DIR} และ WP_MEDIA_URL ชี้มาที่เว็บนี้เอง — คัดลอก wp-content/uploads มาไว้ที่โฟลเดอร์นี้ (ดู README)`); }
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
    res.sendFile(local, { maxAge: '30d', headers: { 'Content-Disposition': 'inline' } }, (err) => { if (err && !res.headersSent) next(err); });
  };
}
