// นิยามเนื้อหาที่จัดการได้ในหลังบ้าน — ฟอร์ม, การตรวจสอบ, ตารางรายการ สร้างจากไฟล์นี้ทั้งหมด
import { db } from './db.js';
import { LAYOUTS } from './staff.js';
import { POPUP_STYLES, POPUP_SIZES, resetMourning } from './popups.js';
import { SECTION_COLORS } from './colors.js';
import { JOURNAL_SECTIONS, JOURNAL_LAYOUTS, ISSUE_STATUS, journalName, monthOptions, monthLabels, todayTH, ymSlug } from './journal.js';

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
// ช่องลิงก์โฟลเดอร์ Google Drive (ใช้ร่วมกันหลายฟอร์ม)
const DRIVE_HELP = 'วางลิงก์โฟลเดอร์ Google Drive ที่แชร์แบบ “ทุกคนที่มีลิงก์ดูได้” — รูปในโฟลเดอร์แสดงบนเว็บเอง เพิ่มรูปภายหลังได้ (ระบบอัปเดตทุก 6 ชั่วโมง)';

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
    title: 'ข่าวสารและประกาศ', singular: 'ข่าว', order: 'created_at DESC', view: (row) => `/news/${row.id}`,
    columns: [['title', 'หัวข้อ'], ['category', 'หมวดหมู่'], ['published', 'เผยแพร่'], ['created_at', 'วันที่']],
    fields: [
      { n: 'title', label: 'หัวข้อข่าว', type: 'text', req: true, max: 200 },
      { n: 'category', label: 'หมวดหมู่', type: 'select', options: CATEGORIES, req: true },
      { n: 'excerpt', label: 'คำโปรย (แสดงในหน้าแรก)', type: 'textarea', max: 300 },
      { n: 'body', label: 'เนื้อหา', type: 'richtext', max: 50000 },
      { n: 'image', label: 'รูปหน้าปก', type: 'image', help: 'JPG / PNG / WebP ไม่เกิน 5 MB (แนะนำสัดส่วน 16:9)' },
      { n: 'drive_url', label: 'ภาพกิจกรรมจาก Google Drive (ลิงก์โฟลเดอร์)', type: 'gdrive', help: `${DRIVE_HELP} — แสดงเป็นอัลบั้มท้ายข่าว` },
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
    title: 'หน้าเว็บไซต์', singular: 'หน้า', order: 'sort, id', view: (row) => `/p/${row.slug}`,
    columns: [['title', 'ชื่อหน้า'], ['menu_group', 'กลุ่มเมนู'], ['in_menu', 'อยู่ในเมนู'], ['published', 'เผยแพร่']],
    fields: [
      { n: 'title', label: 'ชื่อหน้า', type: 'text', req: true, max: 120 },
      { n: 'slug', label: 'ชื่อในลิงก์ (ภาษาอังกฤษ)', type: 'slug', req: true, max: 60, help: 'เช่น about → /p/about' },
      { n: 'menu_group', label: 'กลุ่มเมนู', type: 'text', max: 40, help: 'หน้าที่ใช้ชื่อกลุ่มเดียวกันจะรวมเป็นเมนูย่อยเดียวกัน' },
      { n: 'layout', label: 'รูปแบบหน้า', type: 'select', req: true, def: 'page', options: Object.keys(LAYOUTS), labels: LAYOUTS,
        help: 'ทำเนียบบุคคล: แสดงการ์ดรูป ชื่อ ตำแหน่ง — เพิ่ม/แก้รายชื่อได้จากปุ่มบนหน้าเว็บ (เมื่อเข้าสู่ระบบ) หรือเมนู “บุคลากรและคณะกรรมการ”' },
      { n: 'head_label', label: 'ป้ายของหัวหน้า / คนปัจจุบัน (หน้าทำเนียบ)', type: 'text', max: 40, help: 'เช่น หัวหน้ากลุ่มสาระ · ประธานกรรมการ · ผู้อำนวยการโรงเรียน' },
      { n: 'head_last', label: 'เรียงจากคนแรกถึงคนปัจจุบัน — คนปัจจุบันอยู่ท้ายสุด', type: 'checkbox', def: 0, help: 'สำหรับทำเนียบผู้บริหาร (ปกติหัวหน้า/ประธานอยู่บนสุด)' },
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
  albums: {
    title: 'อัลบั้มภาพ (Google Drive)', singular: 'อัลบั้ม', order: 'album_date DESC, id DESC', view: (row) => `/gallery/${row.id}`,
    columns: [['title', 'ชื่ออัลบั้ม'], ['album_date', 'วันที่'], ['drive_url', 'รูปจาก Google Drive'], ['published', 'แสดง']],
    fields: [
      { n: 'title', label: 'ชื่ออัลบั้ม / กิจกรรม', type: 'text', req: true, max: 200 },
      { n: 'album_date', label: 'วันที่จัดกิจกรรม', type: 'date', req: true, def: todayTH },
      { n: 'drive_url', label: 'ลิงก์โฟลเดอร์ Google Drive', type: 'gdrive', req: true, help: DRIVE_HELP },
      { n: 'image', label: 'รูปปกอัลบั้ม', type: 'image', help: 'ไม่ใส่ก็ได้ — ใช้รูปแรกในโฟลเดอร์เป็นปก' },
      { n: 'detail', label: 'รายละเอียด', type: 'textarea', max: 1000 },
      { n: 'published', label: 'แสดงบนเว็บไซต์', type: 'checkbox', def: 1 },
    ],
  },
  journal_entries: {
    get title() { return `${journalName()} — บทความรายเดือน`; }, singular: 'บทความ', order: 'entry_date DESC, sort, id DESC', anchor: 'art',
    view: (row) => (/^\d{4}-\d\d/.test(row.entry_date || '') ? `/journal/${ymSlug(row.entry_date.slice(0, 7))}#art-${row.id}` : ''),
    columns: [['title', 'บทความ'], ['section', 'หมวด'], ['layout', 'รูปแบบ'], ['entry_date', 'วันที่'], ['published', 'ลงในเล่ม']],
    fields: [
      { n: 'title', label: 'หัวข้อ', type: 'text', req: true, max: 160 },
      { n: 'section', label: 'หมวด', type: 'select', req: true, def: 'activity', options: Object.keys(JOURNAL_SECTIONS), labels: JOURNAL_SECTIONS },
      { n: 'entry_date', label: 'วันที่', type: 'date', req: true, def: todayTH,
        help: 'บทความอยู่ในเล่มของเดือนนี้ — ระบบรวมเป็นเล่มและเผยแพร่ให้อัตโนมัติวันที่ 1 ของเดือนถัดไป' },
      { n: 'author', label: 'ผู้เขียน / ฝ่ายที่รับผิดชอบ', type: 'text', max: 120 },
      { n: 'layout', label: 'รูปแบบการจัดหน้า', type: 'select', req: true, def: 'top', options: Object.keys(JOURNAL_LAYOUTS), labels: JOURNAL_LAYOUTS,
        help: 'ระบบจัดวางรูปและข้อความในเล่มให้เองตามรูปแบบที่เลือก' },
      { n: 'image', label: 'รูปหลัก', type: 'image', help: 'รูปเด่นของบทความ (รูปแบบ “ภาพเต็มหน้า” ใช้รูปนี้เป็นพื้นหลังทั้งหน้า)' },
      { n: 'images', label: 'รูปประกอบเพิ่มเติม', type: 'images' },
      { n: 'body', label: 'เนื้อหา', type: 'richtext', max: 20000, help: 'เขียนยาวได้ ระบบแบ่งหน้าให้เอง' },
      { n: 'drive_url', label: 'หรือรูปจาก Google Drive (ลิงก์โฟลเดอร์)', type: 'gdrive', help: `${DRIVE_HELP} — ใช้แทนการอัปโหลดรูปประกอบได้` },
      { n: 'link', label: 'ลิงก์อ่านต่อ (ถ้ามี)', type: 'url', help: 'เช่น /news/123 — แสดงเป็นลิงก์ท้ายบทความ' },
      { n: 'sort', label: 'ลำดับในเล่ม', type: 'number', def: 0, help: 'ในหมวดเดียวกัน เลขน้อยขึ้นก่อน' },
      { n: 'published', label: 'ลงในเล่ม', type: 'checkbox', def: 1 },
    ],
  },
  journal_issues: {
    get title() { return `${journalName()} — เล่มและปก`; }, singular: 'เล่ม', order: 'ym DESC', view: (row) => `/journal/${ymSlug(row.ym)}`,
    columns: [['ym', 'เดือน'], ['status', 'การเผยแพร่'], ['number', 'ฉบับที่'], ['link', 'ลิงก์ภายนอก']],
    fields: [
      { n: 'ym', label: 'เล่มประจำเดือน', type: 'select', req: true, get options() { return monthOptions(); }, get labels() { return monthLabels(); } },
      { n: 'status', label: 'การเผยแพร่', type: 'select', req: true, def: 'auto', options: Object.keys(ISSUE_STATUS), labels: ISSUE_STATUS },
      { n: 'number', label: 'ฉบับที่', type: 'number', help: 'เว้นว่าง = นับต่อจากเล่มก่อนหน้าให้เอง' },
      { n: 'volume', label: 'ปีที่', type: 'number', help: 'ไม่บังคับ' },
      { n: 'image', label: 'รูปปก', type: 'image', help: 'ไม่ใส่ก็ได้ — ใช้รูปของบทความแรกในเล่ม' },
      { n: 'editorial', label: 'บรรณาธิการแถลง', type: 'textarea', max: 1500, help: 'แสดงหน้าที่ 2 คู่กับสารบัญ' },
      { n: 'credits', label: 'คณะผู้จัดทำ', type: 'textarea', max: 1000, help: 'แสดงที่ปกหลัง — บรรทัดละ 1 คน/ตำแหน่ง' },
      { n: 'link', label: 'ลิงก์ E-Book ภายนอก (ถ้ามี)', type: 'url', help: 'เช่น AnyFlip หรือไฟล์ PDF — ถ้าใส่ ชั้นหนังสือจะเปิดลิงก์นี้แทนเล่มที่ระบบรวมให้' },
    ],
    check: (v, existing, id) => (db.prepare('SELECT 1 FROM journal_issues WHERE ym=? AND id<>?').get(v.ym, id || 0) ? ['เดือนนี้มีการตั้งค่าเล่มอยู่แล้ว — แก้ไขรายการเดิมแทน'] : []),
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
    title: 'ผลงานและรางวัล', singular: 'ผลงาน', order: 'award_date DESC, id DESC', anchor: 'aw', view: (row) => `/awards/${row.id}`,
    columns: [['title', 'ผลงาน / รางวัล'], ['owner', 'ผลงานของ'], ['level', 'ระดับ'], ['award_date', 'วันที่'], ['published', 'แสดง']],
    fields: [
      { n: 'title', label: 'ชื่อผลงาน / รางวัล', type: 'text', req: true, max: 200, help: 'เช่น เหรียญทอง การแข่งขันหุ่นยนต์ งานศิลปหัตถกรรมนักเรียน ครั้งที่ 72' },
      { n: 'owner', label: 'ผลงานของ', type: 'select', req: true, def: 'student', options: Object.keys(AWARD_OWNERS), labels: AWARD_OWNERS,
        help: 'แสดงเป็นป้ายบนรายการผลงาน — ผลงานทุกประเภทรวมอยู่ในรายการเดียวกัน' },
      { n: 'people', label: 'ผู้ได้รับรางวัล / เจ้าของผลงาน', type: 'text', max: 200, help: 'เช่น ด.ญ.… ชั้น ม.2/1 · ครู… กลุ่มสาระคณิตศาสตร์ (เว้นว่างได้)' },
      { n: 'level', label: 'ระดับ', type: 'select', options: Object.keys(AWARD_LEVELS), labels: AWARD_LEVELS },
      { n: 'award_date', label: 'วันที่ได้รับ', type: 'date', req: true, def: todayTH },
      { n: 'award_time', label: 'เวลา', type: 'time', help: 'ไม่บังคับ — เช่น เวลาประกาศผล หรือเวลาพิธีมอบรางวัล' },
      { n: 'detail', label: 'รายละเอียด', type: 'richtext', max: 20000, help: 'เล่าที่มาของผลงาน หน่วยงานที่มอบ ครูผู้ฝึกสอน ผลการแข่งขัน ฯลฯ' },
      { n: 'image', label: 'รูปหลัก', type: 'image', help: 'แสดงบนการ์ดผลงานและด้านบนของหน้ารายละเอียด' },
      { n: 'images', label: 'รูปภาพเพิ่มเติม', type: 'images', help: 'รูปบรรยากาศ เกียรติบัตร ถ้วยรางวัล — กดดูทีละรูปแบบเต็มจอได้' },
      { n: 'drive_url', label: 'รูปจาก Google Drive (ถ้ามี)', type: 'gdrive', help: DRIVE_HELP },
      { n: 'files', label: 'เอกสารแนบ', type: 'files', help: 'เช่น ประกาศผล เกียรติบัตร คำสั่ง — ผู้ชมเปิด/ดาวน์โหลดได้จากหน้ารายละเอียด' },
      { n: 'link', label: 'ลิงก์ข่าว / เว็บไซต์ที่เกี่ยวข้อง', type: 'url', help: 'เช่น /news/123 หรือเว็บไซต์ของผู้จัดการแข่งขัน' },
      { n: 'published', label: 'แสดงบนเว็บไซต์', type: 'checkbox', def: 1 },
    ],
  },
  popups: {
    title: 'ป๊อปอัปก่อนเข้าเว็บ', singular: 'ป๊อปอัป', order: 'active DESC, sort, id',
    columns: [['title', 'หัวข้อ'], ['style', 'รูปแบบ'], ['start_at', 'เริ่มแสดง'], ['end_at', 'หยุดแสดง'], ['active', 'เปิดใช้']],
    view: (row) => `/?popup=${row.id}`, viewLabel: 'ดูตัวอย่าง',
    fields: [
      { n: 'title', label: 'หัวข้อ', type: 'text', req: true, max: 120, help: 'เช่น ยินดีต้อนรับ · ขอเชิญร่วมงาน… · ขอน้อมส่งเสด็จสู่สวรรคาลัย' },
      { n: 'style', label: 'รูปแบบ', type: 'select', req: true, def: 'card', options: Object.keys(POPUP_STYLES), labels: POPUP_STYLES,
        help: 'โปสเตอร์และไว้อาลัยแสดงภาพเต็มขนาด (ภาพแนวตั้งได้) ตัวอักษรเล็กอยู่ใต้ภาพ' },
      { n: 'size', label: 'ขนาด', type: 'select', req: true, def: 'm', options: Object.keys(POPUP_SIZES), labels: POPUP_SIZES },
      { n: 'image', label: 'รูปภาพ / โปสเตอร์', type: 'image', help: 'ไม่ใส่รูป: แบบการ์ดใช้ภาพโรงเรียน · แบบไว้อาลัยแสดงโบว์ดำขนาดใหญ่แทน' },
      { n: 'show_title', label: 'แสดงหัวข้อใต้ภาพ', type: 'checkbox', def: 1, help: 'ไม่ติ๊ก = แสดงเฉพาะภาพและข้อความ (หัวข้อยังใช้เป็นคำอธิบายภาพสำหรับผู้พิการทางสายตา)' },
      { n: 'body', label: 'ข้อความ', type: 'textarea', max: 600, help: 'แบบโปสเตอร์/ไว้อาลัยแสดงเป็นตัวอักษรขนาดเล็กใต้ภาพ' },
      { n: 'link', label: 'ลิงก์รายละเอียด', type: 'url', help: 'เว้นว่างได้ — ถ้าใส่ จะมีปุ่มไปยังลิงก์นี้ และกดที่รูปได้' },
      { n: 'link_text', label: 'ข้อความบนปุ่มลิงก์', type: 'text', max: 40, def: 'ดูรายละเอียด' },
      { group: 'ช่วงไว้อาลัย (มีผลกับทุกหน้า ตลอดช่วงเวลาที่ป๊อปอัปนี้เปิดใช้)' },
      { n: 'ribbon', label: 'แสดงโบว์ดำไว้อาลัยที่มุมซ้ายบนของเว็บไซต์', type: 'checkbox', def: 0 },
      { n: 'mono', label: 'ปรับเว็บไซต์เป็นโทนขาวดำ', type: 'checkbox', def: 0, help: 'ตามธรรมเนียมการไว้ทุกข์ของหน่วยงานราชการ' },
      { group: 'ช่วงเวลาและการแสดงซ้ำ' },
      { n: 'start_at', label: 'เริ่มแสดง', type: 'datetime', blank: true, help: 'เว้นว่าง = แสดงทันที' },
      { n: 'end_at', label: 'หยุดแสดง', type: 'datetime', blank: true, help: 'เว้นว่าง = แสดงจนกว่าจะปิดใช้' },
      { n: 'frequency', label: 'แสดงซ้ำ', type: 'select', req: true, def: 'session', options: ['session', 'day', 'always'],
        labels: { session: 'ครั้งเดียวต่อการเปิดเว็บ (แนะนำ)', day: 'วันละครั้ง', always: 'ทุกครั้งที่เข้าหน้าแรก' } },
      { n: 'active', label: 'เปิดใช้', type: 'checkbox', def: 1, help: 'แสดงทีละ 1 ป๊อปอัป — ถ้าเปิดใช้หลายอัน จะแสดงอันที่ลำดับน้อยที่สุดที่อยู่ในช่วงเวลา' },
      { n: 'sort', label: 'ลำดับ', type: 'number', def: 0 },
    ],
    check: (v) => (v.start_at && v.end_at && v.end_at < v.start_at ? ['เวลาหยุดแสดงต้องอยู่หลังเวลาเริ่มแสดง'] : []),
    afterSave: () => resetMourning(), onDelete: () => resetMourning(),
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

// หน้า "ปรับสีเว็บไซต์": สีหลัก 4 สี + สีแต่ละส่วน (ไม่บังคับ)
export const colorFields = [
  { group: 'สีประจำโรงเรียน (ทั้งเว็บไซต์)' },
  { n: 'primary', label: 'สีหลัก — ปุ่ม เมนูที่เลือก ลิงก์ และจุดเด่น', type: 'color' },
  { n: 'accent', label: 'สีรอง — ป้ายหมวดข่าว วันที่กิจกรรม ไอคอนแซม', type: 'color' },
  { n: 'dark', label: 'สีเข้ม — หัวข้อ แถบบนสุด ส่วนท้ายเว็บ', type: 'color' },
  { n: 'soft', label: 'สีพื้นอ่อน — พื้นหลังส่วนสลับ หัวหน้าเพจ แถบข้าง', type: 'color',
    help: 'ค่าเริ่มต้น ชมพู–ขาวเป็นหลัก แซมเขียว: สีหลัก #e01371 · สีรอง #357c53 · สีเข้ม #0a351d · สีพื้นอ่อน #fef3f6 — ระบบปรับสีให้เข้ม/อ่อนลงเองถ้าตัวอักษรอ่านยาก' },
  { group: 'สีแต่ละส่วน (ไม่บังคับ — ติ๊ก “ใช้สีตามธีม” = ใช้สีประจำโรงเรียนด้านบน)' },
  ...Object.entries(SECTION_COLORS).map(([n, d]) => ({ n, label: d.label, type: 'coloropt' })),
];

export const settingsFields = [
  { group: 'ข้อมูลโรงเรียน' },
  { n: 'school_name', label: 'ชื่อโรงเรียน (ไทย)', type: 'text', req: true, max: 100 },
  { n: 'school_name_en', label: 'ชื่อโรงเรียน (อังกฤษ)', type: 'text', max: 100 },
  { n: 'tagline', label: 'คำขวัญ', type: 'text', max: 150 },
  { n: 'agency', label: 'สังกัด (แสดงที่แถบบนสุด)', type: 'text', max: 150 },
  { n: 'logo', label: 'โลโก้โรงเรียน', type: 'image', help: 'ภาพ PNG/WebP พื้นหลังโปร่งใส แนะนำสี่เหลี่ยมจัตุรัส' },
  { group: 'ประกาศด่วน (แถบใต้เมนูหลัก)' },
  { n: 'announce_on', label: 'แสดงแถบประกาศด่วน', type: 'checkbox' },
  { n: 'announce_text', label: 'ข้อความประกาศ', type: 'text', max: 200 },
  { n: 'announce_link', label: 'ลิงก์ "ดูรายละเอียด"', type: 'url' },
  { group: 'วารสารรายเดือน (E-book)' },
  { n: 'journal_name', label: 'ชื่อวารสาร', type: 'text', max: 60, help: 'แสดงบนปกและเมนู เช่น เบญจมาฯ สาร' },
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
  { n: 'facebook', label: 'Facebook (ลิงก์เพจ)', type: 'url', help: 'เช่น https://www.facebook.com/benjamanusornschool/' },
  { n: 'fb_embed', label: 'แสดงเพจ Facebook แบบย่อ (หัวเพจ ปุ่มติดตาม) ที่ส่วนท้ายเว็บไซต์', type: 'checkbox' },
  { n: 'fb_autoload', label: 'โหลดโพสต์ Facebook ทันที โดยผู้ชมไม่ต้องกด', type: 'checkbox',
    help: 'ไม่ติ๊ก (แนะนำ) = ผู้ชมกด “แสดง” ก่อน ระบบจำไว้ครั้งต่อไปโหลดเอง — Facebook บันทึกคุกกี้ของผู้ชมเมื่อโหลดเพจ' },
  { n: 'youtube', label: 'YouTube (ลิงก์ช่อง)', type: 'url' },
  { n: 'line_url', label: 'LINE (ลิงก์ เช่น https://lin.ee/…)', type: 'url' },
  { n: 'map_query', label: 'คำค้นแผนที่ Google Maps', type: 'text', max: 150, help: 'เช่น ชื่อโรงเรียนและจังหวัด — แผนที่จะโหลดเมื่อผู้ชมกดแสดงเท่านั้น' },
  { n: 'footer_text', label: 'ข้อความท้ายเว็บ', type: 'text', max: 150 },
];
