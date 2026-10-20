import express from 'express';
import compression from 'compression';
import helmet from 'helmet';
import path from 'node:path';
import { getSettings, ROOT, UPLOAD_DIR } from './lib/db.js';
import { navTree } from './lib/nav.js';
import { parseCookies, icon, thDate, thDateTime, thTime, thDay, dateParts, pics, docs, upl, IFRAME_HOSTS, WP_FILE, RIBBON_SVG } from './lib/helpers.js';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';
import { seedDefaults } from './lib/seed.js';
import { wpMedia, oldSite, oldFolders, prefetchOld } from './lib/wpmedia.js';
import { themeCss } from './lib/colors.js';
import { gdriveMedia, status as driveStatus } from './lib/gdrive.js';
import { mourning } from './lib/popups.js';
import { imgset } from './lib/media.js';
import { siteOrigin } from './lib/site.js';
import crypto from 'node:crypto';
import fs from 'node:fs';

seedDefaults(); // เมนูหลัก ระบบบริการ ฯลฯ สำหรับฐานข้อมูลที่เพิ่งอัปเดต (สร้างเฉพาะที่ยังไม่มี)

// เลขเวอร์ชันไฟล์ CSS/JS — เปลี่ยนเมื่อไฟล์เปลี่ยน เบราว์เซอร์จะโหลดไฟล์ใหม่ทันที
const assetVersion = crypto.createHash('md5')
  .update(['css/site.css', 'css/fonts.css', 'css/admin.css', 'js/site.js', 'js/admin.js', 'js/admin-colors.js', 'js/admin-arrange.js', 'css/ebook.css', 'js/ebook.js'].map((f) => fs.readFileSync(path.join(ROOT, 'public', f))).join('')).digest('hex').slice(0, 8);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const PROD = process.env.NODE_ENV === 'production';

// ไฟล์จาก WordPress เดิมเก็บที่ uploads/wp/ — ไฟล์ที่ยังไม่ได้คัดลอกมาจะส่งต่อไปยังเว็บเดิม
// ใช้ค่า WP_MEDIA_URL (เช่น https://www.bms.ac.th/bs/wp-content/uploads/) หรือค่าที่สคริปต์นำเข้าบันทึกไว้
// OLD_SITE_URL: ที่อยู่ใหม่ของโฮสต์เดิมหลังเปลี่ยน DNS (เช่น https://old.bms.ac.th) — ใช้แทนชื่อเดิม ทั้งไฟล์ WordPress และระบบอื่นบนโฮสต์นั้น
const httpsBase = (v) => (/^https:\/\/[^\s/]+\//.test(v || '') ? v.replace(/\/?$/, '/') : '');
const SAVED_WP = httpsBase(getSettings().wp_media_url);
const OLD_ENV = httpsBase(`${String(process.env.OLD_SITE_URL || '').trim().replace(/\/+$/, '')}/`);
if (process.env.OLD_SITE_URL && !OLD_ENV) console.warn('OLD_SITE_URL ไม่ถูกต้อง (ตัวอย่าง: https://old.bms.ac.th) — ใช้ที่อยู่เดิมแทน');
const OLD_SITE = OLD_ENV ? `${new URL(OLD_ENV).origin}/` : SAVED_WP ? `${new URL(SAVED_WP).origin}/` : '';
const CONTENT_HOST = SAVED_WP ? new URL(SAVED_WP).hostname : ''; // ชื่อเว็บเดิมที่อยู่ในลิงก์ของเนื้อหา
const WP_MEDIA_URL = httpsBase(process.env.WP_MEDIA_URL) || (OLD_ENV && SAVED_WP ? new URL(new URL(SAVED_WP).pathname, OLD_ENV).href : SAVED_WP);
const WP_MEDIA_ORIGIN = WP_MEDIA_URL ? new URL(WP_MEDIA_URL).origin : null;

app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
app.set('view engine', 'ejs');
app.set('views', path.join(ROOT, 'views'));

// ---------- Security headers + CSP (ไม่มี inline script/style) ----------
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      fontSrc: ["'self'"], // ฟอนต์อยู่ในเครื่อง (public/fonts)
      // blob: = ตัวอย่างรูปก่อนอัปโหลดในหลังบ้าน · Google = รูปจาก Drive กรณีเซิร์ฟเวอร์ดึงมาเก็บไม่ได้
      imgSrc: ["'self'", 'data:', 'blob:', 'https://drive.google.com', 'https://*.googleusercontent.com', ...(WP_MEDIA_ORIGIN ? [WP_MEDIA_ORIGIN] : [])],
      // www.facebook.com = กล่องโพสต์จากเพจ Facebook ในหน้าแรก (ไม่อนุญาตให้ฝังในเนื้อหาข่าว)
      frameSrc: ["'self'", ...IFRAME_HOSTS.map((h) => `https://${h}`), 'https://www.facebook.com', ...(WP_MEDIA_ORIGIN ? [WP_MEDIA_ORIGIN] : [])],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  hsts: PROD ? { maxAge: 63072000, includeSubDomains: true } : false,
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  next();
});

app.use(compression({ threshold: 1024 })); // gzip/brotli หน้าเว็บ CSS JS (รูปและฟอนต์บีบอัดอยู่แล้ว ไม่บีบซ้ำ)
app.use((req, res, next) => { req.cookies = parseCookies(req.headers.cookie); next(); });
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// ---------- ไฟล์สาธารณะ ----------
// สูตรสีของธีม ใช้ร่วมกับหน้า "ปรับสีเว็บไซต์" ในหลังบ้าน (คำนวณตัวอย่างสีในเบราว์เซอร์ด้วยสูตรเดียวกัน)
app.get('/js/colors.mjs', (req, res) => res.type('text/javascript').set('Cache-Control', 'no-cache').sendFile(path.join(ROOT, 'lib', 'colors.js')));
// ไฟล์ที่มีเลขเวอร์ชัน (?v=) และฟอนต์ไม่เปลี่ยนเนื้อหา → เก็บในเครื่องผู้ชมได้ 1 ปี ไม่ต้องถามเซิร์ฟเวอร์ซ้ำ
const LONG_CACHE = 'public, max-age=31536000, immutable';
app.use(express.static(path.join(ROOT, 'public'), {
  maxAge: PROD ? '7d' : 0,
  setHeaders: (res, file) => {
    if (file.endsWith(`${path.sep}sw.js`)) res.setHeader('Cache-Control', 'no-cache'); // service worker ต้องอัปเดตได้ทันที
    else if (PROD && (res.req.query.v || file.includes(`${path.sep}fonts${path.sep}`))) res.setHeader('Cache-Control', LONG_CACHE);
  },
}));
// ไฟล์ที่อัปโหลด/ไฟล์จากเว็บเดิม: ฝังใน iframe ของเว็บนี้ได้ (PDF ในเนื้อหาข่าว) แต่เว็บอื่นฝังไม่ได้
// ไฟล์อื่นนอกจาก PDF เปิดแบบ sandbox — แม้มีไฟล์แปลกปลอมก็รันสคริปต์บนโดเมนนี้ไม่ได้
const fileHeaders = (req, res, next) => {
  res.setHeader('Content-Security-Policy', /\.pdf$/i.test(req.path) ? "frame-ancestors 'self'"
    : "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'; sandbox");
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
};
app.use('/uploads', fileHeaders);
// ไฟล์จากเว็บเดิม: เปิดเฉพาะชนิดไฟล์รูป/เอกสาร (กันไฟล์ .html/.js/.svg ในโฟลเดอร์เดิมถูกเปิดจากโดเมนนี้)
app.use('/uploads/wp', (req, res, next) => (WP_FILE.test(req.path) ? next() : res.status(404).end()));
app.use('/uploads', express.static(UPLOAD_DIR, {
  maxAge: '30d', index: false, dotfiles: 'deny',
  setHeaders: (res) => res.setHeader('Content-Disposition', 'inline'),
}));
app.use('/uploads/wp', wpMedia(WP_MEDIA_URL)); // ไฟล์ที่ยังไม่มีในเครื่อง → ดึงจากเว็บเดิมมาเก็บไว้
app.get('/gdrive/:size/:file', gdriveMedia()); // รูปย่อจากโฟลเดอร์ Google Drive ที่ใช้บนเว็บ

// สีประจำโรงเรียน (ตั้งค่าได้ในหลังบ้าน) → ตัวแปรสีของเว็บ
// /theme.css?v=<ลายนิ้วมือของสี> — เปลี่ยนสีแล้วเลขเปลี่ยน เบราว์เซอร์โหลดใหม่เอง
let themeCache = { css: '', v: '' };
const theme = (S) => {
  const css = themeCss(S);
  if (css !== themeCache.css) themeCache = { css, v: crypto.createHash('md5').update(css).digest('hex').slice(0, 8) };
  return themeCache;
};
app.get('/theme.css', (req, res) => {
  const t = theme(getSettings());
  res.type('text/css').set('Cache-Control', PROD && req.query.v === t.v ? LONG_CACHE : 'no-cache').send(t.css);
});

// ---------- ตัวแปรที่ใช้ร่วมกันทุกหน้า ----------
const pageLocals = (req, res) => {
  const S = getSettings();
  // ค่าที่ผู้ชมเลือกเอง (ขนาดตัวอักษร ความคมชัดสูง ปิดประกาศ) ใส่ให้ตั้งแต่โหลดหน้า หน้าจะไม่กระพริบ
  const pref = String(req.cookies.a11y || '');
  const ann = S.announce_on === '1' && S.announce_text
    ? crypto.createHash('md5').update(`${S.announce_text}\n${S.announce_link || ''}`).digest('hex').slice(0, 10) : '';
  Object.assign(res.locals, {
    icon, thDate, thDateTime, thTime, thDay, dateParts, driveStatus, pics, docs, upl, imgset, S, mourning: mourning(), ribbonSvg: RIBBON_SVG, path: req.path, url: req.originalUrl, origin: siteOrigin(req), title: '', v: assetVersion, themeV: theme(S).v,
    fs: (pref.match(/\b(sm|lg)\b/) || [])[1] || '', hc: /\bhc\b/.test(pref),
    annKey: ann && req.cookies.ann !== ann ? ann : '',
  });
};
app.use((req, res, next) => { pageLocals(req, res); next(); });

app.use('/admin', adminRoutes);
app.use('/', publicRoutes);
// โฟลเดอร์ของระบบบนโฮสต์เดิมที่ยังใช้งาน (ตั้งในหลังบ้าน): รูป/เอกสารเก็บสำเนาไว้ หน้าอื่นส่งต่อไปที่โฮสต์เดิม
const oldPaths = () => oldFolders(getSettings().old_paths);
app.use(oldSite(OLD_SITE, oldPaths, fileHeaders));

app.use((req, res) => res.status(404).render('public/error', { title: 'ไม่พบหน้าที่ต้องการ', code: 404, nav: navTree() }));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const code = err.status >= 400 && err.status < 500 ? err.status : 500; // เช่น ลิงก์ที่เข้ารหัสผิด → 400
  if (code === 500) console.error(err);
  if (res.headersSent) return;
  if (!res.locals.S) pageLocals(req, res); // ผิดพลาดก่อนถึงขั้นตั้งค่าตัวแปร (เช่น ส่งข้อมูลใหญ่เกิน) ก็ยังแสดงหน้าแจ้งข้อผิดพลาดได้
  res.status(code).render('public/error', { title: code === 500 ? 'เกิดข้อผิดพลาด' : 'คำขอไม่ถูกต้อง', code, nav: navTree() });
});

app.listen(PORT, () => {
  console.log(`เว็บไซต์:   http://localhost:${PORT}`);
  console.log(`หลังบ้าน:  http://localhost:${PORT}/admin`);
  prefetchOld(OLD_SITE, oldPaths, CONTENT_HOST).catch((e) => console.warn('เก็บสำเนาไฟล์จากโฮสต์เดิมไม่สำเร็จ:', e.message));
});
