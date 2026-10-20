import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

export const ROOT = path.resolve(import.meta.dirname, '..');
const STORE = process.env.DATA_PATH ? path.resolve(process.env.DATA_PATH) : ROOT; // ชี้ไปยัง persistent disk บนโฮสต์
export const DATA_DIR = path.join(STORE, 'data');
export const UPLOAD_DIR = path.join(STORE, 'uploads');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'school.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, hash TEXT NOT NULL,
  must_change INTEGER DEFAULT 0, fails INTEGER DEFAULT 0, locked_until INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, category TEXT, excerpt TEXT, body TEXT,
  image TEXT, published INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS slides (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, subtitle TEXT, image TEXT, link TEXT,
  sort INTEGER DEFAULT 0, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS links (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, icon TEXT, url TEXT, sort INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, menu_group TEXT,
  body TEXT, in_menu INTEGER DEFAULT 1, sort INTEGER DEFAULT 0, published INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS stats (
  id INTEGER PRIMARY KEY, label TEXT NOT NULL, value INTEGER DEFAULT 0, sort INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS gallery (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, image TEXT, sort INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS legacy_urls (path TEXT PRIMARY KEY, target TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY, name TEXT, email TEXT, phone TEXT, message TEXT,
  created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, title_en TEXT, url TEXT, parent_id INTEGER DEFAULT 0,
  sort INTEGER DEFAULT 0, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, start_at TEXT NOT NULL, end_at TEXT, all_day INTEGER DEFAULT 0,
  location TEXT, detail TEXT, link TEXT, published INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, subtitle TEXT, icon TEXT, url TEXT NOT NULL,
  audience TEXT, sort INTEGER DEFAULT 0, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS programs (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, title_en TEXT, summary TEXT, image TEXT, link TEXT, sort INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS highlights (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, subtitle TEXT, icon TEXT, sort INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS visits (day TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, position TEXT, duty TEXT, page_id INTEGER NOT NULL,
  is_head INTEGER DEFAULT 0, image TEXT, sort INTEGER DEFAULT 0, active INTEGER DEFAULT 1);
CREATE INDEX IF NOT EXISTS staff_page ON staff (page_id);
CREATE TABLE IF NOT EXISTS ext_links (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL, sort INTEGER DEFAULT 0, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS awards (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, owner TEXT NOT NULL DEFAULT 'student', people TEXT, level TEXT,
  award_date TEXT, detail TEXT, link TEXT, image TEXT, published INTEGER DEFAULT 1);
CREATE INDEX IF NOT EXISTS awards_owner ON awards (owner, award_date);
CREATE TABLE IF NOT EXISTS popups (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, image TEXT, body TEXT, link TEXT, link_text TEXT,
  start_at TEXT, end_at TEXT, frequency TEXT DEFAULT 'session', active INTEGER DEFAULT 1, sort INTEGER DEFAULT 0);
-- รูปจาก Google Drive: โฟลเดอร์ที่ใช้บนเว็บ และรายชื่อรูปที่อ่านมาล่าสุด
CREATE TABLE IF NOT EXISTS gdrive_folders (
  id TEXT PRIMARY KEY, rkey TEXT, fetched_at INTEGER DEFAULT 0, ok INTEGER DEFAULT 0, error TEXT, n INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS gdrive_photos (
  folder_id TEXT NOT NULL, file_id TEXT NOT NULL, name TEXT, taken TEXT, sort INTEGER DEFAULT 0, PRIMARY KEY (folder_id, file_id));
CREATE INDEX IF NOT EXISTS gdrive_photos_file ON gdrive_photos (file_id);
CREATE TABLE IF NOT EXISTS albums (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, album_date TEXT, drive_url TEXT, image TEXT, detail TEXT,
  published INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS albums_date ON albums (album_date);
-- วารสารรายเดือน (E-book): บทความที่กรอกระหว่างเดือน → รวมเป็นเล่มของเดือนนั้น
CREATE TABLE IF NOT EXISTS journal_entries (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, section TEXT NOT NULL DEFAULT 'activity', entry_date TEXT NOT NULL,
  author TEXT, layout TEXT NOT NULL DEFAULT 'top', image TEXT, images TEXT, body TEXT, drive_url TEXT, link TEXT,
  sort INTEGER DEFAULT 0, published INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS journal_entries_date ON journal_entries (entry_date);
CREATE TABLE IF NOT EXISTS journal_issues (
  id INTEGER PRIMARY KEY, ym TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'auto', number INTEGER, volume INTEGER,
  image TEXT, editorial TEXT, credits TEXT, link TEXT);
`);

// เพิ่มคอลัมน์ใหม่ให้ฐานข้อมูลที่สร้างไว้ก่อนแล้ว (รันทุกครั้งได้ เพิ่มเฉพาะที่ยังไม่มี)
function addColumn(table, col, type) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
}
addColumn('links', 'subtitle', 'TEXT');
addColumn('stats', 'label_en', 'TEXT');
addColumn('stats', 'suffix', 'TEXT');
addColumn('stats', 'icon', 'TEXT');
addColumn('pages', 'layout', 'TEXT');     // page (หรือว่าง) = เนื้อหาปกติ, people = ทำเนียบบุคคล, people-index = หน้ารวมทำเนียบ
addColumn('pages', 'head_label', 'TEXT'); // ป้ายของคนบนสุดในหน้าทำเนียบ เช่น หัวหน้ากลุ่มสาระ
addColumn('pages', 'head_last', 'INTEGER DEFAULT 0'); // 1 = เรียงตามลำดับเวลา คนปัจจุบันอยู่ท้ายสุด (ทำเนียบผู้บริหาร)
addColumn('news', 'drive_url', 'TEXT');   // โฟลเดอร์ Google Drive ของภาพกิจกรรมในข่าว
addColumn('journal_entries', 'layout', "TEXT NOT NULL DEFAULT 'top'");
addColumn('journal_entries', 'images', 'TEXT');
addColumn('awards', 'award_time', 'TEXT');  // เวลา (ไม่บังคับ) เช่น เวลาประกาศผล
addColumn('awards', 'images', 'TEXT');      // รูปเพิ่มเติม (JSON)
addColumn('awards', 'files', 'TEXT');       // เอกสารแนบ เช่น เกียรติบัตร (JSON)
addColumn('awards', 'drive_url', 'TEXT');   // โฟลเดอร์ Google Drive (ถ้ามี)

export const DEFAULT_SETTINGS = {
  school_name: 'โรงเรียนวิทยาปัญญา',
  school_name_en: 'Wittayapanya School',
  tagline: 'เรียนดี มีคุณธรรม นำสู่สากล',
  journal_name: 'วารสารโรงเรียน',
  primary: '#14325e',
  accent: '#c9a227',
  about_title: 'ก้าวต่อไปอย่างมั่นคง บนรากฐานแห่งภูมิปัญญา',
  about_text:
    'โรงเรียนวิทยาปัญญาก่อตั้งขึ้นด้วยปณิธานที่จะบ่มเพาะเยาวชนให้เป็นทั้งคนเก่งและคนดี ' +
    'เราจัดการเรียนรู้ที่เน้นผู้เรียนเป็นสำคัญ ผสานเทคโนโลยีและทักษะแห่งอนาคต ' +
    'ภายใต้บรรยากาศที่อบอุ่นและปลอดภัย เพื่อให้นักเรียนทุกคนค้นพบศักยภาพของตนเอง',
  admission_title: 'เปิดรับสมัครนักเรียนใหม่ ปีการศึกษา 2569',
  admission_text: 'ระดับชั้นอนุบาล – มัธยมศึกษาปีที่ 6 สมัครง่าย ๆ ผ่านระบบออนไลน์ หรือติดต่อฝ่ายทะเบียน',
  admission_link: '/p/admission',
  phone: '02-123-4567',
  email: 'info@school.ac.th',
  address: '99 ถนนการศึกษา แขวงบางรัก เขตบางรัก กรุงเทพมหานคร 10500',
  hours: 'จันทร์ – ศุกร์ 08:00 – 16:30 น.',
  facebook: '',
  footer_text: 'สงวนลิขสิทธิ์',
  logo: '',
  agency: '',
  announce_on: '0',
  announce_text: '',
  announce_link: '',
  line_url: '',
  youtube: '',
  map_query: '',
  tour_url: '',
};

const insSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insSetting.run(k, v);

export function getSettings() {
  const out = {};
  for (const r of db.prepare('SELECT key, value FROM settings').all()) out[r.key] = r.value;
  return out;
}

// ---------- ข้อมูลตัวอย่าง (สร้างครั้งแรกเท่านั้น) ----------
const count = (t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;

if (count('users') === 0) {
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  db.prepare('INSERT INTO users (username, hash, must_change) VALUES (?,?,?)').run(
    'admin', bcrypt.hashSync(password, 12), process.env.ADMIN_PASSWORD ? 0 : 1);
  console.log('\n==============================================');
  console.log(' สร้างผู้ดูแลระบบครั้งแรก');
  console.log('   ชื่อผู้ใช้ : admin');
  console.log(`   รหัสผ่าน  : ${password}`);
  console.log(' (ระบบจะบังคับให้เปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งแรก)');
  console.log('==============================================\n');
}

if (count('news') === 0) {
  const n = db.prepare('INSERT INTO news (title, category, excerpt, body, created_at) VALUES (?,?,?,?,?)');
  const body = '<p>โรงเรียนวิทยาปัญญาขอเชิญผู้ปกครองและนักเรียนร่วมกิจกรรมตามกำหนดการ ' +
    'โดยมีรายละเอียดดังนี้</p><h3>รายละเอียดกิจกรรม</h3><ul><li>ลงทะเบียนเวลา 08.00 น.</li>' +
    '<li>พิธีเปิดเวลา 09.00 น.</li><li>กิจกรรมภาคบ่ายเวลา 13.00 น.</li></ul>' +
    '<p>สอบถามข้อมูลเพิ่มเติมได้ที่ฝ่ายประชาสัมพันธ์ของโรงเรียน</p>';
  [
    ['เปิดรับสมัครนักเรียนใหม่ ปีการศึกษา 2569', 'รับสมัคร', 'เปิดรับสมัครนักเรียนระดับอนุบาลถึงมัธยมศึกษาตอนปลาย ตั้งแต่วันนี้เป็นต้นไป', '2026-09-15'],
    ['นักเรียนโรงเรียนวิทยาปัญญาคว้ารางวัลชนะเลิศ โครงงานวิทยาศาสตร์ระดับประเทศ', 'วิชาการ', 'ทีมนักเรียนชั้นมัธยมศึกษาปีที่ 5 คว้ารางวัลชนะเลิศจากการแข่งขันโครงงานวิทยาศาสตร์', '2026-09-12'],
    ['กิจกรรมวันไหว้ครู ประจำปีการศึกษา 2569', 'กิจกรรม', 'นักเรียนทุกระดับชั้นร่วมพิธีไหว้ครู แสดงความกตัญญูต่อคณาจารย์', '2026-09-08'],
    ['ประกาศ: ตารางสอบกลางภาคเรียนที่ 2', 'ประกาศ', 'แจ้งตารางสอบกลางภาคเรียนที่ 2 สำหรับนักเรียนทุกระดับชั้น', '2026-09-05'],
    ['โครงการค่ายภาษาอังกฤษ English Camp 2026', 'กิจกรรม', 'ค่ายภาษาอังกฤษร่วมกับครูชาวต่างชาติ พัฒนาทักษะการสื่อสารอย่างสนุกสนาน', '2026-09-01'],
    ['ห้องเรียนอัจฉริยะแห่งใหม่ เปิดใช้งานแล้ว', 'ประชาสัมพันธ์', 'โรงเรียนเปิดใช้ห้องเรียนอัจฉริยะพร้อมอุปกรณ์การเรียนรู้ยุคใหม่', '2026-08-28'],
    ['ประกาศผลการคัดเลือกนักเรียนเข้าร่วมโครงการทุนการศึกษา', 'ประกาศ', 'ประกาศรายชื่อนักเรียนที่ได้รับทุนการศึกษาประจำปี', '2026-08-20'],
    ['ทัศนศึกษาพิพิธภัณฑ์วิทยาศาสตร์แห่งชาติ', 'กิจกรรม', 'นักเรียนชั้นประถมศึกษาปีที่ 4–6 ร่วมเรียนรู้นอกห้องเรียน', '2026-08-15'],
  ].forEach(([t, c, e, d]) => n.run(t, c, e, body, d + ' 09:00:00'));
}

if (count('slides') === 0) {
  const s = db.prepare('INSERT INTO slides (title, subtitle, link, sort) VALUES (?,?,?,?)');
  s.run('เรียนดี มีคุณธรรม นำสู่สากล', 'สร้างเยาวชนคุณภาพ พร้อมก้าวสู่โลกอนาคตด้วยหลักสูตรที่ทันสมัยและครูผู้เชี่ยวชาญ', '/p/about', 1);
  s.run('เปิดรับสมัครนักเรียนใหม่ 2569', 'สมัครออนไลน์ได้ตั้งแต่วันนี้ ระดับอนุบาล – มัธยมศึกษาปีที่ 6', '/p/admission', 2);
  s.run('ห้องเรียนแห่งอนาคต', 'เรียนรู้ด้วยเทคโนโลยี STEM, ภาษา และศิลปะ เพื่อค้นพบศักยภาพของตนเอง', '/news', 3);
}

if (count('links') === 0) {
  const l = db.prepare('INSERT INTO links (title, icon, url, sort) VALUES (?,?,?,?)');
  [['สมัครเรียน', 'graduation', '/p/admission'], ['หลักสูตร', 'book', '/p/curriculum'],
   ['ปฏิทินการศึกษา', 'calendar', '/news?cat=ประกาศ'], ['บุคลากร', 'users', '/p/staff'],
   ['ดาวน์โหลดเอกสาร', 'file', '/p/downloads'], ['ติดต่อเรา', 'phone', '/contact']]
    .forEach(([t, i, u], k) => l.run(t, i, u, k + 1));
}

if (count('stats') === 0) {
  const s = db.prepare('INSERT INTO stats (label, value, sort) VALUES (?,?,?)');
  [['นักเรียน', 2400], ['คุณครูและบุคลากร', 160], ['ปีแห่งการก่อตั้ง', 45], ['รางวัลระดับชาติ', 320]]
    .forEach(([l, v], i) => s.run(l, v, i + 1));
}

if (count('gallery') === 0) {
  const g = db.prepare('INSERT INTO gallery (title, sort) VALUES (?,?)');
  ['พิธีไหว้ครู', 'กีฬาสี', 'ห้องปฏิบัติการวิทยาศาสตร์', 'ดนตรีและศิลปะ', 'ค่ายภาษา', 'วันสำเร็จการศึกษา']
    .forEach((t, i) => g.run(t, i + 1));
}

if (count('pages') === 0) {
  const p = db.prepare('INSERT INTO pages (title, slug, menu_group, body, in_menu, sort) VALUES (?,?,?,?,?,?)');
  const lorem = (t) => `<p>${t}</p><p>โรงเรียนมุ่งมั่นพัฒนาผู้เรียนอย่างรอบด้าน ทั้งด้านวิชาการ คุณธรรม และทักษะชีวิต ` +
    'เพื่อให้เติบโตเป็นพลเมืองที่มีคุณภาพของสังคม (แก้ไขเนื้อหานี้ได้ที่หลังบ้าน)</p>';
  p.run('ประวัติโรงเรียน', 'about', 'เกี่ยวกับเรา', lorem('โรงเรียนวิทยาปัญญาก่อตั้งเมื่อปี พ.ศ. 2524 ด้วยปณิธานในการสร้างสรรค์การศึกษาที่มีคุณภาพ'), 1, 1);
  p.run('วิสัยทัศน์และพันธกิจ', 'vision', 'เกี่ยวกับเรา', lorem('วิสัยทัศน์: เป็นโรงเรียนคุณภาพชั้นนำที่ผลิตผู้เรียนให้เป็นคนดี มีความรู้ และพร้อมสู่สากล'), 1, 2);
  p.run('คณะผู้บริหาร', 'executives', 'เกี่ยวกับเรา', lorem('คณะผู้บริหารโรงเรียนวิทยาปัญญา'), 1, 3);
  p.run('หลักสูตรการเรียนการสอน', 'curriculum', 'การเรียนการสอน', lorem('หลักสูตรสถานศึกษาตามแนวทางหลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน เสริมด้วยกิจกรรมพัฒนาผู้เรียน'), 1, 4);
  p.run('บุคลากร', 'staff', 'การเรียนการสอน', lorem('คุณครูและบุคลากรทางการศึกษาที่มีความเชี่ยวชาญ'), 1, 5);
  p.run('การรับสมัครนักเรียน', 'admission', 'รับสมัคร', lorem('ข้อมูลการรับสมัครนักเรียนใหม่ คุณสมบัติ เอกสาร และกำหนดการ'), 1, 6);
  p.run('ดาวน์โหลดเอกสาร', 'downloads', null, lorem('รวบรวมแบบฟอร์มและเอกสารสำหรับผู้ปกครองและนักเรียน'), 0, 7);
}
