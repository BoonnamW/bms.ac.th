// ดาวน์โหลดรูปและไฟล์แนบที่เว็บไซต์ใช้จริง จากเว็บ WordPress เดิม มาเก็บไว้ในเครื่องที่ uploads/wp
//
//   npm run fetch-media
//
// ใช้หลังนำเข้าข้อมูลแล้ว (npm run setup) — รันซ้ำได้ ไฟล์ที่มีอยู่แล้วจะข้าม จึงหยุดกลางคันแล้วรันต่อได้
// ต้นทาง: ค่า WP_MEDIA_URL หรือที่อยู่ที่สคริปต์นำเข้าบันทึกไว้ (เช่น https://www.bms.ac.th/bs/wp-content/uploads/)
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { db, getSettings, UPLOAD_DIR, DATA_DIR } from '../lib/db.js';
import { WP_FILE } from '../lib/helpers.js';

const base = String(process.env.WP_MEDIA_URL || getSettings().wp_media_url || '').replace(/\/?$/, '/');
if (!/^https?:\/\/[^\s/]+\//.test(base)) {
  console.error('ไม่พบที่อยู่ไฟล์ของเว็บเดิม — รัน npm run setup ก่อน หรือตั้งค่า WP_MEDIA_URL');
  process.exit(1);
}
const ROOT = path.join(UPLOAD_DIR, 'wp');

// ---------- รวบรวมไฟล์ที่ถูกอ้างถึง: รูปหน้าปก แกลเลอรี สไลด์ โลโก้ และรูป/ไฟล์ในเนื้อหา ----------
const files = new Set();
const add = (p) => {
  let rel = String(p || '').split(/[?#]/)[0];
  try { rel = decodeURIComponent(rel); } catch { /* ใช้ตามเดิม */ }
  rel = rel.replace(/&amp;/g, '&');
  if (rel && WP_FILE.test(rel) && !rel.split('/').some((s) => s === '..' || s === '')) files.add(rel);
};
for (const t of ['news', 'gallery', 'slides']) {
  for (const r of db.prepare(`SELECT image FROM ${t} WHERE image LIKE 'wp/%'`).all()) add(r.image.slice(3));
}
const logo = getSettings().logo;
if (logo?.startsWith('wp/')) add(logo.slice(3));
for (const t of ['news', 'pages']) {
  for (const r of db.prepare(`SELECT body FROM ${t}`).all()) {
    for (const m of String(r.body || '').matchAll(/\/uploads\/wp\/([^"'\s<>]+)/g)) add(m[1]);
  }
}

// ---------- ดาวน์โหลด (พร้อมกันครั้งละ 4 ไฟล์) ----------
const list = [...files].sort();
console.log(`พบไฟล์ที่เว็บใช้ ${list.length} ไฟล์ — ดาวน์โหลดจาก ${base}`);
let next = 0, done = 0, got = 0, skipped = 0, bytes = 0;
const failed = [];

async function fetchOne(rel) {
  const dest = path.join(ROOT, rel);
  if (!dest.startsWith(ROOT + path.sep)) return failed.push(`${rel} (ชื่อไฟล์ไม่ถูกต้อง)`);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { skipped++; return; }
  const tmp = `${dest}.part`;
  try {
    const res = await fetch(base + rel.split('/').map(encodeURIComponent).join('/'), {
      headers: { 'User-Agent': 'Mozilla/5.0 (school-website media sync)' }, signal: AbortSignal.timeout(180000),
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp));
    fs.renameSync(tmp, dest);
    got++; bytes += fs.statSync(dest).size;
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    failed.push(`${rel} (${e.name === 'TimeoutError' ? 'หมดเวลา' : e.message})`);
  }
}

const started = Date.now();
await Promise.all(Array.from({ length: 4 }, async () => {
  while (next < list.length) {
    await fetchOne(list[next++]);
    if (++done % 100 === 0 || done === list.length) {
      console.log(`  ${done}/${list.length} · ใหม่ ${got} · มีอยู่แล้ว ${skipped} · ไม่สำเร็จ ${failed.length} · ${(bytes / 1048576).toFixed(0)} MB`);
    }
  }
}));

console.log(`✓ เสร็จใน ${Math.round((Date.now() - started) / 1000)} วินาที: ดาวน์โหลดใหม่ ${got} ไฟล์ (${(bytes / 1048576).toFixed(1)} MB) · มีอยู่แล้ว ${skipped} · ไม่สำเร็จ ${failed.length}`);
if (failed.length) {
  const report = path.join(DATA_DIR, 'fetch-media-failed.txt');
  fs.writeFileSync(report, failed.join('\n') + '\n');
  console.log(`  รายการที่ไม่สำเร็จ (อาจไม่มีไฟล์นี้บนเว็บเดิมแล้ว): ${report} — รันคำสั่งนี้ซ้ำเพื่อลองใหม่`);
}
