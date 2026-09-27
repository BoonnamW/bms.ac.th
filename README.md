# เว็บไซต์โรงเรียน + ระบบจัดการเนื้อหา (CMS)

Express 5 + SQLite (ในตัว Node 22.5+) + EJS — ติดตั้งง่าย ไม่ต้องมีฐานข้อมูลแยก

## เริ่มใช้งาน

```bash
npm install
npm start
```

- เว็บไซต์: http://localhost:3000
- หลังบ้าน: http://localhost:3000/admin

ครั้งแรกระบบจะสร้างผู้ใช้ `admin` พร้อม **รหัสผ่านสุ่มแสดงในหน้าจอ terminal** และบังคับให้เปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งแรก
(หรือกำหนดเองด้วยตัวแปร `ADMIN_PASSWORD` ก่อนรันครั้งแรก)

## จัดการอะไรได้บ้าง (เมนูหลังบ้าน)

ข่าวสาร/ประกาศ · หน้าเว็บไซต์ (สร้างเมนูและเมนูย่อยอัตโนมัติ) · สไลด์หน้าแรก · เมนูลัด ·
ตัวเลขความภาคภูมิใจ · แกลเลอรี · ข้อความจากผู้ติดต่อ · ตั้งค่าเว็บไซต์ (ชื่อ โลโก้ สี ข้อมูลติดต่อ)

## ความปลอดภัย

| ด้าน | มาตรการ |
|---|---|
| รหัสผ่าน | bcrypt (cost 12), ขั้นต่ำ 10 ตัวอักษร, บังคับเปลี่ยนครั้งแรก, ออกจากอุปกรณ์อื่นเมื่อเปลี่ยน |
| เข้าสู่ระบบ | จำกัด 10 ครั้ง/15 นาที, ล็อกบัญชี 15 นาทีเมื่อผิด 5 ครั้ง, ป้องกัน timing attack, สร้าง session ใหม่ทุกครั้ง |
| Session | คุกกี้ HttpOnly + SameSite=Strict (+ Secure บน HTTPS), เก็บเฉพาะค่าแฮชในฐานข้อมูล, หมดอายุ 2 ชม. |
| CSRF | โทเค็นทุกฟอร์มที่เปลี่ยนข้อมูล (หลังบ้านและฟอร์มสาธารณะ) |
| XSS | EJS escape อัตโนมัติ, เนื้อหา rich text ผ่าน sanitize-html แบบ whitelist, CSP เข้มงวด (ไม่มี inline script) |
| SQL Injection | prepared statements ทั้งหมด, ชื่อคอลัมน์มาจากรายการที่กำหนดไว้เท่านั้น |
| อัปโหลดไฟล์ | ตรวจ "ไบต์จริง" ของไฟล์ (JPG/PNG/WebP/GIF), ≤ 5 MB, เปลี่ยนชื่อเป็นสุ่ม |
| Header | Helmet: CSP, HSTS (production), X-Content-Type-Options, frame-ancestors none, Permissions-Policy |
| ฟอร์มติดต่อ | จำกัด 5 ครั้ง/ชม./IP + honeypot กันบอท |
| URL | รับเฉพาะ `/path`, `http(s)`, `mailto`, `tel` (กัน `javascript:`) |

## ขึ้นใช้งานจริง (Production)

1. ตั้ง `NODE_ENV=production`
2. รันหลัง reverse proxy ที่เปิด **HTTPS** (Nginx / Caddy / Cloudflare) และตั้ง `TRUST_PROXY=1`
3. รันด้วย process manager เช่น `pm2 start server.js`
4. สำรองโฟลเดอร์ `data/` และ `uploads/` เป็นประจำ

ตัวแปรที่ใช้ได้: `PORT`, `NODE_ENV`, `TRUST_PROXY`, `ADMIN_PASSWORD`, `DATA_PATH`, `WP_MEDIA_URL`

## ย้ายข้อมูลจากเว็บ WordPress เดิม (www.bms.ac.th/bs)

`scripts/import-wp.mjs` นำเข้าเนื้อหาที่เผยแพร่แล้วทั้งหมด: ข่าว 440 เรื่อง, หน้าเว็บ, อัลบั้มภาพ (Responsive Lightbox),
เมนู (จัดกลุ่มใหม่ ลึกไม่เกิน 2 ชั้น), หน้า ITA/OIT ที่มีเนื้อหาอยู่แล้ว และลิงก์เดิมทุกลิงก์ (`/bs/ปี/เดือน/วัน/ชื่อข่าว/`, `/bs/?p=123`)
จะถูกส่งต่อ (301) ไปยังหน้าใหม่อัตโนมัติ — รันซ้ำได้ ไม่สร้างซ้ำและไม่ทับสิ่งที่แก้ไขในหลังบ้าน

```bash
# จากไฟล์ส่งออกฐานข้อมูล (phpMyAdmin → Export) — ไฟล์ .sql มีข้อมูลผู้ใช้ ห้าม commit
node scripts/import-wp.mjs bmsacth_benjamadb2019.sql

# สร้างไฟล์เนื้อหาสาธารณะใหม่ (ไม่มีตารางผู้ใช้) สำหรับ seed/ ที่ใช้ตอนขึ้นเซิร์ฟเวอร์
node scripts/import-wp.mjs bmsacth_benjamadb2019.sql --export seed/bms-wp.json.gz
```

**รูปและไฟล์แนบ** ถูกอ้างอิงเป็น `/uploads/wp/<ปี>/<เดือน>/<ไฟล์>`
- ระหว่างย้าย: ตั้ง `WP_MEDIA_URL=https://www.bms.ac.th/bs/wp-content/uploads/` ระบบจะดึงไฟล์จากเว็บเดิมให้
- ย้ายเสร็จ: คัดลอกโฟลเดอร์ `public_html/bs/wp-content/uploads/` ของโฮสต์เดิมไปไว้ที่ `<DATA_PATH>/uploads/wp/` (ประมาณ 6 GB) แล้วเลิกตั้ง `WP_MEDIA_URL`
- โฟลเดอร์ `uploads/wp` เปิดให้เข้าถึงเฉพาะไฟล์รูป/เอกสาร (jpg png gif webp pdf doc xls ppt zip mp4) เท่านั้น

## โครงสร้าง

```
server.js        เริ่มระบบ + security headers
lib/entities.js  นิยามฟอร์ม/ข้อมูลที่จัดการได้ (เพิ่มฟิลด์ที่นี่)
lib/db.js        โครงสร้างฐานข้อมูล + ข้อมูลตัวอย่าง
lib/wp.js        อ่านไฟล์ส่งออกฐานข้อมูล WordPress
lib/oit.js       รายการหัวข้อเปิดเผยข้อมูลสาธารณะ (OIT)
scripts/         import-wp.mjs (นำเข้าจากเว็บเดิม) / add-standard-pages.mjs (หน้า ITA/PDPA)
seed/            เนื้อหาสาธารณะของเว็บเดิม ใช้นำเข้าอัตโนมัติตอนขึ้นเซิร์ฟเวอร์ครั้งแรก
routes/          public.js (หน้าเว็บ) / admin.js (หลังบ้าน)
views/           แม่แบบหน้า (EJS)
public/          CSS / JS
```

## ขึ้นโฮสต์แบบเดโม (Render)

1. เข้าสู่ระบบ GitHub แล้วสร้าง repository ใหม่ → อัปโหลดไฟล์ในโปรเจกต์ (ยกเว้น `node_modules`, `data`, `uploads`) หรือแตกไฟล์ `school-website-deploy.zip` แล้วอัปโหลดทั้งหมด
2. เข้าสู่ระบบ https://render.com → New → **Blueprint** → เลือก repository นั้น (ระบบอ่าน `render.yaml` ให้เอง)
3. ใส่ค่า `ADMIN_PASSWORD` (อย่างน้อย 10 ตัวอักษร มีตัวอักษรและตัวเลข) แล้วกด Deploy
4. ได้ลิงก์ `https://school-website-xxxx.onrender.com` — ครั้งแรกระบบนำเข้าข้อมูลโรงเรียนให้อัตโนมัติ

ข้อจำกัดของแพ็กเกจฟรี: เซิร์ฟเวอร์จะหลับเมื่อไม่มีคนเข้า (เปิดครั้งแรกช้าราว 30 วินาที) และข้อมูลที่แก้ในหลังบ้านจะ **หายเมื่อรีสตาร์ต**
ถ้าจะใช้งานจริง ให้เปลี่ยนเป็นแพ็กเกจที่มี Persistent Disk แล้วตั้งตัวแปร `DATA_PATH` ให้ชี้ไปที่โฟลเดอร์ที่ mount disk ไว้ เพื่อเก็บฐานข้อมูลและรูปอัปโหลดถาวร
