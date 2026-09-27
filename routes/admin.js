import { Router } from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { db, getSettings } from '../lib/db.js';
import { entities, settingsFields } from '../lib/entities.js';
import {
  token, sha256, safeEqual, cookieOpts, cleanHtml, saveImage, removeImage, safeUrl,
} from '../lib/helpers.js';

const r = Router();
const SESSION_MS = 2 * 60 * 60 * 1000; // 2 ชั่วโมง
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 40 } });
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);

r.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.locals.entities = entities;
  next();
});

// ---------- เซสชัน ----------
function loadSession(req, res, next) {
  req.user = null;
  const sid = req.cookies.sid;
  if (sid && /^[\w-]{40,}$/.test(sid)) {
    const row = db.prepare(
      'SELECT s.id, s.csrf, s.expires, u.id uid, u.username, u.must_change FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=?')
      .get(sha256(sid));
    if (row && row.expires > Date.now()) {
      req.user = { id: row.uid, username: row.username, must_change: row.must_change };
      req.csrf = row.csrf;
      req.sidHash = row.id;
    } else if (row) db.prepare('DELETE FROM sessions WHERE id=?').run(row.id);
  }
  res.locals.user = req.user;
  res.locals.csrf = req.csrf || '';
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
  db.prepare('UPDATE users SET fails=0, locked_until=0 WHERE id=?').run(u.id);
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
  const counts = {};
  for (const k of Object.keys(entities)) counts[k] = db.prepare(`SELECT COUNT(*) c FROM ${k}`).get().c;
  res.render('admin/dashboard', { title: 'แดชบอร์ด', counts, entities });
});

// ---------- ตั้งค่าเว็บไซต์ ----------
r.get('/settings', requireAuth, (req, res) =>
  res.render('admin/settings', { title: 'ตั้งค่าเว็บไซต์', fields: settingsFields, values: getSettings(), errors: [], saved: req.query.saved === '1' }));

r.post('/settings', requireAuth, upload.single('logo'), csrfCheck, (req, res) => {
  const current = getSettings();
  const { values, errors } = validate(settingsFields.filter((f) => f.n), req.body, current);
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

// ---------- CRUD ทั่วไป ----------
function getEntity(req, res, next) {
  const e = Object.hasOwn(entities, req.params.e) ? entities[req.params.e] : null;
  if (!e) return res.status(404).render('admin/message', { title: 'ไม่พบหน้า', msg: 'ไม่พบเมนูที่ต้องการ' });
  req.ent = e; req.table = req.params.e;
  res.locals.ent = e; res.locals.table = req.table;
  next();
}

function validate(fields, body, existing = {}) {
  const values = {}, errors = [];
  for (const f of fields) {
    if (f.type === 'image') continue;
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
      case 'datetime': v = String(v ?? '').trim();
        if (v && !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}$/.test(v)) { errors.push(`"${f.label}" รูปแบบไม่ถูกต้อง`); continue; }
        if (v) { const d = new Date(v.replace(' ', 'T') + ':00+07:00'); v = d.toISOString().slice(0, 19).replace('T', ' '); }
        else v = existing[f.n] || new Date().toISOString().slice(0, 19).replace('T', ' ');
        break;
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

r.get('/:e/new', requireAuth, getEntity, (req, res) => {
  if (req.ent.readonly) return res.redirect(`/admin/${req.table}`);
  const item = {};
  for (const f of req.ent.fields) if (f.def !== undefined) item[f.n] = f.def;
  item.created_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
  res.render('admin/form', { title: `เพิ่ม${req.ent.singular}`, item, errors: [] });
});

r.get('/:e/:id', requireAuth, getEntity, (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return next();
  const item = db.prepare(`SELECT * FROM ${req.table} WHERE id=?`).get(req.params.id);
  if (!item) return res.status(404).render('admin/message', { title: 'ไม่พบรายการ', msg: 'ไม่พบรายการที่ต้องการ' });
  res.render('admin/form', { title: req.ent.readonly ? `ดู${req.ent.singular}` : `แก้ไข${req.ent.singular}`, item, errors: [] });
});

r.post('/:e/save', requireAuth, getEntity, upload.single('image'), csrfCheck, (req, res) => {
  if (req.ent.readonly) return res.redirect(`/admin/${req.table}`);
  const id = /^\d+$/.test(req.body.id || '') ? Number(req.body.id) : null;
  const existing = id ? db.prepare(`SELECT * FROM ${req.table} WHERE id=?`).get(id) : null;
  if (id && !existing) return res.status(404).render('admin/message', { title: 'ไม่พบรายการ', msg: 'ไม่พบรายการที่ต้องการ' });

  const { values, errors } = validate(req.ent.fields, req.body, existing || {});
  const hasImage = req.ent.fields.some((f) => f.type === 'image');
  let newImg = null;
  try { if (req.file && hasImage) newImg = saveImage(req.file); } catch (e) { errors.push(e.message); }

  const rerender = (status = 400) => {
    removeImage(newImg);
    return res.status(status).render('admin/form', { title: id ? `แก้ไข${req.ent.singular}` : `เพิ่ม${req.ent.singular}`, item: { ...(existing || {}), ...values, id }, errors });
  };
  if (errors.length) return rerender();

  if (hasImage) {
    if (newImg) { removeImage(existing?.image); values.image = newImg; }
    else if (req.body.remove_image) { removeImage(existing?.image); values.image = null; }
  }
  const cols = Object.keys(values);
  try {
    if (id) db.prepare(`UPDATE ${req.table} SET ${cols.map((c) => `${c}=?`).join(',')} WHERE id=?`).run(...cols.map((c) => values[c]), id);
    else db.prepare(`INSERT INTO ${req.table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map((c) => values[c]));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) { errors.push('ชื่อในลิงก์ (slug) นี้ถูกใช้แล้ว'); return rerender(); }
    throw e;
  }
  res.redirect(`/admin/${req.table}?saved=1`);
});

r.post('/:e/:id/delete', requireAuth, getEntity, csrfCheck, (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.redirect(`/admin/${req.table}`);
  const item = db.prepare(`SELECT * FROM ${req.table} WHERE id=?`).get(req.params.id);
  if (item) {
    db.prepare(`DELETE FROM ${req.table} WHERE id=?`).run(item.id);
    removeImage(item.image);
  }
  res.redirect(`/admin/${req.table}?deleted=1`);
});

// จัดการข้อผิดพลาดจาก multer (ไฟล์ใหญ่เกิน ฯลฯ)
r.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).render('admin/message', { title: 'อัปโหลดไม่สำเร็จ', msg: err.code === 'LIMIT_FILE_SIZE' ? 'ไฟล์มีขนาดใหญ่เกิน 5 MB' : 'อัปโหลดไม่สำเร็จ' });
  }
  next(err);
});

export default r;
