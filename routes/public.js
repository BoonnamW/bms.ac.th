import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { db } from '../lib/db.js';
import { navTree } from '../lib/nav.js';
import { CATEGORIES } from '../lib/entities.js';
import { formToken, checkFormToken } from '../lib/helpers.js';

const r = Router();
const PAGE_SIZE = 9;

r.use((req, res, next) => { res.locals.nav = navTree(); next(); });

r.get('/robots.txt', (req, res) => {
  res.type('text/plain').send('User-agent: *\nDisallow: /admin\nDisallow: /search\nSitemap: ' + `${req.protocol}://${req.get('host')}/sitemap.xml\n`);
});

r.get('/sitemap.xml', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  const esc = (s) => String(s).replace(/&/g, '&amp;');
  const urls = [
    ['/', '1.0'], ['/news', '0.8'], ['/contact', '0.5'],
    ...db.prepare('SELECT slug FROM pages WHERE published=1').all().map((p) => [`/p/${p.slug}`, '0.6']),
    ...db.prepare('SELECT id FROM news WHERE published=1 ORDER BY created_at DESC LIMIT 200').all().map((n) => [`/news/${n.id}`, '0.5']),
  ];
  const body = urls.map(([u, p]) => `<url><loc>${esc(base + u)}</loc><priority>${p}</priority></url>`).join('');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`);
});

r.get('/', (req, res) => {
  const q = (sql) => db.prepare(sql).all();
  res.render('public/home', {
    title: '',
    slides: q('SELECT * FROM slides WHERE active=1 ORDER BY sort, id'),
    links: q('SELECT * FROM links ORDER BY sort, id'),
    news: q('SELECT id,title,category,excerpt,image,created_at FROM news WHERE published=1 ORDER BY created_at DESC LIMIT 6'),
    stats: q('SELECT * FROM stats ORDER BY sort, id'),
    gallery: q('SELECT * FROM gallery ORDER BY sort, id LIMIT 6'),
    categories: CATEGORIES,
  });
});

r.get('/news', (req, res) => {
  const cat = CATEGORIES.includes(req.query.cat) ? req.query.cat : '';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const where = cat ? 'published=1 AND category=?' : 'published=1';
  const args = cat ? [cat] : [];
  const total = db.prepare(`SELECT COUNT(*) c FROM news WHERE ${where}`).get(...args).c;
  const items = db.prepare(
    `SELECT id,title,category,excerpt,image,created_at FROM news WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...args, PAGE_SIZE, (page - 1) * PAGE_SIZE);
  res.render('public/news', {
    title: 'ข่าวสารและประกาศ', items, cat, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), categories: CATEGORIES,
  });
});

r.get('/news/:id', (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return next();
  const item = db.prepare('SELECT * FROM news WHERE id=? AND published=1').get(req.params.id);
  if (!item) return next();
  const recent = db.prepare('SELECT id,title,created_at FROM news WHERE published=1 AND id<>? ORDER BY created_at DESC LIMIT 5').all(item.id);
  res.render('public/article', { title: item.title, item, recent });
});

r.get('/p/:slug', (req, res, next) => {
  const page = db.prepare('SELECT * FROM pages WHERE slug=? AND published=1').get(req.params.slug);
  if (!page) return next();
  const siblings = page.menu_group
    ? db.prepare('SELECT title,slug FROM pages WHERE published=1 AND menu_group=? ORDER BY sort,id').all(page.menu_group) : [];
  res.render('public/page', { title: page.title, page, siblings });
});

r.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  let news = [], pages = [];
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    news = db.prepare(`SELECT id,title,excerpt,created_at FROM news WHERE published=1 AND (title LIKE ? ESCAPE '\\' OR excerpt LIKE ? ESCAPE '\\') ORDER BY created_at DESC LIMIT 20`).all(like, like);
    pages = db.prepare(`SELECT title,slug FROM pages WHERE published=1 AND title LIKE ? ESCAPE '\\' LIMIT 20`).all(like);
  }
  res.render('public/search', { title: 'ค้นหา', q, news, pages });
});

const contactLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => res.status(429).render('public/contact', { title: 'ติดต่อเรา', ft: formToken(req, res), sent: false, error: 'ส่งข้อความบ่อยเกินไป กรุณาลองใหม่ภายหลัง' }) });

r.get('/contact', (req, res) => {
  res.render('public/contact', { title: 'ติดต่อเรา', ft: formToken(req, res), sent: req.query.sent === '1', error: '' });
});

r.post('/contact', contactLimiter, (req, res) => {
  const b = req.body || {};
  const view = (error) => res.status(400).render('public/contact', { title: 'ติดต่อเรา', ft: formToken(req, res), sent: false, error });
  if (!checkFormToken(req)) return view('เซสชันหมดอายุ กรุณาลองใหม่อีกครั้ง');
  if (b.website) return res.redirect('/contact?sent=1'); // honeypot: บอทกรอกช่องที่ซ่อนไว้
  const name = String(b.name || '').trim().slice(0, 100);
  const email = String(b.email || '').trim().slice(0, 120);
  const phone = String(b.phone || '').trim().slice(0, 30);
  const message = String(b.message || '').trim().slice(0, 3000);
  if (!name || !message) return view('กรุณากรอกชื่อและข้อความ');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return view('รูปแบบอีเมลไม่ถูกต้อง');
  if (!b.consent) return view('กรุณายืนยันการยินยอมให้เก็บข้อมูลส่วนบุคคลก่อนส่งข้อความ');
  db.prepare('INSERT INTO messages (name,email,phone,message) VALUES (?,?,?,?)').run(name, email, phone, message);
  res.redirect('/contact?sent=1');
});

export default r;
