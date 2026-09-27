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
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
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
export const cleanHtml = (html) => sanitizeHtml(String(html || ''), {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a',
    'blockquote', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowProtocolRelative: false,
  transformTags: { a: (tag, attribs) => ({ tagName: 'a', attribs: { ...attribs, rel: 'noopener noreferrer' } }) },
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
export const thDate = (d) => {
  const dt = new Date(String(d).replace(' ', 'T') + (String(d).includes('T') || String(d).includes('Z') ? '' : 'Z'));
  return isNaN(dt) ? '' : dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' });
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
};
export const icon = (name, size = 24) =>
  `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.star}</svg>`;
