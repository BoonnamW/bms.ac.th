import { Router } from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { db, getSettings } from '../lib/db.js';
import { entities, settingsFields, colorFields, ROLES, canManage } from '../lib/entities.js';
import { backupSummary, writeBackup } from '../lib/backup.js';
import { SCHOOL_COLORS } from '../lib/seed.js';
import { HOME_SECTIONS, homeLayout } from '../lib/home.js';
import { sessionOf } from '../lib/session.js';
import { parseFolder, folderLink, refresh as refreshDrive, status as driveStatus } from '../lib/gdrive.js';
import {
  token, sha256, safeEqual, cookieOpts, cleanHtml, saveImage, removeImage, saveDoc, removeDoc, pics, docs, safeUrl,
} from '../lib/helpers.js';

const r = Router();
const SESSION_MS = 2 * 60 * 60 * 1000; // 2 ชั่วโมง
// defParamCharset utf8 = ชื่อไฟล์ภาษาไทยไม่เพี้ยน (ค่าเริ่มต้นของ multer อ่านเป็น latin1)
const upload = multer({ storage: multer.memoryStorage(), defParamCharset: 'utf8', limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 40 } });
// ฟอร์มเนื้อหา: รูปหลัก 1 รูป · รูปประกอบหลายรูป (images) · เอกสารแนบ (files)
const MAX_IMAGES = 12, MAX_FILES = 5, IMG_BYTES = 5 * 1024 * 1024;
const uploadForm = multer({ storage: multer.memoryStorage(), defParamCharset: 'utf8', limits: { fileSize: 10 * 1024 * 1024, files: 1 + MAX_IMAGES + MAX_FILES, fields: 80 } })
  .fields([{ name: 'image', maxCount: 1 }, { name: 'images', maxCount: MAX_IMAGES }, { name: 'files', maxCount: MAX_FILES }]);
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);

r.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.locals.entities = entities;
  next();
});

// ---------- เซสชัน ----------
// หมดอายุเมื่อไม่ได้ใช้งาน 2 ชั่วโมง — ใช้งานอยู่ระบบต่ออายุให้เอง (เขียนบทความยาว ๆ แล้วไม่หลุดกลางคัน)
const extendSql = db.prepare('UPDATE sessions SET expires=? WHERE id=?');
function loadSession(req, res, next) {
  const row = sessionOf(req);
  req.user = row ? { id: row.uid, username: row.username, name: row.name, role: row.role, must_change: row.must_change } : null;
  if (row) {
    req.csrf = row.csrf; req.sidHash = row.id;
    if (row.expires - Date.now() < SESSION_MS - 5 * 60e3) { // ต่ออายุไม่เกินทุก 5 นาที
      extendSql.run(Date.now() + SESSION_MS, row.id);
      res.cookie('sid', req.cookies.sid, cookieOpts(req, { maxAge: SESSION_MS }));
    }
  }
  res.locals.user = req.user;
  res.locals.csrf = req.csrf || '';
  res.locals.roles = ROLES;
  res.locals.can = (key) => canManage(req.user, key);
  next();
}
r.use(loadSession);

function startSession(req, res, userId) {
  const sid = token(32);
  db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
  db.prepare('INSERT INTO sessions (id,user_id,csrf,expires) VALUES (?,?,?,?)').run(sha256(sid), userId, token(24), Date.now() + SESSION_MS);
  res.cookie('sid', sid, cookieOpts(req, { maxAge: SESSION_MS }));
}

const requireAuth = (req, res, next) => {
  if (!req.user) return res.redirect('/admin/login');
  if (req.user.must_change && req.path !== '/password' && req.path !== '/logout') return res.redirect('/admin/password');
  next();
};
// ตั้งค่า สี การจัดเมนู ผู้ใช้งาน และไฟล์สำรอง — ใช้หลัง requireAuth
const forbidden = (res) => res.status(403).render('admin/message', { title: 'ไม่มีสิทธิ์', msg: 'หน้านี้สำหรับผู้ดูแลระบบเท่านั้น หากต้องใช้งาน กรุณาติดต่อผู้ดูแลระบบของโรงเรียน' });
const requireAdmin = (req, res, next) => (req.user.role === 'admin' ? next() : forbidden(res));

// ตรวจ CSRF token — ต้องเรียกหลัง multer/urlencoded แปลง body แล้ว
const csrfCheck = (req, res, next) => {
  if (!req.user || !safeEqual(req.body?._csrf, req.csrf)) return res.status(403).render('admin/message', { title: 'คำขอไม่ถูกต้อง', msg: 'โทเค็นความปลอดภัยไม่ถูกต้องหรือหมดอายุ กรุณากลับไปโหลดหน้าใหม่แล้วลองอีกครั้ง' });
  next();
};

// ---------- เข้าสู่ระบบ ----------
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => res.status(429).render('admin/login', { title: 'เข้าสู่ระบบ', error: 'พยายามเข้าสู่ระบบมากเกินไป กรุณารอ 15 นาที', lt: '' }) });

function loginToken(req, res) {
  let t = req.cookies.lt;
  if (!t || !/^[\w-]{20,}$/.test(t)) { t = token(24); res.cookie('lt', t, cookieOpts(req, { path: '/admin' })); }
  return t;
}

r.get('/login', (req, res) => {
  if (req.user) return res.redirect('/admin');
  res.render('admin/login', { title: 'เข้าสู่ระบบ', error: '', lt: loginToken(req, res) });
});

r.post('/login', loginLimiter, async (req, res) => {
  const fail = (error) => res.status(401).render('admin/login', { title: 'เข้าสู่ระบบ', error, lt: loginToken(req, res) });
  if (!safeEqual(req.cookies.lt, req.body?._lt)) return fail('เซสชันหมดอายุ กรุณาลองอีกครั้ง');
  const username = String(req.body.username || '').slice(0, 60);
  const password = String(req.body.password || '').slice(0, 200);
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (u && u.locked_until > Date.now()) { await bcrypt.compare(password, DUMMY_HASH); return fail('บัญชีถูกล็อกชั่วคราว กรุณาลองใหม่ภายหลัง'); }
  const ok = await bcrypt.compare(password, u ? u.hash : DUMMY_HASH);
  if (!u || !ok) {
    if (u) {
      const fails = u.fails + 1;
      db.prepare('UPDATE users SET fails=?, locked_until=? WHERE id=?').run(fails >= 5 ? 0 : fails, fails >= 5 ? Date.now() + 15 * 60 * 1000 : 0, u.id);
    }
    return fail('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }
  if (!u.active) return fail('บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
  db.prepare('UPDATE users SET fails=0, locked_until=0, last_login=? WHERE id=?').run(Date.now(), u.id);
  startSession(req, res, u.id); // สร้าง session ใหม่ทุกครั้ง (กัน session fixation)
  res.redirect('/admin');
});

r.post('/logout', requireAuth, csrfCheck, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE id=?').run(req.sidHash);
  res.clearCookie('sid', cookieOpts(req));
  res.redirect('/admin/login');
});

// ---------- เปลี่ยนรหัสผ่าน ----------
r.get('/password', requireAuth, (req, res) => res.render('admin/password', { title: 'เปลี่ยนรหัสผ่าน', error: '', ok: false }));
r.post('/password', requireAuth, csrfCheck, async (req, res) => {
  const { current = '', next: pw = '', confirm = '' } = req.body;
  const view = (error, ok = false) => res.render('admin/password', { title: 'เปลี่ยนรหัสผ่าน', error, ok });
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!(await bcrypt.compare(String(current), u.hash))) return view('รหัสผ่านปัจจุบันไม่ถูกต้อง');
  if (pw.length < 10 || pw.length > 100) return view('รหัสผ่านใหม่ต้องยาว 10 ตัวอักษรขึ้นไป');
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return view('รหัสผ่านใหม่ต้องมีทั้งตัวอักษรและตัวเลข');
  if (pw !== confirm) return view('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');
  db.prepare('UPDATE users SET hash=?, must_change=0 WHERE id=?').run(await bcrypt.hash(pw, 12), u.id);
  db.prepare('DELETE FROM sessions WHERE user_id=? AND id<>?').run(u.id, req.sidHash); // ออกจากระบบอุปกรณ์อื่น
  if (req.user.must_change) return res.redirect('/admin');
  view('', true);
});

// ---------- แดชบอร์ด ----------
r.get('/', requireAuth, (req, res) => {
  const shown = Object.fromEntries(Object.entries(entities).filter(([k]) => canManage(req.user, k)));
  const counts = {};
  for (const k of Object.keys(shown)) counts[k] = db.prepare(`SELECT COUNT(*) c FROM ${k}`).get().c;
  // ความพร้อมของหน้าเปิดเผยข้อมูล (OIT): หน้าที่ยังเป็นข้อความรอข้อมูล
  const oit = db.prepare("SELECT id, title, slug, body LIKE '<p>อยู่ระหว่างจัดเตรียมข้อมูล%' AS pending FROM pages WHERE slug LIKE 'oit-o%' ORDER BY sort, id").all();
  const upcoming = db.prepare("SELECT COUNT(*) c FROM events WHERE published=1 AND COALESCE(NULLIF(end_at,''), start_at) >= datetime('now')").get().c;
  res.render('admin/dashboard', { title: 'แดชบอร์ด', counts, entities: shown, oit, upcoming });
});

// ---------- ตั้งค่าเว็บไซต์ ----------
r.get('/settings', requireAuth, requireAdmin, (req, res) =>
  res.render('admin/settings', { title: 'ตั้งค่าเว็บไซต์', fields: settingsFields, values: getSettings(), errors: [], saved: req.query.saved === '1' }));

r.post('/settings', requireAuth, requireAdmin, upload.single('logo'), csrfCheck, (req, res) => {
  const current = getSettings();
  const { values, errors } = validate(settingsFields, req.body, current);
  let newImg = null;
  try { if (req.file) newImg = saveImage(req.file); } catch (e) { errors.push(e.message); }
  if (errors.length) {
    removeImage(newImg);
    return res.status(400).render('admin/settings', { title: 'ตั้งค่าเว็บไซต์', fields: settingsFields, values: { ...current, ...values }, errors, saved: false });
  }
  if (newImg) { removeImage(current.logo); values.logo = newImg; }
  else if (req.body.remove_logo) { removeImage(current.logo); values.logo = ''; }
  else delete values.logo;
  const up = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  for (const [k, v] of Object.entries(values)) up.run(k, String(v ?? ''));
  res.redirect('/admin/settings?saved=1');
});

// ---------- ปรับสีเว็บไซต์: สีประจำโรงเรียน 4 สี + สีแต่ละส่วน (มีตัวอย่างหน้าเว็บให้ดูขณะเลือก) ----------
const renderColors = (res, values, errors = [], saved = false, status = 200) => res.status(status)
  .render('admin/colors', { title: 'ปรับสีเว็บไซต์', fields: colorFields, values, errors, saved, defaults: SCHOOL_COLORS });
r.get('/colors', requireAuth, requireAdmin, (req, res) => renderColors(res, getSettings(), [], req.query.saved === '1'));
r.post('/colors', requireAuth, requireAdmin, csrfCheck, (req, res) => {
  const current = getSettings();
  const { values, errors } = validate(colorFields, req.body, current);
  if (errors.length) return renderColors(res, { ...current, ...values }, errors, false, 400);
  const up = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  for (const [k, v] of Object.entries(values)) up.run(k, String(v ?? ''));
  res.redirect('/admin/colors?saved=1');
});

// ---------- จัดเมนูและหน้าแรก (ลากวาง) ----------
// เมนู: ส่งโครงสร้างทั้งหมดมาครั้งเดียว (JSON) — รายการที่ไม่อยู่ในโครงสร้างใหม่คือรายการที่ถูกลบ
// rev = ลายนิ้วมือของเมนูตอนเปิดหน้า กันบันทึกทับเมื่อมีคนแก้เมนูจากที่อื่นระหว่างจัด
const menuRows = () => db.prepare('SELECT id, title, title_en, url, parent_id, sort, active FROM menu_items ORDER BY sort, id').all();
const menuRev = (rows) => sha256(JSON.stringify(rows)).slice(0, 20);
const MAX_MENU = 400;
function menuTree(rows) {
  const tops = rows.filter((x) => !x.parent_id).map((x) => ({ ...x, children: [] }));
  const byId = new Map(tops.map((t) => [t.id, t]));
  const lost = []; // เมนูย่อยที่ไม่มีเมนูแม่แล้ว (ไม่แสดงบนเว็บ) — ให้เห็นเป็นเมนูหลักที่ซ่อนอยู่
  for (const x of rows) if (x.parent_id) (byId.get(x.parent_id)?.children || lost).push(x);
  return [...tops, ...lost.map((x) => ({ ...x, active: 0, children: [] }))];
}
function parseMenu(json, ids) {
  let data;
  try { data = JSON.parse(json || ''); } catch { data = null; }
  if (!Array.isArray(data)) return { items: [], errors: ['ข้อมูลเมนูไม่ถูกต้อง โหลดหน้านี้ใหม่แล้วลองอีกครั้ง'] };
  const errors = [], used = new Set();
  let count = 0;
  const item = (x, depth) => {
    count++;
    const title = String(x?.title ?? '').replace(/\s+/g, ' ').trim();
    if (!title) errors.push('มีเมนูที่ยังไม่ได้ตั้งชื่อ');
    else if (title.length > 120) errors.push(`ชื่อเมนู "${title.slice(0, 40)}…" ยาวเกิน 120 ตัวอักษร`);
    let url = String(x?.url ?? '').trim();
    if (url) {
      const u = safeUrl(url);
      if (u === null) errors.push(`ลิงก์ของเมนู "${title}" ไม่ถูกต้อง (ใช้ /path หรือ https://…)`);
      else url = u;
    }
    let id = Number(x?.id);
    if (!Number.isInteger(id) || !ids.has(id) || used.has(id)) id = null; // รายการใหม่
    else used.add(id);
    const kids = Array.isArray(x?.children) ? x.children : [];
    if (depth > 0 && kids.length) errors.push(`เมนูย่อย "${title}" มีเมนูย่อยซ้อนอีกชั้นไม่ได้`);
    return { id, title, title_en: String(x?.title_en ?? '').trim().slice(0, 60), url, active: x?.active ? 1 : 0,
      children: depth === 0 && count <= MAX_MENU ? kids.slice(0, MAX_MENU).map((c) => item(c, 1)) : [] };
  };
  const items = data.slice(0, MAX_MENU).map((x) => item(x, 0));
  if (count > MAX_MENU) errors.push(`เมนูมากเกินไป (ไม่เกิน ${MAX_MENU} รายการ)`);
  return { items, errors: [...new Set(errors)] };
}
const renderArrange = (req, res, errors = [], status = 200) => {
  const rows = menuRows();
  res.status(status).render('admin/arrange', {
    title: 'จัดเมนูและหน้าแรก', menu: menuTree(rows), rev: menuRev(rows), errors, saved: String(req.query.saved || ''),
    home: homeLayout(getSettings().home_sections).map((x) => ({ ...x, label: HOME_SECTIONS[x.k].label })),
  });
};
r.get('/arrange', requireAuth, requireAdmin, (req, res) => renderArrange(req, res));
r.post('/arrange/menu', requireAuth, requireAdmin, csrfCheck, (req, res) => {
  const rows = menuRows();
  if (req.body.rev !== menuRev(rows)) return renderArrange(req, res, ['มีการแก้ไขเมนูจากที่อื่นระหว่างที่จัดอยู่ — หน้านี้แสดงเมนูล่าสุดแล้ว กรุณาจัดอีกครั้ง'], 409);
  const { items, errors } = parseMenu(req.body.data, new Set(rows.map((x) => x.id)));
  if (errors.length) return renderArrange(req, res, errors, 400);
  db.exec('BEGIN');
  try {
    const up = db.prepare('UPDATE menu_items SET title=?, title_en=?, url=?, parent_id=?, sort=?, active=? WHERE id=?');
    const ins = db.prepare('INSERT INTO menu_items (title, title_en, url, parent_id, sort, active) VALUES (?,?,?,?,?,?)');
    const keep = new Set();
    const put = (x, parent, sort) => {
      const id = x.id ?? Number(ins.run(x.title, x.title_en, x.url, parent, sort, x.active).lastInsertRowid);
      if (x.id) up.run(x.title, x.title_en, x.url, parent, sort, x.active, x.id);
      keep.add(id);
      return id;
    };
    items.forEach((t, i) => { const id = put(t, 0, (i + 1) * 10); t.children.forEach((c, j) => put(c, id, (j + 1) * 10)); });
    const del = db.prepare('DELETE FROM menu_items WHERE id=?');
    for (const x of rows) if (!keep.has(x.id)) del.run(x.id);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  res.redirect('/admin/arrange?saved=menu');
});
r.post('/arrange/home', requireAuth, requireAdmin, csrfCheck, (req, res) => {
  let list;
  try { list = JSON.parse(req.body.data || ''); } catch { list = null; }
  if (!Array.isArray(list)) return renderArrange(req, res, ['ข้อมูลลำดับหน้าแรกไม่ถูกต้อง'], 400);
  const layout = homeLayout(JSON.stringify(list.slice(0, 50).map((x) => ({ k: String(x?.k ?? ''), on: !!x?.on }))));
  db.prepare("INSERT INTO settings (key,value) VALUES ('home_sections',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(layout));
  res.redirect('/admin/arrange?saved=home');
});

// ---------- รูปจาก Google Drive: อ่านรายชื่อรูปใหม่ทันที (ปุ่ม "อัปเดตรูปจาก Drive" บนหน้าเว็บ) ----------
r.post('/gdrive/refresh', requireAuth, csrfCheck, async (req, res) => {
  const f = parseFolder(req.body.url);
  const back = backUrl(req.body.back) || '/admin';
  if (!f) return res.redirect(back);
  const r2 = await refreshDrive(f);
  res.redirect(`${back}${back.includes('?') ? '&' : '?'}drive=${r2.ok ? 'ok' : 'err'}`);
});

// ---------- ผู้ใช้งาน (เฉพาะผู้ดูแลระบบ) ----------
// บัญชีแยกรายคน · รหัสผ่านแรกเข้าสุ่มให้และแสดงครั้งเดียว เจ้าของบัญชีต้องตั้งรหัสใหม่เมื่อเข้าครั้งแรก
// แก้บัญชีของตัวเองที่หน้านี้ไม่ได้ (กันปิดหรือลดสิทธิ์ตัวเองจนไม่เหลือผู้ดูแลระบบ)
const USERNAME = /^[a-z0-9][a-z0-9._-]{2,29}$/;
const TEMP_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789'; // ไม่มีตัวที่อ่านสับสนง่าย (0 o 1 l i)
const tempPassword = () => Array.from({ length: 10 }, () => TEMP_CHARS[crypto.randomInt(TEMP_CHARS.length)]).join('');
const usersSql = db.prepare('SELECT id, username, name, role, active, must_change, last_login, locked_until FROM users ORDER BY role, username');
const otherAdmins = (id) => db.prepare("SELECT COUNT(*) c FROM users WHERE role='admin' AND active=1 AND id<>?").get(id).c;
const isLastAdmin = (u) => u.role === 'admin' && u.active && otherAdmins(u.id) === 0;

function renderUsers(req, res, { notice = '', error = '', issued = null } = {}) {
  res.status(error ? 400 : 200).render('admin/users', { title: 'ผู้ใช้งาน', users: usersSql.all(), notice, error, issued, now: Date.now() });
}
function targetUser(req, res, next) {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(Number(req.params.id) || 0);
  if (!u) return renderUsers(req, res, { error: 'ไม่พบบัญชีผู้ใช้' });
  if (u.id === req.user.id) return renderUsers(req, res, { error: 'แก้บัญชีของตัวเองที่หน้านี้ไม่ได้ — เปลี่ยนรหัสผ่านได้ที่เมนู “เปลี่ยนรหัสผ่าน”' });
  req.target = u;
  next();
}

r.get('/users', requireAuth, requireAdmin, (req, res) => renderUsers(req, res));
r.post('/users/add', requireAuth, requireAdmin, csrfCheck, async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const name = String(req.body.name || '').trim().slice(0, 80);
  const role = Object.hasOwn(ROLES, req.body.role) ? req.body.role : '';
  if (!USERNAME.test(username)) return renderUsers(req, res, { error: 'ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษตัวเล็ก ตัวเลข จุด หรือขีด ยาว 3–30 ตัว เช่น somchai.k' });
  if (!role) return renderUsers(req, res, { error: 'กรุณาเลือกสิทธิ์ของบัญชี' });
  if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) return renderUsers(req, res, { error: `มีชื่อผู้ใช้ ${username} อยู่แล้ว` });
  const password = tempPassword();
  db.prepare('INSERT INTO users (username, hash, must_change, role, name) VALUES (?,?,1,?,?)').run(username, await bcrypt.hash(password, 12), role, name);
  renderUsers(req, res, { issued: { username, password, added: true } });
});
r.post('/users/:id/role', requireAuth, requireAdmin, csrfCheck, targetUser, (req, res) => {
  const role = Object.hasOwn(ROLES, req.body.role) ? req.body.role : '';
  if (!role) return renderUsers(req, res, { error: 'สิทธิ์ไม่ถูกต้อง' });
  if (role !== 'admin' && isLastAdmin(req.target)) return renderUsers(req, res, { error: 'ต้องมีผู้ดูแลระบบที่ใช้งานได้อย่างน้อย 1 คน' });
  db.prepare('UPDATE users SET role=? WHERE id=?').run(role, req.target.id);
  renderUsers(req, res, { notice: `เปลี่ยนสิทธิ์ของ ${req.target.username} เป็น “${ROLES[role]}” แล้ว` });
});
r.post('/users/:id/active', requireAuth, requireAdmin, csrfCheck, targetUser, (req, res) => {
  const on = req.body.active === '1';
  if (!on && isLastAdmin(req.target)) return renderUsers(req, res, { error: 'ต้องมีผู้ดูแลระบบที่ใช้งานได้อย่างน้อย 1 คน' });
  db.prepare('UPDATE users SET active=? WHERE id=?').run(on ? 1 : 0, req.target.id);
  if (!on) db.prepare('DELETE FROM sessions WHERE user_id=?').run(req.target.id); // ออกจากระบบทุกเครื่องทันที
  renderUsers(req, res, { notice: on ? `เปิดใช้บัญชี ${req.target.username} แล้ว` : `ปิดบัญชี ${req.target.username} แล้ว — เข้าระบบไม่ได้จนกว่าจะเปิดอีกครั้ง` });
});
r.post('/users/:id/reset', requireAuth, requireAdmin, csrfCheck, targetUser, async (req, res) => {
  const password = tempPassword();
  db.prepare('UPDATE users SET hash=?, must_change=1, fails=0, locked_until=0 WHERE id=?').run(await bcrypt.hash(password, 12), req.target.id);
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(req.target.id);
  renderUsers(req, res, { issued: { username: req.target.username, password } });
});
r.post('/users/:id/delete', requireAuth, requireAdmin, csrfCheck, targetUser, (req, res) => {
  if (isLastAdmin(req.target)) return renderUsers(req, res, { error: 'ต้องมีผู้ดูแลระบบที่ใช้งานได้อย่างน้อย 1 คน' });
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(req.target.id);
  db.prepare('DELETE FROM users WHERE id=?').run(req.target.id);
  renderUsers(req, res, { notice: `ลบบัญชี ${req.target.username} แล้ว` });
});

// ---------- สำรองข้อมูล (เฉพาะผู้ดูแลระบบ) ----------
r.get('/backup', requireAuth, requireAdmin, (req, res) => res.render('admin/backup', { title: 'สำรองข้อมูล', sum: backupSummary() }));
r.post('/backup', requireAuth, requireAdmin, csrfCheck, async (req, res, next) => {
  const sum = backupSummary();
  if (sum.tooBig) return res.status(413).render('admin/message', { title: 'ไฟล์สำรองใหญ่เกินไป', msg: 'ข้อมูลรวมเกิน 3.5 GB — ใช้วิธีบีบอัดโฟลเดอร์ข้อมูลใน File Manager ของโฮสต์แทน' });
  const d = new Date(Date.now() + 7 * 3600e3); // วันที่ตามเวลาไทย ปี พ.ศ.
  const stamp = `${d.getUTCFullYear() + 543}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="bms-backup-${stamp}.zip"` });
  try {
    await writeBackup(res);
    res.end();
  } catch (e) {
    if (!res.headersSent) return next(e);
    console.error('สร้างไฟล์สำรองไม่สำเร็จ:', e);
    res.destroy(e); // ตัดการดาวน์โหลด เบราว์เซอร์จะแจ้งว่าไฟล์ไม่สมบูรณ์
  }
});

// ---------- CRUD ทั่วไป ----------
function getEntity(req, res, next) {
  const e = Object.hasOwn(entities, req.params.e) ? entities[req.params.e] : null;
  if (!e) return res.status(404).render('admin/message', { title: 'ไม่พบหน้า', msg: 'ไม่พบเมนูที่ต้องการ' });
  if (!canManage(req.user, req.params.e)) return forbidden(res);
  req.ent = e; req.table = req.params.e;
  res.locals.ent = e; res.locals.table = req.table;
  next();
}

function validate(fields, body, existing = {}) {
  const values = {}, errors = [];
  for (const f of fields) {
    if (!f.n || ['image', 'images', 'files'].includes(f.type)) continue; // หัวข้อกลุ่ม / ไฟล์ (จัดการแยกตอนบันทึก)
    let v = body[f.n];
    if (Array.isArray(v)) v = v[0];
    switch (f.type) {
      case 'checkbox': values[f.n] = body[f.n] ? 1 : 0; continue;
      case 'number': {
        v = String(v ?? '').trim();
        if (v === '' && !f.req) { values[f.n] = f.def ?? 0; continue; }
        if (!/^-?\d{1,9}$/.test(v)) { errors.push(`"${f.label}" ต้องเป็นตัวเลข`); continue; }
        values[f.n] = parseInt(v, 10); continue;
      }
      case 'richtext': v = cleanHtml(v); break;
      case 'url': {
        v = String(v ?? '').trim();
        if (v) { const s = safeUrl(v); if (s === null) { errors.push(`"${f.label}" ไม่ใช่ลิงก์ที่ถูกต้อง (ใช้ /path หรือ https://…)`); continue; } v = s; }
        break;
      }
      case 'slug': v = String(v ?? '').trim().toLowerCase();
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v)) { errors.push(`"${f.label}" ใช้ได้เฉพาะ a-z, 0-9 และขีดกลาง`); continue; }
        break;
      case 'color': v = String(v ?? '').trim();
        if (!/^#[0-9a-fA-F]{6}$/.test(v)) { errors.push(`"${f.label}" ต้องเป็นรหัสสี เช่น #14325e`); continue; }
        break;
      case 'time': v = String(v ?? '').trim();
        if (v && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) { errors.push(`"${f.label}" รูปแบบเวลาไม่ถูกต้อง (เช่น 09:30)`); continue; }
        break;
      case 'coloropt': // ติ๊ก "ใช้สีตามธีม" = ว่าง
        v = body[`${f.n}_auto`] ? '' : String(v ?? '').trim();
        if (v && !/^#[0-9a-fA-F]{6}$/.test(v)) { errors.push(`"${f.label}" ต้องเป็นรหัสสี เช่น #14325e`); continue; }
        values[f.n] = v.toLowerCase();
        continue;
      case 'date': v = String(v ?? '').trim();
        if (v && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)))) { errors.push(`"${f.label}" รูปแบบไม่ถูกต้อง`); continue; }
        break;
      case 'datetime': v = String(v ?? '').trim();
        if (v && !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}$/.test(v)) { errors.push(`"${f.label}" รูปแบบไม่ถูกต้อง`); continue; }
        if (v) {
          const d = new Date(v.replace(' ', 'T') + ':00+07:00'); // เวลาที่กรอกเป็นเวลาไทย เก็บเป็น UTC
          if (Number.isNaN(d.getTime())) { errors.push(`"${f.label}" รูปแบบไม่ถูกต้อง`); continue; }
          v = d.toISOString().slice(0, 19).replace('T', ' ');
        }
        else if (f.blank) v = '';
        else v = existing[f.n] || new Date().toISOString().slice(0, 19).replace('T', ' ');
        break;
      case 'gdrive': {
        v = String(v ?? '').trim();
        if (v) {
          const f2 = parseFolder(v);
          if (!f2) { errors.push(`"${f.label}" ต้องเป็นลิงก์โฟลเดอร์ Google Drive เช่น https://drive.google.com/drive/folders/… (ไม่ใช่ลิงก์ของไฟล์)`); continue; }
          v = folderLink(f2);
        }
        break;
      }
      case 'select': v = String(v ?? '');
        if (v && !f.options.includes(v)) { errors.push(`"${f.label}" ไม่ถูกต้อง`); continue; }
        break;
      default: v = String(v ?? '').replace(/\r\n/g, '\n').trim();
    }
    if (f.req && !v) { errors.push(`กรุณากรอก "${f.label}"`); continue; }
    if (f.max && v.length > f.max) { errors.push(`"${f.label}" ยาวเกิน ${f.max} ตัวอักษร`); continue; }
    values[f.n] = v;
  }
  return { values, errors };
}

r.get('/:e', requireAuth, getEntity, (req, res) => {
  const rows = db.prepare(`SELECT * FROM ${req.table} ORDER BY ${req.ent.order} LIMIT 500`).all();
  res.render('admin/list', { title: req.ent.title, rows, saved: req.query.saved, deleted: req.query.deleted });
});

// ปุ่มเพิ่ม/แก้ไขบนหน้าเว็บส่งหน้าเดิมมาเป็น back → บันทึกแล้วกลับไปหน้านั้น (รับเฉพาะหน้าในเว็บนี้)
const backUrl = (v) => (/^\/(p\/[a-z0-9-]+|awards(\/\d+)?|news\/\d+|gallery(\/\d+)?|journal(\/25\d\d-(0[1-9]|1[0-2]))?)$/.test(String(v || '')) ? String(v) : '');

// โฟลเดอร์ Google Drive ในฟอร์ม: อ่านรายชื่อรูปทันทีที่บันทึก — โฟลเดอร์ไม่ได้แชร์ / ไม่มีรูป แจ้งในฟอร์ม
// (ติดต่อ Google ไม่ได้ชั่วคราว บันทึกได้ตามปกติ ระบบจะลองอ่านใหม่เองตอนมีคนเปิดดู)
async function checkDrive(fields, values, existing) {
  const errors = [];
  for (const f of fields.filter((x) => x.type === 'gdrive' && values[x.n])) {
    if (existing?.[f.n] === values[f.n] && driveStatus(values[f.n])?.ok) continue; // ลิงก์เดิมที่อ่านได้แล้ว
    const r = await refreshDrive(parseFolder(values[f.n]));
    if (r.ok && !r.n) errors.push(`"${f.label}": ไม่พบไฟล์รูปในโฟลเดอร์นี้ (รูปต้องอยู่ในโฟลเดอร์นี้โดยตรง ไม่ใช่โฟลเดอร์ย่อย)`);
    else if (!r.ok && r.final) errors.push(`"${f.label}": ${r.error}`);
  }
  return errors;
}

r.get('/:e/new', requireAuth, getEntity, (req, res) => {
  if (req.ent.readonly) return res.redirect(`/admin/${req.table}`);
  const item = {};
  for (const f of req.ent.fields) {
    if (f.def !== undefined) item[f.n] = typeof f.def === 'function' ? f.def() : f.def;
    const q = req.query[f.n]; // เช่น ?page_id=17 จากปุ่ม "เพิ่มบุคลากร" ของหน้ากลุ่มสาระ
    if (f.type === 'select' && typeof q === 'string' && f.options.includes(q)) item[f.n] = q;
    if (f.type === 'date' && typeof q === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(q)) item[f.n] = q;
  }
  item.created_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
  res.render('admin/form', { title: `เพิ่ม${req.ent.singular}`, item, errors: [], back: backUrl(req.query.back) });
});

r.get('/:e/:id', requireAuth, getEntity, (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return next();
  const item = db.prepare(`SELECT * FROM ${req.table} WHERE id=?`).get(req.params.id);
  if (!item) return res.status(404).render('admin/message', { title: 'ไม่พบรายการ', msg: 'ไม่พบรายการที่ต้องการ' });
  res.render('admin/form', { title: req.ent.readonly ? `ดู${req.ent.singular}` : `แก้ไข${req.ent.singular}`, item, errors: [], back: backUrl(req.query.back) });
});

r.post('/:e/save', requireAuth, getEntity, uploadForm, csrfCheck, async (req, res) => {
  if (req.ent.readonly) return res.redirect(`/admin/${req.table}`);
  const id = /^\d+$/.test(req.body.id || '') ? Number(req.body.id) : null;
  const existing = id ? db.prepare(`SELECT * FROM ${req.table} WHERE id=?`).get(id) : null;
  if (id && !existing) return res.status(404).render('admin/message', { title: 'ไม่พบรายการ', msg: 'ไม่พบรายการที่ต้องการ' });

  const { values, errors } = validate(req.ent.fields, req.body, existing || {});
  if (!errors.length && req.ent.check) errors.push(...req.ent.check(values, existing, id));
  if (!errors.length) errors.push(...await checkDrive(req.ent.fields, values, existing));
  const has = (t) => req.ent.fields.some((f) => f.type === t);
  const up = req.files || {};
  const saved = { images: [], files: [] }; // ไฟล์ใหม่ — บันทึกไม่สำเร็จจะลบทิ้ง
  let newImg = null;
  const keep = (v) => (Array.isArray(v) ? v : v ? [v] : []).map(String);
  try {
    if (!errors.length) {
      if (has('image') && up.image?.[0]) {
        if (up.image[0].size > IMG_BYTES) throw new Error('รูปภาพต้องมีขนาดไม่เกิน 5 MB');
        newImg = saveImage(up.image[0]);
      }
      if (has('images')) for (const f of up.images || []) {
        if (f.size > IMG_BYTES) throw new Error(`รูป "${f.originalname}" ใหญ่เกิน 5 MB`);
        saved.images.push(saveImage(f));
      }
      if (has('files')) for (const f of up.files || []) saved.files.push(saveDoc(f));
    }
  } catch (e) { errors.push(e.message); }
  // รูปประกอบ/เอกสาร: ของเดิม − ที่ติ๊กลบ + ที่อัปโหลดใหม่
  const dropPics = keep(req.body.remove_images), dropDocs = keep(req.body.remove_files);
  if (has('images')) {
    const list = [...pics(existing?.images).filter((x) => !dropPics.includes(x)), ...saved.images];
    if (list.length > MAX_IMAGES) errors.push(`รูปประกอบได้ไม่เกิน ${MAX_IMAGES} รูป (ตอนนี้ ${list.length} รูป) — ติ๊กลบรูปเดิมบางรูปก่อน`);
    values.images = JSON.stringify(list);
  }
  if (has('files')) {
    const list = [...docs(existing?.files).filter((x) => !dropDocs.includes(x.f)).map(({ n, f }) => ({ n, f })), ...saved.files];
    if (list.length > MAX_FILES) errors.push(`เอกสารแนบได้ไม่เกิน ${MAX_FILES} ไฟล์`);
    values.files = JSON.stringify(list);
  }

  const rerender = (status = 400) => {
    removeImage(newImg);
    saved.images.forEach(removeImage);
    saved.files.forEach((x) => removeDoc(x.f));
    const item = { ...(existing || {}), ...values, id };
    if (has('images')) item.images = existing?.images || '[]';
    if (has('files')) item.files = existing?.files || '[]';
    return res.status(status).render('admin/form', {
      title: id ? `แก้ไข${req.ent.singular}` : `เพิ่ม${req.ent.singular}`, item, errors, back: backUrl(req.body.back) });
  };
  if (errors.length) return rerender();

  if (has('image')) {
    if (newImg) values.image = newImg;
    else if (req.body.remove_image) values.image = null;
  }
  const cols = Object.keys(values);
  let rowId = id;
  try {
    if (id) db.prepare(`UPDATE ${req.table} SET ${cols.map((c) => `${c}=?`).join(',')} WHERE id=?`).run(...cols.map((c) => values[c]), id);
    else rowId = Number(db.prepare(`INSERT INTO ${req.table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map((c) => values[c])).lastInsertRowid);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) { errors.push('ชื่อในลิงก์ (slug) นี้ถูกใช้แล้ว'); return rerender(); }
    throw e;
  }
  // บันทึกสำเร็จแล้วจึงลบไฟล์เดิมที่ถูกแทน/ติ๊กลบ
  if (has('image') && (newImg || req.body.remove_image)) removeImage(existing?.image);
  dropPics.filter((x) => pics(existing?.images).includes(x)).forEach(removeImage);
  docs(existing?.files).filter((x) => dropDocs.includes(x.f)).forEach((x) => removeDoc(x.f));
  req.ent.afterSave?.(rowId, values);
  const back = backUrl(req.body.back);
  res.redirect(back ? `${back}${req.ent.anchor ? `#${req.ent.anchor}-${rowId}` : ''}` : `/admin/${req.table}?saved=1`);
});

r.post('/:e/:id/delete', requireAuth, getEntity, csrfCheck, (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.redirect(`/admin/${req.table}`);
  const item = db.prepare(`SELECT * FROM ${req.table} WHERE id=?`).get(req.params.id);
  if (item) {
    db.prepare(`DELETE FROM ${req.table} WHERE id=?`).run(item.id);
    req.ent.onDelete?.(item);
    removeImage(item.image);
    pics(item.images).forEach(removeImage);
    docs(item.files).forEach((x) => removeDoc(x.f));
  }
  res.redirect(backUrl(req.body.back) || `/admin/${req.table}?deleted=1`);
});

// จัดการข้อผิดพลาดจาก multer (ไฟล์ใหญ่เกิน ฯลฯ)
r.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).render('admin/message', { title: 'อัปโหลดไม่สำเร็จ', msg: err.code === 'LIMIT_FILE_SIZE' ? 'ไฟล์มีขนาดใหญ่เกินกำหนด (รูป 5 MB · เอกสาร 10 MB)'
      : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE' ? `อัปโหลดได้ครั้งละไม่เกิน ${MAX_IMAGES} รูป และเอกสาร ${MAX_FILES} ไฟล์` : 'อัปโหลดไม่สำเร็จ' });
  }
  next(err);
});

export default r;
