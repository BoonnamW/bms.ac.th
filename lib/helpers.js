import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sanitizeHtml from 'sanitize-html';
import { UPLOAD_DIR } from './db.js';

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const token = (n = 32) => crypto.randomBytes(n).toString('base64url');

export function safeEqual(a = '', b = '') {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ข้ามคุกกี้ที่เข้ารหัสผิดรูปแบบ */ }
  }
  return out;
}

// ---------- CSRF สำหรับฟอร์มสาธารณะ (double-submit cookie) ----------
export function formToken(req, res) {
  let t = req.cookies.ft;
  if (!t || !/^[\w-]{20,}$/.test(t)) {
    t = token(24);
    res.cookie('ft', t, cookieOpts(req));
  }
  return t;
}
export const checkFormToken = (req) => safeEqual(req.cookies.ft, req.body?._ft);

export function cookieOpts(req, extra = {}) {
  return { httpOnly: true, sameSite: 'strict', secure: req.secure, path: '/', ...extra };
}

// ---------- ป้องกัน XSS ในเนื้อหา rich text ----------
// iframe ฝังได้เฉพาะวิดีโอ YouTube, Google Drive/Docs/Maps และไฟล์ในเว็บไซต์เอง (เช่น PDF) — ต้องตรงกับ frame-src ใน server.js
export const IFRAME_HOSTS = ['www.youtube.com', 'www.youtube-nocookie.com', 'drive.google.com', 'docs.google.com', 'www.google.com'];
// ชนิดไฟล์จากเว็บเดิม (uploads/wp) ที่เปิดให้เข้าถึงและดาวน์โหลดได้ — รูปและเอกสารเท่านั้น
export const WP_FILE = /\.(jpe?g|png|gif|webp|pdf|docx?|xlsx?|pptx?|zip|mp4)$/i;
export const cleanHtml = (html) => sanitizeHtml(String(html || ''), {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a',
    'blockquote', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'figure', 'figcaption', 'iframe'],
  allowedAttributes: {
    a: ['href', 'target', 'rel'], img: ['src', 'alt', 'width', 'height', 'loading'],
    iframe: ['src', 'width', 'height', 'title', 'allowfullscreen'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'],
  },
  allowedClasses: { figure: ['wp-gallery'] },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https'], iframe: ['https'] },
  allowedIframeHostnames: IFRAME_HOSTS,
  allowIframeRelativeUrls: true,
  allowProtocolRelative: false,
  transformTags: {
    a: (tag, attribs) => ({ tagName: 'a', attribs: { ...attribs, rel: 'noopener noreferrer' } }),
    img: (tag, attribs) => ({ tagName: 'img', attribs: { ...attribs, loading: 'lazy' } }),
  },
});

// ---------- อัปโหลดรูปภาพ: ตรวจ "ไบต์จริง" ของไฟล์ ไม่เชื่อชื่อไฟล์/MIME ที่ส่งมา ----------
export function detectImage(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'webp';
  if (buf.subarray(0, 4).toString() === 'GIF8') return 'gif';
  return null;
}

export function saveImage(file) {
  const ext = detectImage(file.buffer);
  if (!ext) throw new Error('รองรับเฉพาะไฟล์รูปภาพ JPG, PNG, WebP หรือ GIF');
  const name = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), file.buffer, { flag: 'wx' });
  return name;
}

export function removeImage(name) {
  if (!name || !/^[a-f0-9]{32}\.(jpg|png|webp|gif)$/.test(name)) return;
  fs.rm(path.join(UPLOAD_DIR, name), { force: true }, () => {});
}

// ---------- เอกสารแนบ (PDF / Word / Excel / PowerPoint): ตรวจไบต์จริงของไฟล์ให้ตรงกับนามสกุล ----------
const OOXML = ['docx', 'xlsx', 'pptx'], OLE = ['doc', 'xls', 'ppt'];
export function saveDoc(file) {
  const b = file.buffer, ext = (path.extname(file.originalname || '').slice(1) || '').toLowerCase();
  const ok = (b.subarray(0, 5).toString() === '%PDF-' && ext === 'pdf')
    || (b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) && OOXML.includes(ext))
    || (b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) && OLE.includes(ext));
  if (!ok) throw new Error('เอกสารแนบรองรับเฉพาะ PDF, Word, Excel และ PowerPoint');
  const name = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), b, { flag: 'wx' });
  // ชื่อไฟล์เดิมไว้แสดงผล (ตัดตัวอักษรที่ใช้เป็นเส้นทางไฟล์ออก)
  const label = path.basename(String(file.originalname || name)).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').slice(0, 120) || name;
  return { n: label, f: name };
}
export function removeDoc(name) {
  if (!name || !/^[a-f0-9]{32}\.(pdf|docx?|xlsx?|pptx?)$/.test(name)) return;
  fs.rm(path.join(UPLOAD_DIR, name), { force: true }, () => {});
}
// รายการรูป/เอกสารที่เก็บเป็น JSON ในฐานข้อมูล → รายการที่ชื่อไฟล์ถูกต้องเท่านั้น
const parse = (v) => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
export const pics = (v) => parse(v).filter((x) => typeof x === 'string' && /^([a-f0-9]{32}\.(jpg|png|webp|gif)|wp\/[\w./%-]+)$/.test(x));
export const docs = (v) => parse(v).filter((x) => x && typeof x.f === 'string' && /^[a-f0-9]{32}\.(pdf|docx?|xlsx?|pptx?)$/.test(x.f))
  .map((x) => ({ n: String(x.n || x.f).slice(0, 120), f: x.f, ext: x.f.split('.').pop() }));

// ---------- ตรวจสอบ URL ให้ปลอดภัย (กัน javascript: ฯลฯ) ----------
export function safeUrl(v) {
  v = String(v || '').trim();
  if (!v) return '';
  if (/^\/(?!\/)[^\s]*$/.test(v)) return v;
  try {
    const u = new URL(v);
    if (['http:', 'https:', 'mailto:', 'tel:'].includes(u.protocol)) return u.href;
  } catch { /* ไม่ใช่ URL */ }
  return null;
}

// ---------- ตัวช่วยสำหรับ template ----------
// วันเวลาในฐานข้อมูลเก็บเป็น UTC ('YYYY-MM-DD HH:MM:SS') — แสดงผลเป็นเวลาประเทศไทย
export const parseUtc = (d) => new Date(String(d).replace(' ', 'T') + (String(d).includes('T') || String(d).includes('Z') ? '' : 'Z'));
const TH = { timeZone: 'Asia/Bangkok' };
export const thDate = (d) => {
  const dt = parseUtc(d);
  return isNaN(dt) ? '' : dt.toLocaleDateString('th-TH', { ...TH, day: 'numeric', month: 'long', year: 'numeric' });
};
export const thDateTime = (d) => {
  const dt = parseUtc(d);
  return isNaN(dt) ? '' : `${dt.toLocaleDateString('th-TH', { ...TH, day: 'numeric', month: 'short', year: 'numeric' })} ${thTime(d)}`;
};
export const thTime = (d) => {
  const dt = parseUtc(d);
  return isNaN(dt) ? '' : `${dt.toLocaleTimeString('th-TH', { ...TH, hour: '2-digit', minute: '2-digit', hour12: false })} น.`;
};
// วันที่ล้วน ('YYYY-MM-DD' ไม่มีเวลา/เขตเวลา) → "26 มีนาคม 2567"
export const thDay = (ymd, month = 'long') => {
  const dt = new Date(`${String(ymd).slice(0, 10)}T12:00:00Z`);
  return isNaN(dt) ? '' : dt.toLocaleDateString('th-TH', { timeZone: 'UTC', day: 'numeric', month, year: 'numeric' });
};
// ส่วนประกอบวันที่สำหรับป้ายปฏิทิน: { day: '5', month: 'ต.ค.', year: '2569', ymd: '2026-10-05' }
export const dateParts = (d) => {
  const dt = parseUtc(d);
  if (isNaN(dt)) return { day: '', month: '', monthLong: '', year: '', weekday: '', ymd: '' };
  const part = (o) => dt.toLocaleDateString('th-TH', { ...TH, ...o });
  return { day: part({ day: 'numeric' }), month: part({ month: 'short' }), monthLong: part({ month: 'long' }),
    year: part({ year: 'numeric' }).replace(/\D/g, ''), weekday: part({ weekday: 'short' }), ymd: dt.toLocaleDateString('en-CA', TH) };
};

const P = {
  graduation: '<circle cx="12" cy="8" r="7"/><path d="M8.21 13.89 7 23l5-3 5 3-1.21-9.12"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  facebook: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
  chart: '<path d="M3 3v18h18"/><path d="M8 17v-6M13 17V7M18 17v-3"/>',
  award: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  play: '<circle cx="12" cy="12" r="10"/><path d="m10 8 6 4-6 4V8z"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/>',
  broadcast: '<circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/>',
  login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5M15 12H3"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  calplus: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 14v5M9.5 16.5h5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/>',
  contrast: '<circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor"/>',
  type: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
  bot: '<rect x="3" y="8" width="18" height="12" rx="3"/><path d="M12 8V5M8.5 13.5h.01M15.5 13.5h.01M9 17h6"/><circle cx="12" cy="4" r="1"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  rss: '<path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>',
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.5-8.5 8.5 8.5 0 0 1 8.5 8.5z"/>',
  youtube: '<path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"/><path d="m9.75 15.02 5.75-3.27-5.75-3.27z"/>',
  map: '<path d="m1 6 7-3 8 3 7-3v15l-7 3-8-3-7 3z"/><path d="M8 3v15M16 6v15"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  phone2: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  expand: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M16 21h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
  printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  bookopen: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
};
export const icon = (name, size = 24) =>
  `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.star}</svg>`;
