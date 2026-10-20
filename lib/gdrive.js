// รูปจากโฟลเดอร์ Google Drive ที่แชร์แบบ "ทุกคนที่มีลิงก์ดูได้"
// - รายชื่อรูป: ตั้ง GOOGLE_API_KEY ไว้ → ใช้ Google Drive API (เสถียรกว่า) · ไม่มีคีย์ → อ่านจากหน้าแสดงโฟลเดอร์แบบฝังของ Google
//   เก็บไว้ในฐานข้อมูล และอัปเดตเองเมื่อมีคนเปิดดูหลังผ่านไป 6 ชั่วโมง (เพิ่มรูปในโฟลเดอร์ภายหลังได้)
// - ตัวรูป: เซิร์ฟเวอร์ดึงรูปย่อมาเก็บไว้ใน uploads/gdrive แล้วส่งจากเครื่องนี้ (ผู้ชมไม่ต้องโหลดจาก Google โดยตรง)
//   ดึงไม่ได้จึงส่งผู้ชมไปที่ Google แทน — ดึงได้เฉพาะรูปในโฟลเดอร์ที่ใช้บนเว็บนี้
import fs from 'node:fs';
import path from 'node:path';
import { db, UPLOAD_DIR } from './db.js';

const API = (process.env.GDRIVE_API_URL || 'https://www.googleapis.com').replace(/\/+$/, '');
const WEB = (process.env.GDRIVE_WEB_URL || 'https://drive.google.com').replace(/\/+$/, '');
const API_KEY = process.env.GOOGLE_API_KEY || '';
const DIR = path.join(UPLOAD_DIR, 'gdrive');
const FRESH_MS = 6 * 3600e3, RETRY_MS = 10 * 60e3;
export const SIZES = { t: 480, l: 1600 }; // t = รูปย่อ, l = รูปใหญ่ (ดูทีละรูป)
const ID = /^[\w-]{10,120}$/;
const IMAGE_NAME = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i;
const MAX_BYTES = 15 * 1024 * 1024;
const UA = 'Mozilla/5.0 (compatible; school-website/1.0)';
const NET = /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|UND_ERR_CONNECT|CERT|SSL|TLS/;
const unreachable = (e) => e.name === 'TimeoutError' || e.name === 'AbortError' || NET.test(`${e.cause?.code || ''} ${e.cause?.message || ''}`);

class DriveError extends Error {
  constructor(message, final) { super(message); this.final = final; } // final = ปัญหาที่ตัวโฟลเดอร์/การตั้งค่า (ไม่ใช่เน็ตขัดข้องชั่วคราว)
}

// ลิงก์ที่รับ: /drive/folders/ID, /drive/u/0/folders/ID, /open?id=ID, /embeddedfolderview?id=ID หรือรหัสโฟลเดอร์ (+ resourcekey ถ้ามี)
export function parseFolder(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  let id = '', key = '';
  if (ID.test(s)) id = s;
  else {
    let u;
    try { u = new URL(s); } catch { return null; }
    if (u.protocol !== 'https:' || !/^(drive|docs)\.google\.com$/.test(u.hostname)) return null;
    id = (u.pathname.match(/\/folders\/([\w-]+)/) || [])[1]
      || (/^\/(open|embeddedfolderview)$/.test(u.pathname) ? u.searchParams.get('id') : '') || '';
    key = u.searchParams.get('resourcekey') || '';
  }
  if (!ID.test(id) || (key && !/^[\w-]{1,120}$/.test(key))) return null;
  return { id, key };
}
export const folderLink = (f) => `https://drive.google.com/drive/folders/${f.id}${f.key ? `?resourcekey=${f.key}` : ''}`;
export const fileLink = (fileId) => `https://drive.google.com/file/d/${fileId}/view`;

const decode = (s) => String(s).replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n))).replace(/&#x([\da-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
const byName = (a, b) => a.name.localeCompare(b.name, 'th', { numeric: true });
const exifTime = (t) => (/^\d{4}:\d\d:\d\d \d\d:\d\d:\d\d$/.test(t || '') ? t.replace(/^(\d{4}):(\d\d):(\d\d) /, '$1-$2-$3T') : '');

async function listViaApi(f) {
  const out = [];
  let pageToken = '';
  do {
    const url = new URL(`${API}/drive/v3/files`);
    url.search = new URLSearchParams({
      q: `'${f.id}' in parents and trashed=false`, key: API_KEY, pageSize: '1000', orderBy: 'name_natural',
      supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
      fields: 'nextPageToken,files(id,name,mimeType,createdTime,imageMediaMetadata(time))', ...(pageToken ? { pageToken } : {}),
    });
    const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers: f.key ? { 'X-Goog-Drive-Resource-Keys': `${f.id}/${f.key}` } : {} });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      if (res.status === 404) throw new DriveError('ไม่พบโฟลเดอร์ หรือโฟลเดอร์ยังไม่ได้แชร์แบบ "ทุกคนที่มีลิงก์ดูได้"', true);
      if (res.status === 400 && /api key/i.test(msg)) throw new DriveError('GOOGLE_API_KEY ไม่ถูกต้อง — ตรวจสอบคีย์ในการตั้งค่าเซิร์ฟเวอร์', true);
      if (res.status === 400 || res.status === 403) throw new DriveError(`Google Drive ไม่อนุญาต: ${msg}`, true);
      throw new DriveError(`Google Drive ขัดข้อง (${msg})`, false);
    }
    for (const x of data.files || []) {
      if (/^image\//.test(x.mimeType || '') && ID.test(x.id || '')) out.push({ id: x.id, name: x.name || '', taken: exifTime(x.imageMediaMetadata?.time) || x.createdTime || '' });
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken && out.length < 5000);
  return out;
}

// หน้าแสดงโฟลเดอร์แบบฝัง: แต่ละรายการมี id="entry-<รหัสไฟล์>" ชื่อไฟล์อยู่ใน flip-entry-title
// ถ้าโครงหน้าเปลี่ยน ยังหาไฟล์จากลิงก์ /file/d/<รหัส> ได้
export function parseEmbed(html) {
  const marks = [...html.matchAll(/id="entry-([\w-]{10,120})"/g)];
  const chunks = marks.length
    ? marks.map((m, i) => [m[1], html.slice(m.index, marks[i + 1]?.index ?? html.length)])
    : [...html.matchAll(/\/file\/d\/([\w-]{10,120})/g)].map((m) => [m[1], html.slice(Math.max(0, m.index - 400), m.index + 800)]);
  const out = [], seen = new Set();
  for (const [id, chunk] of chunks) {
    if (seen.has(id)) continue;
    if (marks.length && !/\/file\/d\//.test(chunk) && /\/folders\//.test(chunk)) continue; // โฟลเดอร์ย่อย
    const name = decode((chunk.match(/class="flip-entry-title"[^>]*>([^<]*)</) || [])[1] || '');
    if (name && !IMAGE_NAME.test(name)) continue; // ไม่ใช่ไฟล์รูป เช่น PDF วิดีโอ
    seen.add(id);
    out.push({ id, name, taken: '' });
  }
  return out.some((x) => x.name) ? out.sort(byName) : out;
}

async function listViaEmbed(f) {
  const url = `${WEB}/embeddedfolderview?id=${encodeURIComponent(f.id)}${f.key ? `&resourcekey=${encodeURIComponent(f.key)}` : ''}`;
  const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { 'User-Agent': UA, 'Accept-Language': 'th,en;q=0.8' } });
  if (res.status >= 300 && res.status < 400) throw new DriveError('โฟลเดอร์ยังไม่ได้แชร์แบบ "ทุกคนที่มีลิงก์ดูได้" (Google ให้เข้าสู่ระบบก่อน)', true);
  if (res.status === 404) throw new DriveError('ไม่พบโฟลเดอร์ใน Google Drive', true);
  if (!res.ok) throw new DriveError(`Google Drive ขัดข้อง (HTTP ${res.status})`, res.status < 500);
  const html = await res.text();
  const list = parseEmbed(html);
  if (!list.length && /accounts\.google\.com|ServiceLogin/.test(html)) throw new DriveError('โฟลเดอร์ยังไม่ได้แชร์แบบ "ทุกคนที่มีลิงก์ดูได้"', true);
  return list;
}

const folderSql = db.prepare('SELECT * FROM gdrive_folders WHERE id=?');
const photosSql = db.prepare('SELECT file_id id, name, taken FROM gdrive_photos WHERE folder_id=? ORDER BY sort LIMIT ?');
const knownSql = db.prepare('SELECT 1 FROM gdrive_photos WHERE file_id=? LIMIT 1');
const upFolder = db.prepare(`INSERT INTO gdrive_folders (id, rkey, fetched_at, ok, error, n) VALUES (?,?,?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET rkey=excluded.rkey, fetched_at=excluded.fetched_at, ok=excluded.ok, error=excluded.error, n=excluded.n`);

function store(f, list) {
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM gdrive_photos WHERE folder_id=?').run(f.id);
    const ins = db.prepare('INSERT OR IGNORE INTO gdrive_photos (folder_id, file_id, name, taken, sort) VALUES (?,?,?,?,?)');
    list.forEach((p, i) => ins.run(f.id, p.id, p.name.slice(0, 200), p.taken, i));
    upFolder.run(f.id, f.key || null, Date.now(), 1, null, list.length);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

const jobs = new Map();
// อ่านรายชื่อรูปจาก Google ใหม่ → { ok, n } หรือ { ok:false, error, final }
export function refresh(f) {
  if (jobs.has(f.id)) return jobs.get(f.id);
  const job = (async () => {
    try {
      const list = await (API_KEY ? listViaApi(f) : listViaEmbed(f));
      store(f, list);
      return { ok: true, n: list.length };
    } catch (e) {
      const err = e instanceof DriveError ? e
        : new DriveError(unreachable(e) ? 'ติดต่อ Google Drive ไม่ได้ในขณะนี้ ลองใหม่ภายหลัง' : `อ่านโฟลเดอร์ไม่ได้ (${e.message})`, false);
      const old = folderSql.get(f.id);
      upFolder.run(f.id, f.key || null, Date.now(), 0, err.message, old?.n || 0); // เก็บรายการรูปเดิมไว้
      return { ok: false, error: err.message, final: err.final };
    }
  })().finally(() => jobs.delete(f.id));
  jobs.set(f.id, job);
  return job;
}

const stale = (info) => !info || Date.now() - info.fetched_at > (info.ok ? FRESH_MS : RETRY_MS);

// ข้อมูลโฟลเดอร์จากฐานข้อมูลทันที (ใช้ในหน้ารวม) — ถ้าเก่าแล้ว อัปเดตเบื้องหลัง
export function summary(url) {
  const f = parseFolder(url);
  if (!f) return null;
  const info = folderSql.get(f.id);
  if (stale(info)) refresh(f);
  return { link: folderLink(f), n: info?.n || 0, cover: info?.n ? photosSql.get(f.id, 1)?.id : null };
}

// รูปทั้งหมดของโฟลเดอร์ (หน้าอัลบั้ม/ข่าว) — ยังไม่เคยอ่าน รอผลสั้น ๆ ให้เห็นรูปตั้งแต่ครั้งแรก
export async function album(url, { limit = 3000, wait = 7000 } = {}) {
  const f = parseFolder(url);
  if (!f) return null;
  let info = folderSql.get(f.id);
  if (stale(info)) {
    const job = refresh(f);
    if (!info?.n) await Promise.race([job, new Promise((r) => setTimeout(r, wait))]);
    info = folderSql.get(f.id);
  }
  return { link: folderLink(f), info, photos: photosSql.all(f.id, limit).map((p) => ({ ...p, open: fileLink(p.id) })) };
}

// สถานะสำหรับฟอร์มหลังบ้าน
export function status(url) {
  const f = parseFolder(url);
  const info = f && folderSql.get(f.id);
  if (!info) return null;
  return { ok: !!info.ok, n: info.n, error: info.error, at: new Date(info.fetched_at).toISOString().slice(0, 19).replace('T', ' ') };
}

// ---------- รูปย่อ: /gdrive/<t|l>/<รหัสไฟล์> ----------
const TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
const fetching = new Map();
let downUntil = 0;
const thumbUrl = (id, size) => `${WEB}/thumbnail?id=${encodeURIComponent(id)}&sz=w${SIZES[size]}`;
const okHost = (u) => { try { const h = new URL(u).hostname; return /(^|\.)(googleusercontent|google)\.com$/.test(h) || h === new URL(WEB).hostname; } catch { return false; } };
const findLocal = async (base) => {
  for (const ext of Object.values(TYPES)) {
    const p = `${base}${ext}`;
    if (await fs.promises.stat(p).then((s) => s.isFile(), () => false)) return p;
  }
  return null;
};

async function download(url, base) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!okHost(res.url)) throw new Error('ถูกส่งต่อไปเว็บอื่น');
  const ext = TYPES[(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()];
  if (!ext) throw new Error('ไม่ใช่ไฟล์รูป');
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > MAX_BYTES) throw new Error('ขนาดไฟล์ไม่ถูกต้อง');
  await fs.promises.mkdir(DIR, { recursive: true });
  const tmp = `${base}.part-${process.pid}-${Date.now()}`;
  await fs.promises.writeFile(tmp, buf);
  await fs.promises.rename(tmp, `${base}${ext}`);
  return `${base}${ext}`;
}

export function gdriveMedia() {
  return async (req, res, next) => {
    const { size, file } = req.params;
    if (!Object.hasOwn(SIZES, size) || !ID.test(file) || !knownSql.get(file)) return res.status(404).end();
    const base = path.join(DIR, `${file}-${size}`);
    const remote = thumbUrl(file, size);
    const send = (p) => res.sendFile(p, { maxAge: '30d', headers: { 'Content-Disposition': 'inline' } }, (err) => { if (err && !res.headersSent) next(err); });
    const redirect = () => res.set('Referrer-Policy', 'no-referrer').redirect(302, remote.startsWith('https://') ? remote : `https://drive.google.com/thumbnail?id=${file}&sz=w${SIZES[size]}`);
    const have = await findLocal(base);
    if (have) return send(have);
    if (Date.now() < downUntil || (!fetching.has(base) && fetching.size >= 6)) return redirect();
    if (!fetching.has(base)) fetching.set(base, download(remote, base).finally(() => fetching.delete(base)));
    try {
      send(await fetching.get(base));
    } catch (e) {
      if (unreachable(e)) downUntil = Date.now() + 5 * 60e3;
      redirect();
    }
  };
}
