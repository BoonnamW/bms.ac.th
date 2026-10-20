// วารสารรายเดือน (E-book): บทความที่เจ้าหน้าที่กรอกระหว่างเดือน → รวมเป็นเล่มของเดือนนั้น
// เล่มเผยแพร่เองวันที่ 1 ของเดือนถัดไป (เวลาไทย) — ตั้ง "เผยแพร่ทันที" หรือ "ซ่อน" ได้ที่หลังบ้าน
// เล่มที่ทำไว้ที่อื่น (AnyFlip / PDF) ใส่เป็นลิงก์ภายนอกได้ แสดงรวมในชั้นหนังสือเดียวกัน
import { db, getSettings } from './db.js';

export const JOURNAL_SECTIONS = {
  highlight: 'ข่าวเด่นประจำเดือน', activity: 'กิจกรรม', award: 'ผลงานและรางวัล', academic: 'วิชาการ',
  pr: 'ประชาสัมพันธ์', article: 'บทความ', other: 'อื่น ๆ',
};
// รูปแบบการจัดหน้าของบทความในเล่ม (เลือกในฟอร์ม — ระบบจัดวางรูปและข้อความให้เอง)
export const JOURNAL_LAYOUTS = {
  top: 'รูปใหญ่ด้านบน ข้อความด้านล่าง', side: 'รูปข้างข้อความ', gallery: 'เน้นภาพกิจกรรม (รูปเรียงเป็นตาราง)',
  feature: 'ภาพเต็มหน้า (เหมาะกับข่าวเด่น)', text: 'ข้อความล้วน',
};
export const ISSUE_STATUS = { auto: 'อัตโนมัติ — เผยแพร่วันที่ 1 ของเดือนถัดไป', now: 'เผยแพร่ทันที', hidden: 'ซ่อน (เห็นเฉพาะผู้ดูแล)' };
const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

export const journalName = () => getSettings().journal_name || 'วารสารโรงเรียน';
// เดือนเก็บเป็น ค.ศ. 'YYYY-MM' · ลิงก์ใช้ พ.ศ. เช่น /journal/2569-10
export const ymLabel = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${Number(ym.slice(0, 4)) + 543}`;
export const ymSlug = (ym) => `${Number(ym.slice(0, 4)) + 543}-${ym.slice(5, 7)}`;
export const slugYm = (s) => (/^25\d\d-(0[1-9]|1[0-2])$/.test(String(s)) ? `${Number(s.slice(0, 4)) - 543}-${s.slice(5)}` : null);
export const todayTH = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
export const thisYm = () => todayTH().slice(0, 7);
const shift = (ym, d) => {
  const t = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + d;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};
export const releaseDay = (ym) => `${shift(ym, 1)}-01`; // วันที่ 1 ของเดือนถัดไป
// ตัวเลือกเดือนในฟอร์ม: เดือนหน้า ย้อนไปถึงปี 2015
export const monthOptions = () => {
  const out = [];
  for (let ym = shift(thisYm(), 1); ym >= '2015-01'; ym = shift(ym, -1)) out.push(ym);
  return out;
};
export const monthLabels = () => Object.fromEntries(monthOptions().map((ym) => [ym, ymLabel(ym)]));

const ORDER = `CASE section ${Object.keys(JOURNAL_SECTIONS).map((k, i) => `WHEN '${k}' THEN ${i}`).join(' ')} ELSE 99 END, sort, entry_date, id`;
const inMonth = "published=1 AND substr(entry_date,1,7)=?";
const entriesSql = db.prepare(`SELECT * FROM journal_entries WHERE ${inMonth} ORDER BY ${ORDER}`);
const coverSql = db.prepare(`SELECT image FROM journal_entries WHERE ${inMonth} AND COALESCE(image,'')<>'' AND image NOT LIKE '%.pdf' ORDER BY ${ORDER} LIMIT 1`);
export const entriesOf = (ym) => entriesSql.all(ym);
export const coverOf = (ym, row) => (row?.image || coverSql.get(ym)?.image || '');

// เล่มทั้งหมด ใหม่ → เก่า · editor = เห็นเล่มที่ยังไม่เผยแพร่ด้วย
// เลขฉบับ: ใช้เลขที่ตั้งไว้ ไม่ตั้ง = นับต่อจากเล่มก่อนหน้า (นับเฉพาะเล่มที่ระบบรวมให้และเผยแพร่แล้ว)
export function issues({ editor = false } = {}) {
  const counts = new Map(db.prepare("SELECT substr(entry_date,1,7) ym, COUNT(*) n FROM journal_entries WHERE published=1 GROUP BY ym").all().map((r) => [r.ym, r.n]));
  const rows = new Map(db.prepare('SELECT * FROM journal_issues').all().map((r) => [r.ym, r]));
  const today = todayTH();
  const out = [];
  let prev = 0;
  for (const ym of [...new Set([...counts.keys(), ...rows.keys()])].filter((x) => /^\d{4}-\d\d$/.test(x)).sort()) {
    const row = rows.get(ym), n = counts.get(ym) || 0, link = row?.link || '';
    if (!link && !n) continue; // ยังไม่มีบทความ
    const status = row?.status || 'auto', released = today >= releaseDay(ym);
    const isPublic = status !== 'hidden' && (!!link || status === 'now' || released);
    let number = null;
    if (!link && isPublic) { number = row?.number || prev + 1; prev = number; }
    if (!isPublic && !editor) continue;
    out.push({ ym, slug: ymSlug(ym), label: ymLabel(ym), n, row: row || null, link, status, isPublic, released,
      number, volume: row?.volume || null, release: releaseDay(ym), cover: coverOf(ym, row) });
  }
  return out.reverse();
}
export const issueOf = (ym, opts) => issues(opts).find((x) => x.ym === ym) || null;

// ---------- เล่มเดิมที่ทำไว้ที่อื่น: ลิงก์ "E-Book เดือน <เดือน> <พ.ศ.>" ในหน้าเว็บ → เล่มลิงก์ภายนอก ----------
const MONTH_OF = (name) => MONTHS.findIndex((m) => m === name.replace('กรกฏาคม', 'กรกฎาคม')) + 1;
export function legacyIssues(html) {
  const out = [];
  for (const m of String(html || '').matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>\s*E-?Book\s+เดือน\s*([^\s<]+)\s+(25\d\d)\s*<\/a>/gi)) {
    const mo = MONTH_OF(m[2]);
    if (mo) out.push({ ym: `${Number(m[3]) - 543}-${String(mo).padStart(2, '0')}`, link: m[1].replace(/&amp;/g, '&') });
  }
  return out;
}
