import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { db, getSettings } from '../lib/db.js';
import { navTree } from '../lib/nav.js';
import { CATEGORIES } from '../lib/entities.js';
import { formToken, checkFormToken, thDate, parseUtc } from '../lib/helpers.js';
import { OIT_GROUP } from '../lib/oit.js';
import { EVENT_END_SQL, nowUtc, eventView, icsCalendar } from '../lib/events.js';
import { STAFF_GROUP } from '../lib/staff.js';
import { sessionOf } from '../lib/session.js';

const r = Router();
const PAGE_SIZE = 9;
const all = (sql, ...a) => db.prepare(sql).all(...a);
const one = (sql, ...a) => db.prepare(sql).get(...a);
const baseUrl = (req) => `${req.protocol}://${req.get('host')}`;
const pageNo = (v) => Math.max(1, Math.min(10000, parseInt(v, 10) || 1));
const PENDING = "body LIKE '<p>อยู่ระหว่างจัดเตรียมข้อมูล%'"; // หน้า OIT ที่ยังเป็นข้อความรอข้อมูล

// ลิงก์เดิมจาก WordPress (/bs/2024/01/02/ชื่อข่าว/, /bs/?p=123 ฯลฯ) → หน้าใหม่ เพื่อไม่ให้ลิงก์จาก Google/Facebook เสีย
const legacy = db.prepare('SELECT target FROM legacy_urls WHERE path=?');
r.use((req, res, next) => {
  if (!req.path.startsWith('/bs')) return next();
  if (req.path.startsWith('/bs/wp-content/uploads/')) return res.redirect(301, '/uploads/wp/' + req.path.slice(23));
  let key;
  try { key = decodeURIComponent(req.path).replace(/\/+$/, '') || '/bs'; } catch { return next(); }
  const id = /^\d+$/.test(req.query.p || req.query.page_id || '') ? (req.query.p || req.query.page_id) : '';
  const hit = (id && legacy.get(`?id=${id}`)) || legacy.get(key)
    || (key.startsWith('/bs/category/') && { target: '/news' }) || (key === '/bs' && { target: '/' });
  return hit ? res.redirect(301, hit.target) : next();
});

// ---------- ตัวนับผู้เข้าชม (นับจำนวนครั้งต่อวัน ไม่เก็บข้อมูลส่วนบุคคล) ----------
const bump = db.prepare('INSERT INTO visits (day, n) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET n = n + 1');
const BOT = /bot|crawl|spider|slurp|preview|monitor|curl|wget|python|headless|lighthouse/i;
const todayTH = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
let visitCache = null;
function visitStats(counted) {
  const day = todayTH();
  if (!visitCache || visitCache.day !== day || Date.now() - visitCache.at > 5 * 60e3) {
    visitCache = {
      day, at: Date.now(),
      today: one('SELECT n FROM visits WHERE day=?', day)?.n || 0,
      month: one('SELECT COALESCE(SUM(n), 0) s FROM visits WHERE day LIKE ?', `${day.slice(0, 7)}%`).s,
      total: one('SELECT COALESCE(SUM(n), 0) s FROM visits').s,
    };
  } else if (counted) { visitCache.today++; visitCache.month++; visitCache.total++; }
  return visitCache;
}

r.use((req, res, next) => {
  res.locals.nav = navTree();
  let counted = false;
  if (req.method === 'GET' && !req.path.startsWith('/api/') && (req.get('accept') || '').includes('text/html')
    && !BOT.test(req.get('user-agent') || '')) {
    try { bump.run(todayTH()); counted = true; } catch { /* ตัวนับไม่ควรทำให้หน้าเว็บใช้งานไม่ได้ */ }
  }
  res.locals.visits = visitStats(counted);
  next();
});

// ---------- ข้อมูลที่ใช้ร่วมกัน ----------
const staffLike = (like, limit) => all(`SELECT s.id, s.name, p.slug, p.title dept FROM staff s JOIN pages p ON p.id=s.page_id
  WHERE s.active=1 AND p.published=1 AND s.name LIKE ? ESCAPE '\\' ORDER BY s.name LIMIT ?`, like, limit);
const newsCats = () => CATEGORIES.filter((c) => one('SELECT 1 FROM news WHERE published=1 AND category=? LIMIT 1', c));
const upcomingEvents = (limit) =>
  all(`SELECT * FROM events WHERE published=1 AND ${EVENT_END_SQL} >= ? ORDER BY start_at LIMIT ?`, nowUtc(), limit).map(eventView);

// สเกลแกนตัวเลขแบบปัดเป็นค่ากลม ๆ (0, 25, 50 …)
function niceScale(max, target = 4) {
  if (!(max > 0)) return { top: 1, ticks: [0, 1] };
  const raw = max / target, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const top = Math.ceil(max / step) * step;
  return { top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => +(i * step).toFixed(6)) };
}

// สรุปตัวเลขสำหรับศูนย์ข้อมูลสารสนเทศ (คำนวณจากข้อมูลจริงในระบบ)
function dataSummary() {
  const perYear = all(`SELECT strftime('%Y', created_at, '+7 hours') y, COUNT(*) n FROM news WHERE published=1
    AND created_at IS NOT NULL GROUP BY y ORDER BY y`).filter((x) => x.y).map((x) => ({ year: Number(x.y) + 543, n: x.n }));
  const oit = one(`SELECT COUNT(*) total, COALESCE(SUM(NOT (${PENDING})), 0) done FROM pages WHERE published=1 AND slug LIKE 'oit-o%'`);
  return {
    stats: all('SELECT * FROM stats ORDER BY sort, id'),
    perYear, newsTotal: perYear.reduce((s, x) => s + x.n, 0), oit,
  };
}

const youtubeEmbed = (url) => {
  const m = String(url || '').match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m ? { url, embed: `https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=1&rel=0` } : url ? { url, embed: '' } : null;
};

// ---------- robots / sitemap / RSS / app manifest ----------
r.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nDisallow: /search\nDisallow: /api/\nSitemap: ${baseUrl(req)}/sitemap.xml\n`);
});

r.get('/sitemap.xml', (req, res) => {
  const base = baseUrl(req);
  const esc = (s) => String(s).replace(/&/g, '&amp;');
  const urls = [
    ['/', '1.0'], ['/news', '0.8'], ['/calendar', '0.7'], ['/gallery', '0.6'], ['/academics', '0.6'], ['/portal', '0.6'],
    ['/ita', '0.7'], ['/data', '0.5'], ['/contact', '0.5'],
    ...all('SELECT slug FROM pages WHERE published=1').map((p) => [`/p/${p.slug}`, '0.6']),
    ...all('SELECT id FROM news WHERE published=1 ORDER BY created_at DESC LIMIT 500').map((n) => [`/news/${n.id}`, '0.5']),
  ];
  const body = urls.map(([u, p]) => `<url><loc>${esc(base + encodeURI(u))}</loc><priority>${p}</priority></url>`).join('');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`);
});

r.get('/feed.xml', (req, res) => {
  const S = getSettings(), base = baseUrl(req);
  const x = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const items = all('SELECT id, title, category, excerpt, created_at FROM news WHERE published=1 ORDER BY created_at DESC LIMIT 30')
    .map((n) => `<item><title>${x(n.title)}</title><link>${base}/news/${n.id}</link><guid>${base}/news/${n.id}</guid>`
      + `<pubDate>${parseUtc(n.created_at).toUTCString()}</pubDate><category>${x(n.category)}</category>`
      + `<description>${x(n.excerpt)}</description></item>`).join('');
  res.type('application/rss+xml').send(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${x(S.school_name)}</title>`
    + `<link>${base}/</link><description>${x(S.tagline)}</description><language>th</language>${items}</channel></rss>`);
});

r.get('/manifest.webmanifest', (req, res) => {
  const S = getSettings();
  const theme = /^#[0-9a-f]{6}$/i.test(S.primary) ? S.primary : '#14325e';
  res.type('application/manifest+json').send(JSON.stringify({
    name: S.school_name, short_name: S.school_name.replace(/^โรงเรียน/, '').trim().slice(0, 24) || S.school_name,
    description: S.tagline, lang: 'th', start_url: '/?source=app', scope: '/', display: 'standalone',
    background_color: '#ffffff', theme_color: theme,
    icons: [
      { src: '/img/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/img/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/img/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'ข่าวสาร', url: '/news' }, { name: 'ปฏิทินกิจกรรม', url: '/calendar' }, { name: 'บริการออนไลน์', url: '/portal' },
    ],
  }));
});

// ---------- API (ใช้กับแท็บข่าวหน้าแรก ช่องค้นหา และผู้ช่วย) ----------
const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 90, standardHeaders: true, legacyHeaders: false });
r.use('/api', apiLimiter);

r.get('/api/news', (req, res) => {
  const cat = CATEGORIES.includes(req.query.cat) ? req.query.cat : '';
  const limit = Math.min(12, Math.max(1, parseInt(req.query.limit, 10) || 4));
  const rows = all(`SELECT id, title, category, excerpt, image, created_at FROM news WHERE published=1 ${cat ? 'AND category=?' : ''}
    ORDER BY created_at DESC LIMIT ?`, ...(cat ? [cat] : []), limit);
  res.set('Cache-Control', 'public, max-age=60').json({
    items: rows.map((n) => ({ id: n.id, title: n.title, category: n.category, excerpt: n.excerpt || '',
      image: n.image ? `/uploads/${n.image}` : null, date: thDate(n.created_at), url: `/news/${n.id}` })),
  });
});

r.get('/api/search', (req, res) => {
  const term = String(req.query.q || '').trim().slice(0, 60);
  if (term.length < 2) return res.json({ results: [] });
  const like = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
  const results = [
    ...all("SELECT title, url FROM menu_items WHERE active=1 AND url<>'' AND title LIKE ? ESCAPE '\\' LIMIT 4", like)
      .map((m) => ({ title: m.title, url: m.url, type: 'เมนู' })),
    ...all("SELECT title, url FROM services WHERE active=1 AND title LIKE ? ESCAPE '\\' LIMIT 3", like)
      .map((s) => ({ title: s.title, url: s.url, type: 'บริการออนไลน์' })),
    ...all("SELECT title, slug FROM pages WHERE published=1 AND title LIKE ? ESCAPE '\\' LIMIT 4", like)
      .map((p) => ({ title: p.title, url: `/p/${p.slug}`, type: 'หน้าเว็บ' })),
    ...staffLike(like, 4).map((s) => ({ title: s.name, url: `/p/${s.slug}#staff-${s.id}`, type: `บุคลากร · ${s.dept}` })),
    ...all("SELECT id, title, created_at FROM news WHERE published=1 AND title LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT 5", like)
      .map((n) => ({ title: n.title, url: `/news/${n.id}`, type: `ข่าว · ${thDate(n.created_at)}` })),
  ];
  const seen = new Set();
  res.json({ results: results.filter((x) => !seen.has(x.url) && seen.add(x.url)).slice(0, 10) });
});

// ---------- หน้าแรก ----------
r.get('/', (req, res) => {
  const S = res.locals.S;
  res.render('public/home', {
    title: '',
    slides: all('SELECT * FROM slides WHERE active=1 ORDER BY sort, id'),
    links: all('SELECT * FROM links ORDER BY sort, id'),
    stats: all('SELECT * FROM stats ORDER BY sort, id'),
    news: all('SELECT id, title, category, excerpt, image, created_at FROM news WHERE published=1 ORDER BY created_at DESC LIMIT 4'),
    cats: newsCats(),
    events: upcomingEvents(4),
    programs: all('SELECT * FROM programs ORDER BY sort, id LIMIT 4'),
    highlights: all('SELECT * FROM highlights ORDER BY sort, id LIMIT 6'),
    achievements: all(`SELECT id, title, image, created_at FROM news WHERE published=1 AND category='ผลงานนักเรียน'
      ORDER BY created_at DESC LIMIT 8`),
    gallery: all('SELECT * FROM gallery ORDER BY sort, id LIMIT 12'),
    data: dataSummary(),
    tour: youtubeEmbed(S.tour_url),
  });
});

// ---------- ข่าวสาร ----------
r.get('/news', (req, res) => {
  const cat = CATEGORIES.includes(req.query.cat) ? req.query.cat : '';
  const page = pageNo(req.query.page);
  const where = cat ? 'published=1 AND category=?' : 'published=1';
  const args = cat ? [cat] : [];
  const total = one(`SELECT COUNT(*) c FROM news WHERE ${where}`, ...args).c;
  const items = all(`SELECT id, title, category, excerpt, image, created_at FROM news WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ...args, PAGE_SIZE, (page - 1) * PAGE_SIZE);
  res.render('public/news', {
    title: cat ? `ข่าว${cat}` : 'ข่าวสารและประกาศ', items, cat, page, total,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), categories: newsCats(),
  });
});

r.get('/news/:id', (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return next();
  const item = one('SELECT * FROM news WHERE id=? AND published=1', req.params.id);
  if (!item) return next();
  const recent = all('SELECT id, title, image, created_at FROM news WHERE published=1 AND id<>? ORDER BY created_at DESC LIMIT 5', item.id);
  const related = all('SELECT id, title, category, excerpt, image, created_at FROM news WHERE published=1 AND category=? AND id<>? ORDER BY created_at DESC LIMIT 3',
    item.category, item.id);
  res.render('public/article', { title: item.title, item, recent, related, shareUrl: `${baseUrl(req)}/news/${item.id}` });
});

// ---------- หน้าเว็บทั่วไป ----------
r.get('/p/:slug', (req, res, next) => {
  const page = one('SELECT * FROM pages WHERE slug=? AND published=1', req.params.slug);
  if (!page) return next();
  const siblings = page.menu_group
    ? all('SELECT title, slug FROM pages WHERE published=1 AND menu_group=? ORDER BY sort, id', page.menu_group) : [];
  // ทำเนียบบุคลากร: หน้ารวม = การ์ดกลุ่มสาระ, หน้ากลุ่มสาระ = หัวหน้ากลุ่มด้านบน + สมาชิก
  let staff = null, depts = null;
  if (page.menu_group === STAFF_GROUP && page.title === STAFF_GROUP) {
    depts = all('SELECT id, title, slug FROM pages WHERE published=1 AND menu_group=? AND title<>? ORDER BY sort, id', STAFF_GROUP, STAFF_GROUP)
      .map((d) => ({
        ...d,
        n: one('SELECT COUNT(*) c FROM staff WHERE page_id=? AND active=1', d.id).c,
        lead: one('SELECT name, image, is_head FROM staff WHERE page_id=? AND active=1 ORDER BY is_head DESC, sort, id LIMIT 1', d.id),
      }));
  } else if (page.menu_group === STAFF_GROUP) {
    const rows = all('SELECT * FROM staff WHERE page_id=? AND active=1 ORDER BY is_head DESC, sort, id', page.id);
    staff = rows[0]?.is_head ? { head: rows[0], members: rows.slice(1) } : { head: null, members: rows };
  }
  const editor = !!(staff || depts) && !!sessionOf(req); // ผู้ดูแลที่เข้าสู่ระบบอยู่ เห็นปุ่มเพิ่ม/แก้ไข
  res.render('public/page', { title: page.title, page, siblings, staff, depts, editor });
});

// ---------- ปฏิทินกิจกรรม ----------
r.get('/calendar', (req, res) => {
  const now = nowUtc();
  const upcoming = all(`SELECT * FROM events WHERE published=1 AND ${EVENT_END_SQL} >= ? ORDER BY start_at LIMIT 300`, now).map(eventView);
  const past = all(`SELECT * FROM events WHERE published=1 AND ${EVENT_END_SQL} < ? ORDER BY start_at DESC LIMIT 30`, now).map(eventView);
  const months = [];
  for (const e of upcoming) {
    if (months.at(-1)?.key !== e.monthKey) months.push({ key: e.monthKey, label: `${e.start.monthLong} ${e.start.year}`, items: [] });
    months.at(-1).items.push(e);
  }
  res.render('public/calendar', { title: 'ปฏิทินกิจกรรม', months, past, host: req.get('host') });
});

r.get('/calendar.ics', (req, res) => {
  const S = getSettings();
  const events = all("SELECT * FROM events WHERE published=1 AND start_at >= datetime('now', '-365 days') ORDER BY start_at");
  res.set('Cache-Control', 'public, max-age=900').type('text/calendar; charset=utf-8')
    .send(icsCalendar(events, { name: `ปฏิทินกิจกรรม ${S.school_name}`, host: req.hostname, base: baseUrl(req) }));
});

r.get('/events/:id.ics', (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return next();
  const e = one('SELECT * FROM events WHERE id=? AND published=1', req.params.id);
  if (!e) return next();
  res.type('text/calendar; charset=utf-8').attachment(`event-${e.id}.ics`)
    .send(icsCalendar([e], { name: getSettings().school_name, host: req.hostname, base: baseUrl(req) }));
});

// ---------- คลังภาพกิจกรรม (ข่าวที่มีอัลบั้มภาพ) ----------
r.get('/gallery', (req, res) => {
  const where = "published=1 AND image IS NOT NULL AND image NOT LIKE '%.pdf' AND (category='กิจกรรม' OR body LIKE '%wp-gallery%')";
  const per = 12, page = pageNo(req.query.page);
  const total = one(`SELECT COUNT(*) c FROM news WHERE ${where}`).c;
  const albums = all(`SELECT id, title, image, created_at, body FROM news WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, per, (page - 1) * per)
    .map((n) => ({ id: n.id, title: n.title, image: n.image, created_at: n.created_at, photos: (String(n.body).match(/<img\b/g) || []).length }));
  res.render('public/gallery', { title: 'ภาพกิจกรรม', albums, page, pages: Math.max(1, Math.ceil(total / per)), total });
});

// ---------- ศูนย์ข้อมูลสารสนเทศ ----------
r.get('/data', (req, res) => {
  const d = dataSummary();
  const yearScale = niceScale(Math.max(0, ...d.perYear.map((x) => x.n)));
  const maxN = Math.max(0, ...d.perYear.map((x) => x.n));
  const years = d.perYear.map((x, i, arr) => ({ ...x, pct: Math.round((x.n / yearScale.top) * 100),
    label: x.n === maxN || i === arr.length - 1, current: i === arr.length - 1 && x.year === new Date().getFullYear() + 543 }));
  const cats = all('SELECT category c, COUNT(*) n FROM news WHERE published=1 GROUP BY category ORDER BY n DESC, category');
  const catMax = Math.max(1, ...cats.map((c) => c.n));
  const counts = {
    pages: one('SELECT COUNT(*) c FROM pages WHERE published=1').c,
    albums: one("SELECT COUNT(*) c FROM news WHERE published=1 AND body LIKE '%wp-gallery%'").c,
    events: one('SELECT COUNT(*) c FROM events WHERE published=1').c,
    services: one('SELECT COUNT(*) c FROM services WHERE active=1').c,
  };
  res.render('public/data', {
    title: 'ศูนย์ข้อมูลสารสนเทศ', d, years, yearTicks: yearScale.ticks,
    cats: cats.map((c) => ({ ...c, pct: Math.round((c.n / catMax) * 100) })), counts,
  });
});

// ---------- เปิดเผยข้อมูลสาธารณะ (ITA / OIT) ----------
r.get('/ita', (req, res) => {
  const items = all("SELECT title, slug FROM pages WHERE published=1 AND slug LIKE 'oit-o%' ORDER BY sort, id")
    .map((p) => ({ ...p, code: p.slug.replace(/^oit-/, '').toUpperCase() }));
  const more = all("SELECT title, slug FROM pages WHERE published=1 AND menu_group=? AND slug NOT LIKE 'oit-o%' ORDER BY sort, id", OIT_GROUP);
  res.render('public/ita', { title: 'เปิดเผยข้อมูลสาธารณะ (ITA / OIT)', items, more });
});

// ---------- พอร์ทัล / ระบบบริการออนไลน์ ----------
r.get('/portal', (req, res) => {
  const services = all('SELECT * FROM services WHERE active=1 ORDER BY sort, id');
  const forStudents = ['นักเรียน', 'ผู้ปกครอง'];
  const groups = [
    { id: 'students', title: 'นักเรียนและผู้ปกครอง', en: 'Students & Parents', icon: 'graduation',
      items: services.filter((s) => forStudents.includes(s.audience)) },
    { id: 'staff', title: 'ครูและบุคลากร', en: 'Teachers & Staff', icon: 'users', items: services.filter((s) => s.audience === 'ครูและบุคลากร') },
    { id: 'public', title: 'บุคคลทั่วไป', en: 'Everyone', icon: 'globe',
      items: services.filter((s) => ![...forStudents, 'ครูและบุคลากร'].includes(s.audience)) },
  ].filter((g) => g.items.length);
  res.render('public/portal', { title: 'พอร์ทัลและระบบบริการออนไลน์', groups });
});

// ---------- หลักสูตรและการเรียนรู้ ----------
r.get('/academics', (req, res) => {
  const staffIndex = one("SELECT target FROM legacy_urls WHERE path='?id=364'")?.target;
  res.render('public/academics', {
    title: 'หลักสูตรและการเรียนรู้',
    programs: all('SELECT * FROM programs ORDER BY sort, id'),
    depts: all("SELECT title, slug FROM pages WHERE published=1 AND menu_group='บุคลากร' ORDER BY sort, id")
      .filter((p) => `/p/${p.slug}` !== staffIndex),
    news: all("SELECT id, title, category, excerpt, image, created_at FROM news WHERE published=1 AND category='วิชาการ' ORDER BY created_at DESC LIMIT 3"),
  });
});

// ---------- ค้นหา ----------
r.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  let news = [], pages = [], services = [], people = [];
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    news = all("SELECT id, title, excerpt, created_at FROM news WHERE published=1 AND (title LIKE ? ESCAPE '\\' OR excerpt LIKE ? ESCAPE '\\') ORDER BY created_at DESC LIMIT 30", like, like);
    pages = all("SELECT title, slug FROM pages WHERE published=1 AND title LIKE ? ESCAPE '\\' LIMIT 20", like);
    services = all("SELECT title, url FROM services WHERE active=1 AND title LIKE ? ESCAPE '\\' LIMIT 10", like);
    people = staffLike(like, 20);
  }
  res.render('public/search', { title: 'ค้นหา', q, news, pages, services, people });
});

// ---------- ติดต่อเรา ----------
const contactLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => res.status(429).render('public/contact', { title: 'ติดต่อเรา', ft: formToken(req, res), sent: false, prefill: '', error: 'ส่งข้อความบ่อยเกินไป กรุณาลองใหม่ภายหลัง' }) });

const TOPICS = { visit: 'ขอนัดหมายเยี่ยมชมโรงเรียน\nวันที่สะดวก: \nจำนวนผู้เยี่ยมชม: ' };
r.get('/contact', (req, res) => {
  res.render('public/contact', { title: 'ติดต่อเรา', ft: formToken(req, res), sent: req.query.sent === '1', prefill: TOPICS[req.query.topic] || '', error: '' });
});

r.post('/contact', contactLimiter, (req, res) => {
  const b = req.body || {};
  const view = (error) => res.status(400).render('public/contact', { title: 'ติดต่อเรา', ft: formToken(req, res), sent: false, prefill: '', error });
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
