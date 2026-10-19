import { db } from './db.js';
import { sha256 } from './helpers.js';

// เซสชันผู้ดูแลจากคุกกี้ sid — ใช้ในหลังบ้าน และใช้แสดงปุ่มเพิ่ม/แก้ไขบนหน้าเว็บให้ผู้ที่เข้าสู่ระบบอยู่
export function sessionOf(req) {
  const sid = req.cookies.sid;
  if (!sid || !/^[\w-]{40,}$/.test(sid)) return null;
  const row = db.prepare(
    'SELECT s.id, s.csrf, s.expires, u.id uid, u.username, u.must_change FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=?')
    .get(sha256(sid));
  if (!row) return null;
  if (row.expires > Date.now()) return row;
  db.prepare('DELETE FROM sessions WHERE id=?').run(row.id);
  return null;
}
