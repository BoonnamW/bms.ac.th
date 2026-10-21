// เขียนไฟล์ .zip ลงสตรีมทีละไฟล์ (ไม่ต้องเก็บไฟล์ทั้งหมดไว้ในหน่วยความจำ) — ชื่อไฟล์ภาษาไทยได้ (UTF-8)
// ไม่รองรับ ZIP64: รวมกันได้ไม่เกิน 4 GB และไม่เกิน 65,535 ไฟล์ (ผู้เรียกตรวจก่อน)
import fs from 'node:fs';
import zlib from 'node:zlib';
import { once } from 'node:events';
import { promisify } from 'node:util';

const deflateRaw = promisify(zlib.deflateRaw);
const PACKED = /\.(jpe?g|png|gif|webp|mp4|zip|gz|pdf|docx|xlsx|pptx)$/i; // บีบอัดมาแล้ว เก็บตรง ๆ ไม่เสียเวลาบีบซ้ำ
export const ZIP_MAX_BYTES = 3.5 * 1024 ** 3;
export const ZIP_MAX_FILES = 65000;

const dos = (d) => ({
  time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
  date: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
});

// entries: [{ name, file } | { name, data }] — name ใช้ / คั่นโฟลเดอร์
export async function writeZip(out, entries) {
  let offset = 0;
  const central = [];
  const write = async (buf) => { offset += buf.length; if (!out.write(buf)) await once(out, 'drain'); };
  for (const e of entries) {
    const raw = e.data ?? await fs.promises.readFile(e.file);
    const packed = PACKED.test(e.name) ? null : await deflateRaw(raw);
    const method = packed && packed.length < raw.length ? 8 : 0;
    const body = method ? packed : raw;
    const name = Buffer.from(e.name, 'utf8');
    const { time, date } = dos(e.mtime || new Date());
    const c = { name, method, time, date, crc: zlib.crc32(raw), csize: body.length, size: raw.length, at: offset };
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(c.method, 8);
    h.writeUInt16LE(c.time, 10); h.writeUInt16LE(c.date, 12); h.writeUInt32LE(c.crc, 14);
    h.writeUInt32LE(c.csize, 18); h.writeUInt32LE(c.size, 22); h.writeUInt16LE(name.length, 26);
    await write(h); await write(name); await write(body);
    central.push(c);
  }
  const start = offset;
  for (const c of central) {
    const h = Buffer.alloc(46);
    h.writeUInt32LE(0x02014b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(20, 6); h.writeUInt16LE(0x0800, 8);
    h.writeUInt16LE(c.method, 10); h.writeUInt16LE(c.time, 12); h.writeUInt16LE(c.date, 14); h.writeUInt32LE(c.crc, 16);
    h.writeUInt32LE(c.csize, 20); h.writeUInt32LE(c.size, 24); h.writeUInt16LE(c.name.length, 28); h.writeUInt32LE(c.at, 42);
    await write(h); await write(c.name);
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length, 8); end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(offset - start, 12); end.writeUInt32LE(start, 16);
  await write(end);
}
