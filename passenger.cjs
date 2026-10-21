// ไฟล์เริ่มระบบสำหรับโฮสต์ที่รันผ่าน Passenger เช่น "Setup Node.js App" ของ DirectAdmin / cPanel
// (Passenger เปิดไฟล์นี้ด้วย require() ส่วนโค้ดของเว็บเป็น ES module จึงโหลดต่อด้วย import())
import('./server.js').catch((e) => { console.error(e); process.exit(1); });
