// นิยามเนื้อหาที่จัดการได้ในหลังบ้าน — ฟอร์ม, การตรวจสอบ, ตารางรายการ สร้างจากไฟล์นี้ทั้งหมด
export const CATEGORIES = ['ประชาสัมพันธ์', 'กิจกรรม', 'ประกาศ', 'รับสมัคร', 'วิชาการ'];

export const ICONS = {
  graduation: 'หมวกบัณฑิต / รางวัล', book: 'หนังสือ', calendar: 'ปฏิทิน', users: 'กลุ่มคน',
  file: 'เอกสาร', phone: 'โทรศัพท์', star: 'ดาว', building: 'อาคาร', heart: 'หัวใจ',
  monitor: 'คอมพิวเตอร์', globe: 'โลก', mail: 'อีเมล',
};

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
      { n: 'body', label: 'เนื้อหา', type: 'richtext', max: 100000 },
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
      { n: 'value', label: 'ตัวเลข', type: 'number', req: true, def: 0 },
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
  { n: 'logo', label: 'โลโก้โรงเรียน', type: 'image', help: 'ภาพ PNG/WebP พื้นหลังโปร่งใส แนะนำสี่เหลี่ยมจัตุรัส' },
  { group: 'สีประจำโรงเรียน' },
  { n: 'primary', label: 'สีหลัก', type: 'color' },
  { n: 'accent', label: 'สีเน้น', type: 'color' },
  { group: 'หน้าแรก' },
  { n: 'about_title', label: 'หัวข้อแนะนำโรงเรียน', type: 'text', max: 150 },
  { n: 'about_text', label: 'ข้อความแนะนำโรงเรียน', type: 'textarea', max: 1000 },
  { n: 'admission_title', label: 'แบนเนอร์รับสมัคร: หัวข้อ', type: 'text', max: 150 },
  { n: 'admission_text', label: 'แบนเนอร์รับสมัคร: ข้อความ', type: 'text', max: 250 },
  { n: 'admission_link', label: 'แบนเนอร์รับสมัคร: ลิงก์', type: 'url' },
  { group: 'ข้อมูลติดต่อ' },
  { n: 'phone', label: 'โทรศัพท์', type: 'text', max: 40 },
  { n: 'email', label: 'อีเมล', type: 'text', max: 100 },
  { n: 'address', label: 'ที่อยู่', type: 'textarea', max: 300 },
  { n: 'hours', label: 'เวลาทำการ', type: 'text', max: 100 },
  { n: 'facebook', label: 'Facebook (ลิงก์)', type: 'url' },
  { n: 'footer_text', label: 'ข้อความท้ายเว็บ', type: 'text', max: 150 },
];
