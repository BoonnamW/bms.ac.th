// นิยามเนื้อหาที่จัดการได้ในหลังบ้าน — ฟอร์ม, การตรวจสอบ, ตารางรายการ สร้างจากไฟล์นี้ทั้งหมด
import { db } from './db.js';
import { LAYOUTS } from './staff.js';

export const CATEGORIES = ['ประชาสัมพันธ์', 'กิจกรรม', 'ประกาศ', 'รับสมัคร', 'วิชาการ',
  'ผลงานนักเรียน', 'จัดซื้อจัดจ้าง', 'รับสมัครงาน'];

export const ICONS = {
  graduation: 'หมวกบัณฑิต', award: 'รางวัล / ถ้วย', book: 'หนังสือ', calendar: 'ปฏิทิน', users: 'กลุ่มคน',
  file: 'เอกสาร', phone: 'โทรศัพท์', star: 'ดาว', building: 'อาคาร', heart: 'หัวใจ / สุขภาพ',
  monitor: 'คอมพิวเตอร์', globe: 'โลก', mail: 'อีเมล', shield: 'โล่ / ความโปร่งใส', database: 'ฐานข้อมูล',
  chart: 'กราฟ', image: 'รูปภาพ', play: 'วิดีโอ', wrench: 'เครื่องมือ / ซ่อมบำรุง', card: 'บัตร / การชำระเงิน',
  pin: 'สถานที่', clock: 'เวลา', help: 'คำถาม', broadcast: 'ถ่ายทอดสด', login: 'เข้าสู่ระบบ',
};
export const AUDIENCES = ['นักเรียน', 'ผู้ปกครอง', 'ครูและบุคลากร', 'ทั่วไป'];

// ตัวเลือกเมนูแม่ (อ่านจากฐานข้อมูลทุกครั้งที่เปิดฟอร์ม)
const topMenus = () => db.prepare('SELECT id, title FROM menu_items WHERE parent_id=0 ORDER BY sort, id').all();
// ผลงานและรางวัล: เจ้าของผลงาน และระดับรางวัล
export const AWARD_OWNERS = { school: 'ผลงานโรงเรียน', teacher: 'ผลงานครูและบุคลากร', student: 'ผลงานนักเรียน' };
export const AWARD_LEVELS = { นานาชาติ: 'ระดับนานาชาติ', ประเทศ: 'ระดับประเทศ', ภาค: 'ระดับภาค', จังหวัด: 'ระดับจังหวัด',
  เขตพื้นที่: 'ระดับเขตพื้นที่การศึกษา', โรงเรียน: 'ระดับโรงเรียน' };
export const AWARD_ICONS = { school: 'building', teacher: 'users', student: 'graduation' };
// หน้าที่ตั้งรูปแบบเป็นทำเนียบบุคคล (กลุ่มสาระ คณะกรรมการ ทำเนียบผู้บริหาร ฯลฯ)
const peoplePages = () => db.prepare("SELECT id, title, menu_group FROM pages WHERE layout='people' ORDER BY menu_group, sort, id").all();

export const entities = {
  news: {
    title: 'ข่าวสารและประกาศ', singular: 'ข่าว', order: 'created_at DESC',
    columns: [['title', 'หัวข้อ'], ['category', 'หมวดหมู่'], ['published', 'เผยแพร่'], ['created_at', 'วันที่']],
    fields: [
      { n: 'title', label: 'หัวข้อข่าว', type: 'text', req: true, max: 200 },
      { n: 'category', label: 'หมวดหมู่', type: 'select', options: CATEGORIES, req: true },
      { n: 'excerpt', label: 'คำโปรย (แสดงในหน้าแรก)', type: 'textarea', max: 300 },
      { n: 'body', label: 'เนื้อหา', type: 'richtext', max: 50000 },
      { n: 'image', label: 'รูปหน้าปก', type: 'image', help: 'JPG / PNG / WebP ไม่เกิน 5 MB (แนะนำสัดส่วน 16:9)' },
      { n: 'created_at', label: 'วันที่เผยแพร่', type: 'datetime', help: 'เว้นว่างเพื่อใช้เวลาปัจจุบัน' },
      { n: 'published', label: 'เผยแพร่บนเว็บไซต์', type: 'checkbox', def: 1 },
    ],
  },
  slides: {
    title: 'สไลด์หน้าแรก', singular: 'สไลด์', order: 'sort, id',
    columns: [['title', 'หัวข้อ'], ['sort', 'ลำดับ'], ['active', 'แสดง']],
    fields: [
      { n: 'title', label: 'หัวข้อใหญ่', type: 'text', req: true, max: 120 },
      { n: 'subtitle', label: 'ข้อความรอง', type: 'textarea', max: 250 },
      { n: 'image', label: 'รูปพื้นหลัง', type: 'image', help: 'แนะนำ 1920×800 px หากไม่ใส่จะใช้พื้นหลังไล่สีอัตโนมัติ' },
      { n: 'link', label: 'ลิงก์ปุ่ม', type: 'url', help: 'เช่น /news หรือ https://…' },
      { n: 'sort', label: 'ลำดับ', type: 'number', def: 0 },
      { n: 'active', label: 'แสดงสไลด์นี้', type: 'checkbox', def: 1 },
    ],
  },
  links: {
    title: 'เมนูลัด', singular: 'เมนูลัด', order: 'sort, id',
    columns: [['title', 'ชื่อ'], ['url', 'ลิงก์'], ['sort', 'ลำดับ']],
    fields: [
      { n: 'title', label: 'ชื่อเมนู', type: 'text', req: true, max: 40 },
      { n: 'subtitle', label: 'ข้อความรอง (เช่น ภาษาอังกฤษ)', type: 'text', max: 40 },
      { n: 'icon', label: 'ไอคอน', type: 'select', options: Object.keys(ICONS), labels: ICONS },
      { n: 'url', label: 'ลิงก์', type: 'url', req: true },
      { n: 'sort', label: 'ลำดับ', type: 'number', def: 0 },
    ],
  },
  pages: {
    title: 'หน้าเว็บไซต์', singular: 'หน้า', order: 'sort, id',
    columns: [['title', 'ชื่อหน้า'], ['menu_group', 'กลุ่มเมนู'], ['in_menu', 'อยู่ในเมนู'], ['published', 'เผยแพร่']],
    fields: [
      { n: 'title', label: 'ชื่อหน้า', type: 'text', req: true, max: 120 },
      { n: 'slug', label: 'ชื่อในลิงก์ (ภาษาอังกฤษ)', type: 'slug', req: true, max: 60, help: 'เช่น about → /p/about' },
      { n: 'menu_group', label: 'กลุ่มเมนู', type: 'text', max: 40, help: 'หน้าที่ใช้ชื่อกลุ่มเดียวกันจะรวมเป็นเมนูย่อยเดียวกัน' },
      { n: 'layout', label: 'รูปแบบหน้า', type: 'select', req: true, def: 'page', options: Object.keys(LAYOUTS), labels: LAYOUTS,
        help: 'ทำเนียบบุคคล: แสดงการ์ดรูป ชื่อ ตำแหน่ง — เพิ่ม/แก้รายชื่อได้จากปุ่มบนหน้าเว็บ (เมื่อเข้าสู่ระบบ) หรือเมนู “บุคลากรและคณะกรรมการ”' },
      { n: 'head_label', label: 'ป้ายของคนบนสุด (หน้าทำเนียบ)', type: 'text', max: 40, help: 'เช่น หัวหน้ากลุ่มสาระ · ประธานกรรมการ · ผู้อำนวยการโรงเรียน' },
      { n: 'body', label: 'เนื้อหา', type: 'richtext', max: 100000, help: 'หน้าทำเนียบ: เนื้อหาแสดงเหนือรายชื่อ — ถ้าต้องการให้บางส่วนอยู่ใต้รายชื่อ กดปุ่ม “เส้นคั่น” คั่นไว้ก่อนส่วนนั้น' },
      { n: 'sort', label: 'ลำดับในเมนู', type: 'number', def: 0 },
      { n: 'in_menu', label: 'แสดงในเมนูหลัก', type: 'checkbox', def: 1 },
      { n: 'published', label: 'เผยแพร่', type: 'checkbox', def: 1 },
    ],
  },
  stats: {
    title: 'ตัวเลขความภาคภูมิใจ', singular: 'ตัวเลข', order: 'sort, id',
    columns: [['label', 'ชื่อ'], ['value', 'ตัวเลข'], ['sort', 'ลำดับ']],
    fields: [
      { n: 'label', label: 'ชื่อ', type: 'text', req: true, max: 60 },
      { n: 'label_en', label: 'ชื่อภาษาอังกฤษ', type: 'text', max: 60 },
      { n: 'value', label: 'ตัวเลข', type: 'number', req: true, def: 0 },
      { n: 'suffix', label: 'หน่วยต่อท้าย', type: 'text', max: 6, help: 'เช่น % หรือ + (เว้นว่างได้)' },
      { n: 'icon', label: 'ไอคอน', type: 'select', options: Object.keys(ICONS), labels: ICONS },
      { n: 'sort', label: 'ลำดับ', type: 'number', def: 0 },
    ],
  },
  gallery: {
    title: 'แกลเลอรีภาพกิจกรรม', singular: 'ภาพ', order: 'sort, id',
    columns: [['title', 'ชื่อภาพ'], ['sort', 'ลำดับ']],
    fields: [
      { n: 'title', label: 'ชื่อภาพ', type: 'text', req: true, max: 100 },
      { n: 'image', label: 'รูปภาพ', type: 'image' },
      { n: 'sort', label: 'ลำดับ', type: 'number', def: 0 },
    ],
  },
  events: {
    title: 'ปฏิทินกิจกรรม', singular: 'กิจกรรม', order: 'start_at DESC',
    columns: [['title', 'ชื่อกิจกรรม'], ['start_at', 'วันเวลา'], ['location', 'สถานที่'], ['published', 'เผยแพร่']],
    fields: [
      { n: 'title', label: 'ชื่อกิจกรรม', type: 'text', req: true, max: 200 },
      { n: 'start_at', label: 'เริ่ม', type: 'datetime', req: true },
      { n: 'end_at', label: 'สิ้นสุด', type: 'datetime', blank: true, help: 'เว้นว่างได้' },
      { n: 'all_day', label: 'กิจกรรมทั้งวัน (ไม่แสดงเวลา)', type: 'checkbox', def: 0 },
      { n: 'location', label: 'สถานที่', type: 'text', max: 150 },
      { n: 'detail', label: 'รายละเอียด', type: 'textarea', max: 2000 },
      { n: 'link', label: 'ลิงก์รายละเอียด', type: 'url', help: 'เช่น ลิงก์ข่าว เอกสาร หรือแบบฟอร์ม' },
      { n: 'published', label: 'แสดงบนเว็บไซต์', type: 'checkbox', def: 1 },
    ],
    check: (v) => (v.end_at && v.end_at < v.start_at ? ['เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม'] : []),
  },
  menu_items: {
    title: 'เมนูหลัก', singular: 'เมนู',
    // เรียงตามเมนูหลัก แล้วตามด้วยเมนูย่อยของแต่ละเมนู
    order: 'COALESCE((SELECT p.sort FROM menu_items p WHERE p.id=menu_items.parent_id), sort), COALESCE((SELECT p.id FROM menu_items p WHERE p.id=menu_items.parent_id), id), parent_id<>0, sort, id',
    columns: [['title', 'ชื่อเมนู'], ['parent_id', 'อยู่ใต้เมนู'], ['url', 'ลิงก์'], ['sort', 'ลำดับ'], ['active', 'แสดง']],
    indent: (row) => row.parent_id !== 0,
    fields: [
      { n: 'title', label: 'ชื่อเมนู', type: 'text', req: true, max: 120 },
      { n: 'title_en', label: 'ชื่อภาษาอังกฤษ (ตัวเล็กใต้ชื่อเมนูหลัก)', type: 'text', max: 60 },
      { n: 'parent_id', label: 'อยู่ใต้เมนู', type: 'select', req: true,
        get options() { return ['0', ...topMenus().map((m) => String(m.id))]; },
        get labels() { return { 0: '— เป็นเมนูหลัก (แถบด้านบน) —', ...Object.fromEntries(topMenus().map((m) => [m.id, m.title])) }; } },
      { n: 'url', label: 'ลิงก์', type: 'url', help: 'เช่น /news หรือ https://… — เมนูหลักที่มีเมนูย่อยเว้นว่างได้' },
      { n: 'sort', label: 'ลำดับ', type: 'number', def: 0 },
      { n: 'active', label: 'แสดงเมนูนี้', type: 'checkbox', def: 1 },
    ],
    check: (v, existing, id) => {
      if (id && Number(v.parent_id) === id) return ['เมนูไม่สามารถอยู่ใต้ตัวเองได้'];
      if (id && Number(v.parent_id) !== 0 && db.prepare('SELECT 1 FROM menu_items WHERE parent_id=?').get(id)) {
        return ['เมนูนี้มีเมนูย่อยอยู่ ย้ายหรือลบเมนูย่อยก่อน จึงจะย้ายไปอยู่ใต้เมนูอื่นได้'];
      }
      return [];
    },
    onDelete: (item) => db.prepare('DELETE FROM menu_items WHERE parent_id=?').run(item.id), // ลบเมนูย่อยไปด้วย
  },
  staff: {
    title: 'บุคลากรและคณะกรรมการ', singular: 'รายชื่อ', anchor: 'staff',
    order: 'COALESCE((SELECT p.sort FROM pages p WHERE p.id=staff.page_id), 0), page_id, is_head DESC, sort, id',
    columns: [['name', 'ชื่อ-นามสกุล'], ['page_id', 'หน้า'], ['position', 'ตำแหน่ง'], ['is_head', 'คนบนสุด'], ['active', 'แสดง']],
    fields: [
      { n: 'name', label: 'ชื่อ-นามสกุล', type: 'text', req: true, max: 120 },
      { n: 'page_id', label: 'แสดงในหน้า', type: 'select', req: true,
        help: 'รายการนี้คือหน้าเว็บที่ตั้ง “รูปแบบหน้า” เป็นทำเนียบบุคคล — เพิ่มหน้าใหม่ได้ที่ หน้าเว็บไซต์ → เพิ่มหน้า',
        get options() { return peoplePages().map((d) => String(d.id)); },
        get labels() { return Object.fromEntries(peoplePages().map((d) => [d.id, d.menu_group ? `${d.menu_group} › ${d.title}` : d.title])); } },
      { n: 'position', label: 'ตำแหน่ง / วิทยฐานะ', type: 'text', max: 120, help: 'เช่น ครู ค.ศ.3 หรือ ครูผู้ช่วย' },
      { n: 'is_head', label: 'แสดงด้านบนสุด (หัวหน้า / ประธาน)', type: 'checkbox', def: 0,
        help: 'มีได้คนเดียวต่อหน้า — ถ้าเลือกคนใหม่ คนเดิมจะย้ายลงไปอยู่ในรายชื่อให้อัตโนมัติ' },
      { n: 'duty', label: 'หน้าที่เพิ่มเติม', type: 'text', max: 120, help: 'เช่น หัวหน้ากลุ่มสาระการเรียนรู้ภาษาไทย หรือ ประธานคณะกรรมการสถานศึกษา (เว้นว่างได้)' },
      { n: 'image', label: 'รูปถ่าย', type: 'image', help: 'แนะนำรูปแนวตั้ง สัดส่วน 3:4 ไม่เกิน 5 MB' },
      { n: 'sort', label: 'ลำดับ', type: 'number', def: 0, help: 'เลขน้อยแสดงก่อน' },
      { n: 'active', label: 'แสดงบนเว็บไซต์', type: 'checkbox', def: 1 },
    ],
    // หัวหน้ามีได้คนเดียวต่อกลุ่ม
    afterSave: (id, v) => { if (v.is_head) db.prepare('UPDATE staff SET is_head=0 WHERE page_id=? AND id<>?').run(v.page_id, id); },
  },
  awards: {
    title: 'ผลงานและรางวัล', singular: 'ผลงาน', order: 'award_date DESC, id DESC', anchor: 'aw',
    columns: [['title', 'ผลงาน / รางวัล'], ['owner', 'ประเภท'], ['level', 'ระดับ'], ['award_date', 'วันที่'], ['published', 'แสดง']],
    fields: [
      { n: 'title', label: 'ชื่อผลงาน / รางวัล', type: 'text', req: true, max: 200, help: 'เช่น เหรียญทอง การแข่งขันหุ่นยนต์ งานศิลปหัตถกรรมนักเรียน ครั้งที่ 72' },
      { n: 'owner', label: 'ประเภท', type: 'select', req: true, def: 'student', options: Object.keys(AWARD_OWNERS), labels: AWARD_OWNERS },
      { n: 'people', label: 'ผู้ได้รับรางวัล / เจ้าของผลงาน', type: 'text', max: 200, help: 'เช่น ด.ญ.… ชั้น ม.2/1 · ครู… กลุ่มสาระคณิตศาสตร์ (เว้นว่างได้)' },
      { n: 'level', label: 'ระดับ', type: 'select', options: Object.keys(AWARD_LEVELS), labels: AWARD_LEVELS },
      { n: 'award_date', label: 'วันที่ได้รับ', type: 'date', req: true },
      { n: 'detail', label: 'รายละเอียด', type: 'textarea', max: 1000, help: 'เช่น หน่วยงานที่มอบ หรือชื่อครูผู้ฝึกสอน' },
      { n: 'link', label: 'ลิงก์ข่าว / เอกสาร', type: 'url', help: 'เช่น /news/123 หรือลิงก์เกียรติบัตร' },
      { n: 'image', label: 'รูปภาพ', type: 'image' },
      { n: 'published', label: 'แสดงบนเว็บไซต์', type: 'checkbox', def: 1 },
    ],
  },
  ext_links: {
    title: 'ลิงก์หน่วยงานภายนอก', singular: 'ลิงก์', order: 'sort, id',
    columns: [['title', 'ชื่อหน่วยงาน'], ['url', 'ลิงก์'], ['sort', 'ลำดับ'], ['active', 'แสดง']],
    fields: [
      { n: 'title', label: 'ชื่อหน่วยงาน', type: 'text', req: true, max: 100 },
      { n: 'url', label: 'ลิงก์', type: 'url', req: true, help: 'แสดงในแถบ “หน่วยงานภายนอก” ท้ายเว็บไซต์ทุกหน้า' },
      { n: 'sort', label: 'ลำดับ', type: 'number', def: 0 },
      { n: 'active', label: 'แสดงบนเว็บไซต์', type: 'checkbox', def: 1 },
    ],
  },
  popups: {
    title: 'ป๊อปอัปก่อนเข้าเว็บ', singular: 'ป๊อปอัป', order: 'active DESC, sort, id',
    columns: [['title', 'หัวข้อ'], ['start_at', 'เริ่มแสดง'], ['end_at', 'หยุดแสดง'], ['active', 'เปิดใช้']],
    fields: [
      { n: 'title', label: 'หัวข้อ', type: 'text', req: true, max: 120, help: 'เช่น ยินดีต้อนรับ · ขอเชิญร่วมงาน… · เปิดรับสมัครนักเรียน' },
      { n: 'image', label: 'รูปภาพ / โปสเตอร์', type: 'image', help: 'ไม่ใส่รูป จะใช้ภาพโรงเรียนพร้อมหัวข้อแทน' },
      { n: 'body', label: 'ข้อความ', type: 'textarea', max: 600 },
      { n: 'link', label: 'ลิงก์รายละเอียด', type: 'url', help: 'เว้นว่างได้ — ถ้าใส่ จะมีปุ่มไปยังลิงก์นี้ และกดที่รูปได้' },
      { n: 'link_text', label: 'ข้อความบนปุ่มลิงก์', type: 'text', max: 40, def: 'ดูรายละเอียด' },
      { n: 'start_at', label: 'เริ่มแสดง', type: 'datetime', blank: true, help: 'เว้นว่าง = แสดงทันที' },
      { n: 'end_at', label: 'หยุดแสดง', type: 'datetime', blank: true, help: 'เว้นว่าง = แสดงจนกว่าจะปิดใช้' },
      { n: 'frequency', label: 'แสดงซ้ำ', type: 'select', req: true, def: 'session', options: ['session', 'day', 'always'],
        labels: { session: 'ครั้งเดียวต่อการเปิดเว็บ (แนะนำ)', day: 'วันละครั้ง', always: 'ทุกครั้งที่เข้าหน้าแรก' } },
      { n: 'active', label: 'เปิดใช้', type: 'checkbox', def: 1, help: 'แสดงทีละ 1 ป๊อปอัป — ถ้าเปิดใช้หลายอัน จะแสดงอันที่ลำดับน้อยที่สุดที่อยู่ในช่วงเวลา' },
      { n: 'sort', label: 'ลำดับ', type: 'number', def: 0 },
    ],
    check: (v) => (v.start_at && v.end_at && v.end_at < v.start_at ? ['เวลาหยุดแสดงต้องอยู่หลังเวลาเริ่มแสดง'] : []),
  },
  services: {
    title: 'ระบบบริการออนไลน์', singular: 'ระบบบริการ', order: 'sort, id',
    columns: [['title', 'ชื่อระบบ'], ['audience', 'สำหรับ'], ['url', 'ลิงก์'], ['active', 'แสดง']],
    fields: [
      { n: 'title', label: 'ชื่อระบบ', type: 'text', req: true, max: 80 },
      { n: 'subtitle', label: 'คำอธิบายสั้น', type: 'text', max: 120 },
      { n: 'audience', label: 'สำหรับ', type: 'select', req: true, options: AUDIENCES },
      { n: 'icon', label: 'ไอคอน', type: 'select', options: Object.keys(ICONS), labels: ICONS },
      { n: 'url', label: 'ลิงก์', type: 'url', req: true },
      { n: 'sort', label: 'ลำดับ', type: 'number', def: 0 },
      { n: 'active', label: 'แสดงบนเว็บไซต์', type: 'checkbox', def: 1 },
    ],
  },
  programs: {
    title: 'หลักสูตรและการเรียนรู้', singular: 'หลักสูตร', order: 'sort, id',
    columns: [['title', 'ชื่อหลักสูตร'], ['title_en', 'ภาษาอังกฤษ'], ['sort', 'ลำดับ']],
    fields: [
      { n: 'title', label: 'ชื่อหลักสูตร / ระดับชั้น', type: 'text', req: true, max: 80 },
      { n: 'title_en', label: 'ชื่อภาษาอังกฤษ', type: 'text', max: 60 },
      { n: 'summary', label: 'คำอธิบายสั้น', type: 'textarea', max: 300 },
      { n: 'image', label: 'รูปภาพ', type: 'image', help: 'แนะนำสัดส่วน 4:3' },
      { n: 'link', label: 'ลิงก์รายละเอียด', type: 'url' },
      { n: 'sort', label: 'ลำดับ', type: 'number', def: 0 },
    ],
  },
  highlights: {
    title: 'จุดเด่นของโรงเรียน', singular: 'จุดเด่น', order: 'sort, id',
    columns: [['title', 'จุดเด่น'], ['subtitle', 'ข้อความรอง'], ['sort', 'ลำดับ']],
    fields: [
      { n: 'title', label: 'จุดเด่น', type: 'text', req: true, max: 60 },
      { n: 'subtitle', label: 'ข้อความรอง', type: 'text', max: 100 },
      { n: 'icon', label: 'ไอคอน', type: 'select', options: Object.keys(ICONS), labels: ICONS },
      { n: 'sort', label: 'ลำดับ', type: 'number', def: 0 },
    ],
  },
  messages: {
    title: 'ข้อความจากผู้ติดต่อ', singular: 'ข้อความ', order: 'id DESC', readonly: true,
    columns: [['name', 'ชื่อ'], ['email', 'อีเมล'], ['created_at', 'วันที่']],
    fields: [
      { n: 'name', label: 'ชื่อ', type: 'text' }, { n: 'email', label: 'อีเมล', type: 'text' },
      { n: 'phone', label: 'โทรศัพท์', type: 'text' }, { n: 'message', label: 'ข้อความ', type: 'textarea' },
      { n: 'created_at', label: 'วันที่', type: 'text' },
    ],
  },
};

export const settingsFields = [
  { group: 'ข้อมูลโรงเรียน' },
  { n: 'school_name', label: 'ชื่อโรงเรียน (ไทย)', type: 'text', req: true, max: 100 },
  { n: 'school_name_en', label: 'ชื่อโรงเรียน (อังกฤษ)', type: 'text', max: 100 },
  { n: 'tagline', label: 'คำขวัญ', type: 'text', max: 150 },
  { n: 'agency', label: 'สังกัด (แสดงที่แถบบนสุด)', type: 'text', max: 150 },
  { n: 'logo', label: 'โลโก้โรงเรียน', type: 'image', help: 'ภาพ PNG/WebP พื้นหลังโปร่งใส แนะนำสี่เหลี่ยมจัตุรัส' },
  { group: 'สีประจำโรงเรียน' },
  { n: 'primary', label: 'สีหลัก (แถบเมนู ส่วนท้ายเว็บ หัวข้อ)', type: 'color' },
  { n: 'accent', label: 'สีเน้น (ปุ่มสำคัญ เช่น สมัครเรียน)', type: 'color',
    help: 'ค่าเริ่มต้นโทนเดียวกับ ม.ราชภัฏรำไพพรรณี: สีหลัก #02934a (เขียว) สีเน้น #ec0b6d (ชมพู) · โทนกรมท่า–ทอง: #0f2d5c / #f2b705 — ระบบปรับปุ่มให้เข้มขึ้นเล็กน้อยเองถ้าตัวอักษรอ่านยาก' },
  { group: 'ประกาศด่วน (แถบใต้เมนูหลัก)' },
  { n: 'announce_on', label: 'แสดงแถบประกาศด่วน', type: 'checkbox' },
  { n: 'announce_text', label: 'ข้อความประกาศ', type: 'text', max: 200 },
  { n: 'announce_link', label: 'ลิงก์ "ดูรายละเอียด"', type: 'url' },
  { group: 'หน้าแรก' },
  { n: 'about_title', label: 'หัวข้อแนะนำโรงเรียน', type: 'text', max: 150 },
  { n: 'about_text', label: 'ข้อความแนะนำโรงเรียน', type: 'textarea', max: 1000 },
  { n: 'admission_title', label: 'แบนเนอร์รับสมัคร: หัวข้อ', type: 'text', max: 150 },
  { n: 'admission_text', label: 'แบนเนอร์รับสมัคร: ข้อความ', type: 'text', max: 250 },
  { n: 'admission_link', label: 'แบนเนอร์รับสมัคร: ลิงก์', type: 'url' },
  { n: 'tour_url', label: 'วิดีโอแนะนำโรงเรียน / Virtual Tour (ลิงก์ YouTube)', type: 'url', help: 'เว้นว่างได้ — หน้าแรกจะแสดงข้อความแนะนำโรงเรียนแทน' },
  { group: 'ข้อมูลติดต่อ' },
  { n: 'phone', label: 'โทรศัพท์', type: 'text', max: 40 },
  { n: 'email', label: 'อีเมล', type: 'text', max: 100 },
  { n: 'address', label: 'ที่อยู่', type: 'textarea', max: 300 },
  { n: 'hours', label: 'เวลาทำการ', type: 'text', max: 100 },
  { n: 'facebook', label: 'Facebook (ลิงก์)', type: 'url' },
  { n: 'youtube', label: 'YouTube (ลิงก์ช่อง)', type: 'url' },
  { n: 'line_url', label: 'LINE (ลิงก์ เช่น https://lin.ee/…)', type: 'url' },
  { n: 'map_query', label: 'คำค้นแผนที่ Google Maps', type: 'text', max: 150, help: 'เช่น ชื่อโรงเรียนและจังหวัด — แผนที่จะโหลดเมื่อผู้ชมกดแสดงเท่านั้น' },
  { n: 'footer_text', label: 'ข้อความท้ายเว็บ', type: 'text', max: 150 },
];
