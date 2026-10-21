// ไฟล์สำรองข้อมูลเว็บ (.zip) จากหลังบ้าน: ฐานข้อมูล + ไฟล์ที่อัปโหลด — ไม่ต้องหยุดเว็บ
// ฐานข้อมูลใช้สำเนาจาก VACUUM INTO (ได้ข้อมูลครบ ณ จุดเดียว แม้มีคนกำลังบันทึก) และตัดเซสชันที่ใช้งานอยู่ออก
// ไม่รวม uploads/wp (ไฟล์ของ WordPress เดิม ขนาดใหญ่ สำรองแยก) และ uploads/gdrive (สำเนารูปจาก Drive ระบบดึงใหม่เอง)
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { db, DATA_DIR, UPLOAD_DIR, getSettings } from './db.js';
import { writeZip, ZIP_MAX_BYTES, ZIP_MAX_FILES } from './zip.js';

const SKIP = new Set(['wp', 'gdrive']);
const ROOT = 'bms-data'; // แตกไฟล์ที่โฟลเดอร์บนสุดของโฮสต์แล้วได้โฟลเดอร์ bms-data พร้อมใช้

// ไฟล์ใน uploads ที่จะใส่ในไฟล์สำรอง (ข้ามทางลัดและไฟล์ที่กำลังดาวน์โหลดค้างอยู่)
export function uploadFiles() {
  const out = [];
  const walk = (dir, rel) => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, d.name);
      const r = rel ? `${rel}/${d.name}` : d.name;
      if (d.isDirectory()) { if (rel || !SKIP.has(d.name)) walk(p, r); continue; }
      if (!d.isFile() || d.name.includes('.part-')) continue;
      const st = fs.statSync(p);
      out.push({ name: `${ROOT}/uploads/${r}`, file: p, size: st.size, mtime: st.mtime });
    }
  };
  walk(UPLOAD_DIR, '');
  return out;
}

export function backupSummary() {
  const files = uploadFiles();
  let dbBytes = 0;
  try { dbBytes = fs.statSync(path.join(DATA_DIR, 'school.db')).size; } catch { /* ยังไม่มีฐานข้อมูล */ }
  const upBytes = files.reduce((n, f) => n + f.size, 0);
  return { files: files.length, upBytes, dbBytes, tooBig: dbBytes + upBytes > ZIP_MAX_BYTES || files.length > ZIP_MAX_FILES };
}

const readme = (when) => `ไฟล์สำรองข้อมูลเว็บไซต์ ${getSettings().school_name || ''} — สร้างเมื่อ ${when}

ข้างในมี
  ${ROOT}/data/school.db   ฐานข้อมูล: ข่าว หน้าเว็บ ผลงาน บุคลากร ผู้ใช้หลังบ้าน การตั้งค่า
  ${ROOT}/uploads/         รูปและเอกสารที่อัปโหลดจากหลังบ้าน
ไม่รวม: ไฟล์ของ WordPress เดิม (uploads/wp) และสำเนารูปจาก Google Drive (uploads/gdrive ระบบดึงใหม่เอง)

วิธีกู้คืนบนโฮสต์ DirectAdmin
  1) Setup Node.js App → แอป bms-web → STOP APP
  2) File Manager → โฟลเดอร์บนสุด → เปลี่ยนชื่อโฟลเดอร์ bms-data เดิมเป็น bms-data-old
  3) อัปโหลดไฟล์ .zip นี้ไว้ที่โฟลเดอร์บนสุด → Extract → จะได้โฟลเดอร์ bms-data
  4) START APP แล้วตรวจหน้าเว็บ — ใช้ได้ปกติแล้วค่อยลบ bms-data-old

ไฟล์นี้มีรหัสผ่านหลังบ้าน (แบบเข้ารหัส) และข้อความจากผู้ติดต่อ — เก็บในที่ที่ไม่เปิดให้ทุกคนเข้าถึง
`;

export async function writeBackup(out) {
  const tmp = path.join(DATA_DIR, `backup-${process.pid}-${Date.now()}.db`);
  try {
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    const snap = new DatabaseSync(tmp);
    snap.exec('PRAGMA journal_mode = DELETE; DELETE FROM sessions; VACUUM;');
    snap.close();
    const when = new Date().toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Bangkok' });
    await writeZip(out, [
      { name: `${ROOT}/อ่านก่อน-วิธีกู้คืน.txt`, data: Buffer.from(readme(when), 'utf8') },
      { name: `${ROOT}/data/school.db`, file: tmp },
      ...uploadFiles(),
    ]);
  } finally {
    for (const f of [tmp, `${tmp}-wal`, `${tmp}-shm`, `${tmp}-journal`]) fs.rmSync(f, { force: true });
  }
}
