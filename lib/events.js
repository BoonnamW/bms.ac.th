// ปฏิทินกิจกรรม: ข้อความวันเวลาแบบไทย ลิงก์เพิ่มลง Google Calendar และไฟล์ iCalendar (.ics) สำหรับ iPhone / Outlook / Android
import { parseUtc, dateParts, thTime } from './helpers.js';

// เวลาสิ้นสุดที่ใช้ตัดสินว่ากิจกรรม "ผ่านไปแล้ว" (กิจกรรมทั้งวันนับถึงสิ้นวัน, ไม่ระบุเวลาจบ = 3 ชั่วโมงหลังเริ่ม)
export const EVENT_END_SQL = `CASE WHEN all_day=1 THEN datetime(COALESCE(NULLIF(end_at,''), start_at), '+1 day')
  WHEN NULLIF(end_at,'') IS NOT NULL THEN end_at ELSE datetime(start_at, '+3 hours') END`;

export const nowUtc = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const compact = (d) => parseUtc(d).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'; // 20261005T020000Z
const ymdPlus = (ymd, days) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
};

// ข้อมูลสำหรับแสดงผล: ป้ายวันที่ ช่วงวัน เวลา และลิงก์เพิ่มลงปฏิทิน
export function eventView(e) {
  const start = dateParts(e.start_at);
  const end = e.end_at ? dateParts(e.end_at) : null;
  const multiDay = end && end.ymd !== start.ymd;
  const range = multiDay ? `${start.day} ${start.month} – ${end.day} ${end.month} ${end.year}` : `${start.day} ${start.month} ${start.year}`;
  const time = e.all_day ? 'ทั้งวัน'
    : e.end_at && !multiDay ? `${thTime(e.start_at).replace(' น.', '')} – ${thTime(e.end_at)}` : thTime(e.start_at);
  const dates = e.all_day
    ? `${start.ymd.replace(/-/g, '')}/${ymdPlus((end || start).ymd, 1)}`
    : `${compact(e.start_at)}/${compact(e.end_at || new Date(parseUtc(e.start_at).getTime() + 3600e3).toISOString())}`;
  const gcal = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
    + `&text=${encodeURIComponent(e.title)}&dates=${dates}`
    + (e.location ? `&location=${encodeURIComponent(e.location)}` : '')
    + (e.detail ? `&details=${encodeURIComponent(e.detail.slice(0, 900))}` : '');
  return { ...e, start, end, range, time, gcal, ics: `/events/${e.id}.ics`, monthKey: start.ymd.slice(0, 7) };
}

// ---------- iCalendar (RFC 5545) ----------
const escText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// ตัดบรรทัดยาวเกิน 75 ไบต์ (ภาษาไทย 1 ตัวอักษร = 3 ไบต์) โดยไม่ตัดกลางตัวอักษร
function fold(line) {
  const out = [];
  let cur = '', bytes = 0, limit = 75;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > limit) { out.push(cur); cur = ' '; bytes = 1; limit = 75; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}

export function icsCalendar(events, { name, host, base }) {
  const stamp = compact(new Date().toISOString());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//School Website//Events//TH', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escText(name)}`, 'X-WR-TIMEZONE:Asia/Bangkok'];
  for (const e of events) {
    const v = eventView(e);
    lines.push('BEGIN:VEVENT', `UID:event-${e.id}@${host}`, `DTSTAMP:${stamp}`);
    if (e.all_day) {
      lines.push(`DTSTART;VALUE=DATE:${v.start.ymd.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${ymdPlus((v.end || v.start).ymd, 1)}`);
    } else {
      lines.push(`DTSTART:${compact(e.start_at)}`);
      if (e.end_at) lines.push(`DTEND:${compact(e.end_at)}`);
    }
    lines.push(`SUMMARY:${escText(e.title)}`);
    if (e.location) lines.push(`LOCATION:${escText(e.location)}`);
    if (e.detail) lines.push(`DESCRIPTION:${escText(e.detail)}`);
    const url = e.link ? (/^https?:/.test(e.link) ? e.link : base + e.link) : `${base}/calendar#event-${e.id}`;
    lines.push(`URL:${url}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
