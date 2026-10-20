import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { db, getSettings, ROOT, UPLOAD_DIR } from './lib/db.js';
import { navTree } from './lib/nav.js';
import { parseCookies, icon, thDate, thDateTime, thTime, thDay, dateParts, token, pics, docs, IFRAME_HOSTS, WP_FILE, RIBBON_SVG } from './lib/helpers.js';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';
import { seedDefaults } from './lib/seed.js';
import { wpMedia } from './lib/wpmedia.js';
import { themeCss } from './lib/colors.js';
import { gdriveMedia, status as driveStatus } from './lib/gdrive.js';
import { mourning } from './lib/popups.js';
import crypto from 'node:crypto';
import fs from 'node:fs';

seedDefaults(); // เมนูหลัก ระบบบริการ ฯลฯ สำหรับฐานข้อมูลที่เพิ่งอัปเดต (สร้างเฉพาะที่ยังไม่มี)

// เลขเวอร์ชันไฟล์ CSS/JS — เปลี่ยนเมื่อไฟล์เปลี่ยน เบราว์เซอร์จะโหลดไฟล์ใหม่ทันที
const assetVersion = crypto.createHash('md5')
  .update(['css/site.css', 'js/site.js', 'css/ebook.css', 'js/ebook.js'].map((f) => fs.readFileSync(path.join(ROOT, 'public', f))).join('')).digest('hex').slice(0, 8);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const PROD = process.env.NODE_ENV === 'production';

// ไฟล์จาก WordPress เดิมเก็บที่ uploads/wp/ — ไฟล์ที่ยังไม่ได้คัดลอกมาจะส่งต่อไปยังเว็บเดิม
// ใช้ค่า WP_MEDIA_URL (เช่น https://www.bms.ac.th/bs/wp-content/uploads/) หรือค่าที่สคริปต์นำเข้าบันทึกไว้
const httpsBase = (v) => (/^https:\/\/[^\s/]+\//.test(v || '') ? v.replace(/\/?$/, '/') : '');
const WP_MEDIA_URL = httpsBase(process.env.WP_MEDIA_URL) || httpsBase(getSettings().wp_media_url);
const WP_MEDIA_ORIGIN = WP_MEDIA_URL ? new URL(WP_MEDIA_URL).origin : null;

app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
app.set('view engine', 'ejs');
app.set('views', path.join(ROOT, 'views'));

// ---------- Security headers + CSP (ไม่มี inline script/style) ----------
app.use((req, res, next) => { res.locals.nonce = token(16); next(); });
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      // blob: = ตัวอย่างรูปก่อนอัปโหลดในหลังบ้าน · Google = รูปจาก Drive กรณีเซิร์ฟเวอร์ดึงมาเก็บไม่ได้
      imgSrc: ["'self'", 'data:', 'blob:', 'https://drive.google.com', 'https://*.googleusercontent.com', ...(WP_MEDIA_ORIGIN ? [WP_MEDIA_ORIGIN] : [])],
      frameSrc: ["'self'", ...IFRAME_HOSTS.map((h) => `https://${h}`), ...(WP_MEDIA_ORIGIN ? [WP_MEDIA_ORIGIN] : [])],
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

app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use((req, res, next) => { req.cookies = parseCookies(req.headers.cookie); next(); });

// ---------- ไฟล์สาธารณะ ----------
app.use(express.static(path.join(ROOT, 'public'), {
  maxAge: PROD ? '7d' : 0,
  setHeaders: (res, file) => { if (file.endsWith(`${path.sep}sw.js`)) res.setHeader('Cache-Control', 'no-cache'); }, // service worker ต้องอัปเดตได้ทันที
}));
// ไฟล์จากเว็บเดิม: เปิดเฉพาะชนิดไฟล์รูป/เอกสาร (กันไฟล์ .html/.js/.svg ในโฟลเดอร์เดิมถูกเปิดจากโดเมนนี้)
app.use('/uploads/wp', (req, res, next) => (WP_FILE.test(req.path) ? next() : res.status(404).end()));
app.use('/uploads', express.static(UPLOAD_DIR, {
  maxAge: '30d', index: false, dotfiles: 'deny',
  setHeaders: (res) => res.setHeader('Content-Disposition', 'inline'),
}));
app.use('/uploads/wp', wpMedia(WP_MEDIA_URL)); // ไฟล์ที่ยังไม่มีในเครื่อง → ดึงจากเว็บเดิมมาเก็บไว้
app.get('/gdrive/:size/:file', gdriveMedia()); // รูปย่อจากโฟลเดอร์ Google Drive ที่ใช้บนเว็บ

// สีประจำโรงเรียน (ตั้งค่าได้ในหลังบ้าน) → ตัวแปรสีของเว็บ
app.get('/theme.css', (req, res) => res.type('text/css').set('Cache-Control', 'no-cache').send(themeCss(getSettings())));

// ---------- ตัวแปรที่ใช้ร่วมกันทุกหน้า ----------
const extLinksSql = db.prepare('SELECT title, url FROM ext_links WHERE active=1 ORDER BY sort, id');
app.use((req, res, next) => {
  const S = getSettings();
  // ค่าที่ผู้ชมเลือกเอง (ขนาดตัวอักษร ความคมชัดสูง ปิดประกาศ) ใส่ให้ตั้งแต่โหลดหน้า หน้าจะไม่กระพริบ
  const pref = String(req.cookies.a11y || '');
  const ann = S.announce_on === '1' && S.announce_text
    ? crypto.createHash('md5').update(`${S.announce_text}\n${S.announce_link || ''}`).digest('hex').slice(0, 10) : '';
  Object.assign(res.locals, {
    icon, thDate, thDateTime, thTime, thDay, dateParts, driveStatus, pics, docs, S, mourning: mourning(), ribbonSvg: RIBBON_SVG, path: req.path, url: req.originalUrl, origin: `${req.protocol}://${req.get('host')}`, title: '', v: assetVersion,
    fs: (pref.match(/\b(sm|lg)\b/) || [])[1] || '', hc: /\bhc\b/.test(pref),
    annKey: ann && req.cookies.ann !== ann ? ann : '',
    extLinks: extLinksSql.all(), // ลิงก์หน่วยงานภายนอกท้ายเว็บ
  });
  next();
});

app.use('/admin', adminRoutes);
app.use('/', publicRoutes);

app.use((req, res) => res.status(404).render('public/error', { title: 'ไม่พบหน้าที่ต้องการ', code: 404, nav: navTree() }));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const code = err.status >= 400 && err.status < 500 ? err.status : 500; // เช่น ลิงก์ที่เข้ารหัสผิด → 400
  if (code === 500) console.error(err);
  if (res.headersSent) return;
  res.status(code).render('public/error', { title: code === 500 ? 'เกิดข้อผิดพลาด' : 'คำขอไม่ถูกต้อง', code, nav: navTree() });
});

app.listen(PORT, () => {
  console.log(`เว็บไซต์:   http://localhost:${PORT}`);
  console.log(`หลังบ้าน:  http://localhost:${PORT}/admin`);
});
