// เริ่มเว็บในคอนเทนเนอร์ (ดู Dockerfile): ดิสก์ถาวรที่โฮสต์ mount ไว้ (DATA_PATH) อาจเป็นของ root
// จึงเริ่มด้วย root เพื่อให้สิทธิ์ผู้ใช้ node ก่อน แล้วรันทุกขั้นด้วยสิทธิ์ node (เว็บไม่ได้รันด้วย root)
// ขั้นตอน: นำเข้าเนื้อหาเว็บเดิม + หน้ามาตรฐาน (ครั้งแรกเท่านั้น ข้ามถ้าเคยทำแล้ว) → เริ่มเซิร์ฟเวอร์
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ID = 1000; // ผู้ใช้/กลุ่ม node ของอิมเมจ node:*
const asNode = process.getuid?.() === 0 ? { uid: ID, gid: ID, env: { ...process.env, HOME: '/home/node' } } : {};

// ทุกไฟล์ในดิสก์ถาวรเป็นของ node — ไฟล์ที่คัดลอกเข้าไปด้วยสิทธิ์ root (เช่นจาก Shell) ก็แก้ให้ตอนเริ่มครั้งถัดไป
function own(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const fix = (p) => { const s = fs.lstatSync(p); if (s.uid !== ID || s.gid !== ID) fs.lchownSync(p, ID, ID); };
  fix(dir);
  for (const e of fs.readdirSync(dir, { recursive: true })) fix(path.join(dir, e));
}
if (asNode.uid !== undefined && process.env.DATA_PATH) own(path.resolve(process.env.DATA_PATH));

const node = (args) => [process.execPath, ['--disable-warning=ExperimentalWarning', ...args], { stdio: 'inherit', ...asNode }];
spawnSync(...node(['scripts/import-wp.mjs', 'seed/bms-wp.json.gz', '--once']));
spawnSync(...node(['scripts/add-standard-pages.mjs']));
const server = spawn(...node(['server.js']));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.kill(sig));
server.on('exit', (code, sig) => process.exit(code ?? (sig ? 1 : 0)));
