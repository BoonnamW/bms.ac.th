// ทำเนียบบุคลากร: หน้าเว็บในกลุ่มเมนู "บุคลากร" = กลุ่มสาระ/ฝ่าย (หน้าชื่อ "บุคลากร" คือหน้ารวม)
export const STAFF_GROUP = 'บุคลากร';
const HEAD = /หัวหน้า|ประธาน/;

const decode = (s) => String(s).replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const textLines = (html) => html.replace(/<img[^>]*>/gi, '').split(/<br\s*\/?>|<\/?p[^>]*>|\n/i)
  .map((s) => decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()).filter(Boolean);
const imgSrc = (html) => decode((html.match(/<img[^>]*\bsrc="([^"]+)"/i) || [])[1] || '');
// รูปในเว็บนี้เก็บเป็นชื่อไฟล์ใต้ uploads/ — รูปที่ยังอยู่บนเว็บเดิมเก็บเป็นลิงก์ https เต็ม
const photoPath = (src) => (src.startsWith('/uploads/') ? src.slice(9) : /^https:\/\//.test(src) ? src : '');

// ตาราง "แถวรูป แถวชื่อ" (หรือรูปกับชื่อในช่องเดียวกัน) จากหน้ากลุ่มสาระของเว็บเดิม → รายชื่อ
// หัวหน้า = คนที่มีคำว่า หัวหน้า/ประธาน หรือคนเดียวในแถวแรก
const BLOCK = /<table[\s\S]*?<\/table>|<p>(?:(?!<\/p>)[\s\S])*?<img[\s\S]*?<\/p>/gi;
export function extractStaff(html = '') {
  const rows = [];
  for (const block of html.match(BLOCK) || []) {
    if (!/^<table/i.test(block)) { rows.push([block]); continue; }
    for (const tr of block.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
      rows.push((tr.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || []).map((td) => td.replace(/^<td[^>]*>|<\/td>$/gi, '')));
    }
  }
  const found = [], waiting = {}; // waiting[คอลัมน์] = รูปที่ยังรอชื่อในแถวถัดไป
  let firstRow = -1;
  rows.forEach((cells, r) => {
    const inRow = [];
    cells.forEach((cell, c) => {
      const img = imgSrc(cell), lines = textLines(cell);
      if (!lines.length) { if (img) waiting[c] = img; return; }
      inRow.push({ lines, src: img || waiting[c] || '' });
      delete waiting[c];
    });
    if (inRow.length && firstRow < 0) firstRow = r;
    inRow.forEach((p) => found.push({ ...p, alone: r === firstRow && inRow.length === 1 }));
  });
  const people = found.map(({ lines: [name, ...rest], src, alone }) => ({
    name, alone, photo: photoPath(src),
    position: rest.filter((l) => !HEAD.test(l)).join(' · '),
    duty: rest.filter((l) => HEAD.test(l)).join(' · '),
  }));
  const head = people.find((p) => p.duty) || people.find((p) => p.alone);
  for (const p of people) { p.head = p === head; delete p.alone; }
  // เนื้อหาที่เหลือ (ถ้ามีข้อความอื่นนอกจากตารางรายชื่อ)
  const rest = html.replace(BLOCK, '').replace(/^(\s|<br\s*\/?>|<p>\s*<\/p>)+|(\s|<br\s*\/?>|<p>\s*<\/p>)+$/gi, '');
  return { people, rest: textLines(rest).length || /<img/i.test(rest) ? rest : '' };
}
