import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { getSettings, ROOT, UPLOAD_DIR } from './lib/db.js';
import { navTree } from './lib/nav.js';
import { parseCookies, icon, thDate, token, IFRAME_HOSTS } from './lib/helpers.js';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const PROD = process.env.NODE_ENV === 'production';

// ไฟล์จาก WordPress เดิมเก็บที่ uploads/wp/ — ระหว่างที่ยังไม่ได้คัดลอกโฟลเดอร์ wp-content/uploads มา
// ให้ตั้ง WP_MEDIA_URL (เช่น https://www.bms.ac.th/bs/wp-content/uploads/) ระบบจะส่งต่อไปยังเว็บเดิมให้
const WP_MEDIA_URL = /^https:\/\/[^\s/]+\//.test(process.env.WP_MEDIA_URL || '') ? process.env.WP_MEDIA_URL.replace(/\/?$/, '/') : '';
const WP_MEDIA_ORIGIN = WP_MEDIA_URL ? new URL(WP_MEDIA_URL).origin : null;
const WP_FILE = /\.(jpe?g|png|gif|webp|pdf|docx?|xlsx?|pptx?|zip|mp4)$/i;

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
      imgSrc: ["'self'", 'data:', ...(WP_MEDIA_ORIGIN ? [WP_MEDIA_ORIGIN] : [])],
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
app.use(express.static(path.join(ROOT, 'public'), { maxAge: PROD ? '7d' : 0 }));
// ไฟล์จากเว็บเดิม: เปิดเฉพาะชนิดไฟล์รูป/เอกสาร (กันไฟล์ .html/.js/.svg ในโฟลเดอร์เดิมถูกเปิดจากโดเมนนี้)
app.use('/uploads/wp', (req, res, next) => (WP_FILE.test(req.path) ? next() : res.status(404).end()));
app.use('/uploads', express.static(UPLOAD_DIR, {
  maxAge: '30d', index: false, dotfiles: 'deny',
  setHeaders: (res) => res.setHeader('Content-Disposition', 'inline'),
}));
app.use('/uploads/wp', (req, res, next) => (WP_MEDIA_URL ? res.redirect(302, WP_MEDIA_URL + req.path.slice(1)) : next()));

app.get('/theme.css', (req, res) => {
  const s = getSettings();
  const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(v) ? v : d);
  res.type('text/css').set('Cache-Control', 'no-cache')
    .send(`:root{--primary:${hex(s.primary, '#14325e')};--accent:${hex(s.accent, '#c9a227')}}`);
});

// ---------- ตัวแปรที่ใช้ร่วมกันทุกหน้า ----------
app.use((req, res, next) => {
  Object.assign(res.locals, { icon, thDate, S: getSettings(), path: req.path, title: '' });
  next();
});

app.use('/admin', adminRoutes);
app.use('/', publicRoutes);

app.use((req, res) => res.status(404).render('public/error', { title: 'ไม่พบหน้าที่ต้องการ', code: 404, nav: navTree() }));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  if (res.headersSent) return;
  res.status(500).render('public/error', { title: 'เกิดข้อผิดพลาด', code: 500, nav: navTree() });
});

app.listen(PORT, () => {
  console.log(`เว็บไซต์:   http://localhost:${PORT}`);
  console.log(`หลังบ้าน:  http://localhost:${PORT}/admin`);
});
