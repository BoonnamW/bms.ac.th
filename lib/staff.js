// ทำเนียบบุคคล: หน้าเว็บที่ตั้งรูปแบบเป็น "people" แสดงการ์ดรายชื่อ (คนบนสุด = หัวหน้า/ประธาน)
// หน้าในกลุ่มเมนู "บุคลากร" = กลุ่มสาระ/ฝ่าย (หน้าชื่อ "บุคลากร" คือหน้ารวม)
export const STAFF_GROUP = 'บุคลากร';
export const LAYOUTS = {
  page: 'เนื้อหาปกติ',
  people: 'ทำเนียบบุคคล — การ์ดรูปคน คนบนสุดคือหัวหน้า/ประธาน',
  'people-index': 'หน้ารวมทำเนียบ — การ์ดของหน้าทำเนียบในกลุ่มเมนูเดียวกัน',
};
const HEAD = /หัวหน้า|ประธาน|ปัจจุบัน/;

const decode = (s) => String(s).replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const textLines = (html) => html.replace(/<img[^>]*>/gi, '').split(/<br\s*\/?>|<\/?p[^>]*>|\n/i)
  .map((s) => decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()).filter(Boolean);
const imgSrc = (html) => decode((html.match(/<img[^>]*\bsrc="([^"]+)"/i) || [])[1] || '');
// รูปในเว็บนี้เก็บเป็นชื่อไฟล์ใต้ uploads/ — รูปที่ยังอยู่บนเว็บเดิมเก็บเป็นลิงก์ https เต็ม
const photoPath = (src) => (src.startsWith('/uploads/') ? src.slice(9) : /^https:\/\//.test(src) ? src : '');

// ตาราง "แถวรูป แถวชื่อ" (หรือรูปกับชื่อในช่องเดียวกัน / ย่อหน้ารูปตามด้วยย่อหน้าชื่อ) จากหน้าเว็บเดิม → รายชื่อ
// หัวหน้า = คนที่มีคำว่า หัวหน้า/ประธาน/ปัจจุบัน หรือคนเดียวในแถวแรก
const BLOCK = new RegExp([
  '<table[\\s\\S]*?<\\/table>',
  '<p>\\s*<img[^>]*>\\s*<\\/p>\\s*<p>(?:(?!<\\/p>|<img)[\\s\\S])*?<\\/p>', // ย่อหน้ารูป + ย่อหน้าชื่อ
  '<p>(?:(?!<\\/p>)[\\s\\S])*?<img[\\s\\S]*?<\\/p>',
].join('|'), 'gi');
export function extractStaff(html = '') {
  const rows = [];
  const blocks = [...html.matchAll(BLOCK)].filter((m) => /<img/i.test(m[0])); // ตารางที่ไม่มีรูป (เช่น ตารางข้อความ) ไม่ใช่รายชื่อ
  for (const { 0: block } of blocks) {
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
  // เนื้อหาก่อนรายชื่อ (แสดงเหนือรายชื่อ) และหลังรายชื่อ (คั่นด้วย <hr> → แสดงใต้รายชื่อ)
  const trim = (s) => s.replace(/^(\s|&nbsp;|<br\s*\/?>|<hr\s*\/?>|<p>(\s|&nbsp;)*<\/p>)+|(\s|&nbsp;|<br\s*\/?>|<hr\s*\/?>|<p>(\s|&nbsp;)*<\/p>)+$/gi, '');
  const keep = (s) => (textLines(s).length || /<img/i.test(s) ? s : '');
  if (!blocks.length) return { people, rest: keep(trim(html)) };
  const before = keep(trim(html.slice(0, blocks[0].index)));
  const last = blocks.at(-1);
  const after = keep(trim(html.slice(last.index + last[0].length)));
  return { people, rest: after ? `${before}\n<hr />\n${after}` : before };
}
