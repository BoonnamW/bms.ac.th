// ค่าเริ่มต้นของส่วนต่าง ๆ ในหน้าเว็บ (เมนูหลัก ระบบบริการ หลักสูตร จุดเด่น เมนูลัด) — สร้างจากข้อมูลที่มีอยู่แล้ว
// เรียกหลังนำเข้าข้อมูล และทุกครั้งที่เปิดเซิร์ฟเวอร์: เติมเฉพาะส่วนที่ยังว่าง ไม่ทับสิ่งที่แก้ไขในหลังบ้าน
import { db, getSettings } from './db.js';
import { STAFF_GROUP, extractStaff } from './staff.js';

// สีเว็บ: โทนชมพู–เขียวเดียวกับสีประจำ ม.ราชภัฏรำไพพรรณี (ชมพู C0 M100 Y30 K0, เขียว C90 M20 Y100 K0 แปลงเป็นสีหน้าจอ)
export const SCHOOL_COLORS = { primary: '#02934a', accent: '#ec0b6d' };

const one = (sql, ...a) => db.prepare(sql).get(...a);
const all = (sql, ...a) => db.prepare(sql).all(...a);
const isEmpty = (table) => !one(`SELECT 1 FROM ${table} LIMIT 1`);
// สร้างค่าเริ่มต้นแต่ละชุดครั้งเดียว — ถ้าเจ้าหน้าที่ลบทิ้งภายหลังจะไม่ถูกสร้างกลับมา (fn คืน false = ยังไม่มีข้อมูลต้นทาง ลองใหม่ครั้งหน้า)
export const SEED_FLAGS = ['menu', 'services', 'programs', 'highlights', 'links', 'settings', 'staff', 'people', 'colors', 'ext_links', 'popup', 'awards', 'awards_menu'];
function once(name, fn) {
  const key = `seeded_${name}`;
  if (one('SELECT 1 FROM settings WHERE key=?', key)) return;
  if (fn() === false) return;
  db.prepare("INSERT INTO settings (key,value) VALUES (?,'1') ON CONFLICT(key) DO UPDATE SET value='1'").run(key);
}
const decode = (s) => String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// หน้าเว็บที่นำเข้าจาก WordPress (อ้างด้วยรหัสหน้าเดิม) → { title, url }
function wpPage(id) {
  const target = one('SELECT target FROM legacy_urls WHERE path=?', `?id=${id}`)?.target;
  if (!target?.startsWith('/p/')) return null;
  const p = one('SELECT title FROM pages WHERE slug=? AND published=1', target.slice(3));
  return p ? { title: p.title, url: target } : null;
}
const pageBySlug = (slug) => {
  const p = one('SELECT title FROM pages WHERE slug=? AND published=1', slug);
  return p ? { title: p.title, url: `/p/${slug}` } : null;
};
const newsCat = (cat, title = cat) =>
  (one('SELECT 1 FROM news WHERE published=1 AND category=? LIMIT 1', cat) ? { title, url: `/news?cat=${cat}` } : null);

// ---------- ระบบบริการออนไลน์ (จากหน้ารวมลิงก์ที่นำเข้าจากเมนู e-Service เดิม) ----------
const SERVICE_RULES = [
  [/ชำระ|ค่าบำรุง/, 'ผู้ปกครอง', 'card'], [/infirmary|พยาบาล/i, 'นักเรียน', 'heart'],
  [/ลดเวลาเรียน/, 'นักเรียน', 'book'], [/ภาพกิจกรรม/, 'ทั่วไป', 'image'],
  [/ซ่อม/, 'ครูและบุคลากร', 'wrench'], [/จองห้อง/, 'ครูและบุคลากร', 'calendar'],
  [/คำสั่ง/, 'ครูและบุคลากร', 'file'], [/สารสนเทศ/, 'ครูและบุคลากร', 'database'],
  [/นโยบาย|แผนงาน/, 'ครูและบุคลากร', 'chart'],
];
function seedServices() {
  if (!isEmpty('services')) return;
  const page = one("SELECT body FROM pages WHERE slug='online-services'");
  if (!page) return false;
  const ins = db.prepare('INSERT INTO services (title,subtitle,icon,url,audience,sort,active) VALUES (?,?,?,?,?,?,1)');
  let n = 0;
  for (const m of String(page.body).matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)) {
    const title = decode(m[2]).trim();
    const [, audience, icon] = SERVICE_RULES.find(([re]) => re.test(title)) || [null, 'ทั่วไป', 'monitor'];
    ins.run(title.slice(0, 80), '', icon, decode(m[1]), audience, ++n * 10);
  }
}

// ---------- เมนูหลัก (โครงสร้างแบบเว็บโรงเรียน: เกี่ยวกับ · ข่าวสาร · วิชาการ · นักเรียน · ข้อมูลสารสนเทศ) ----------
function seedMenu(S) {
  if (!isEmpty('menu_items')) return;
  const pick = (...xs) => xs.flat().filter(Boolean);
  const service = (kw) => {
    const s = one('SELECT title, url FROM services WHERE active=1 AND title LIKE ?', `%${kw}%`);
    return s ? { title: s.title, url: s.url } : null;
  };
  const about = S.wp_imported === '1'
    ? pick([379, 382, 898, 907, 903, 4732, 905, 364, 9328].map(wpPage))
    : all("SELECT title, slug FROM pages WHERE published=1 AND in_menu=1 AND menu_group='เกี่ยวกับเรา' ORDER BY sort, id")
      .map((p) => ({ title: p.title, url: `/p/${p.slug}` }));
  const tree = [
    { title: 'หน้าหลัก', en: 'Home', url: '/' },
    { title: 'เกี่ยวกับโรงเรียน', en: 'About', children: about },
    { title: 'ข่าวสาร', en: 'News', children: pick(
      { title: 'ข่าวสารทั้งหมด', url: '/news' },
      newsCat('ประชาสัมพันธ์', 'ข่าวประชาสัมพันธ์'), newsCat('ประกาศ'), newsCat('กิจกรรม', 'ข่าวกิจกรรม'),
      newsCat('รับสมัคร', 'ข่าวรับสมัครนักเรียน'), newsCat('รับสมัครงาน', 'ข่าวรับสมัครงาน'), newsCat('จัดซื้อจัดจ้าง', 'ประกาศจัดซื้อจัดจ้าง'),
      { title: 'ปฏิทินกิจกรรม', url: '/calendar' }, { title: 'ภาพกิจกรรม', url: '/gallery' },
      pageBySlug('journal-archive'), wpPage(9981)) },
    { title: 'วิชาการ', en: 'Academics', children: pick(
      { title: 'หลักสูตรและการเรียนรู้', url: '/academics' }, newsCat('วิชาการ', 'ข่าววิชาการ'),
      wpPage(3357), wpPage(9347), service('ลดเวลาเรียน')) },
    { title: 'นักเรียน', en: 'Student Life', children: pick(
      wpPage(4706), newsCat('ผลงานนักเรียน'), wpPage(4986),
      { title: 'รับสมัครนักเรียน', url: S.admission_link || '/news' },
      { title: 'บริการสำหรับนักเรียนและผู้ปกครอง', url: '/portal#students' }) },
    { title: 'ข้อมูลสารสนเทศ', en: 'Data Center', children: pick(
      { title: 'ศูนย์ข้อมูลสารสนเทศ (Data Center)', url: '/data' },
      { title: 'เปิดเผยข้อมูลสาธารณะ (ITA / OIT)', url: '/ita' },
      { title: 'ระบบบริการออนไลน์ (e-Service)', url: '/portal' }, wpPage(1935)) },
    { title: 'ติดต่อเรา', en: 'Contact', url: '/contact' },
  ];
  const ins = db.prepare('INSERT INTO menu_items (title,title_en,url,parent_id,sort,active) VALUES (?,?,?,?,?,1)');
  tree.forEach((t, i) => {
    if (t.children && !t.children.length) return;
    const { lastInsertRowid } = ins.run(t.title, t.en, t.url || '', 0, (i + 1) * 10);
    (t.children || []).forEach((c, k) => ins.run(c.title.slice(0, 120), '', c.url, Number(lastInsertRowid), (k + 1) * 10));
  });
}

// ---------- หลักสูตร และจุดเด่นของโรงเรียน (ข้อเท็จจริงจากเว็บเดิม — แก้ไขได้ในหลังบ้าน) ----------
function seedPrograms() {
  if (!isEmpty('programs')) return;
  const img = (cat, offset = 0) => one(`SELECT image FROM news WHERE published=1 AND category=? AND image IS NOT NULL
    AND image NOT LIKE '%.pdf' ORDER BY created_at DESC LIMIT 1 OFFSET ?`, cat, offset)?.image || null;
  const rows = [
    ['มัธยมศึกษาตอนต้น', 'Lower Secondary', 'ชั้นมัธยมศึกษาปีที่ 1–3 ตามหลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน', img('ผลงานนักเรียน'), '/news?cat=วิชาการ'],
    ['มัธยมศึกษาตอนปลาย', 'Upper Secondary', 'ชั้นมัธยมศึกษาปีที่ 4–6 ตามหลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน', img('ผลงานนักเรียน', 1), '/news?cat=วิชาการ'],
    ['กลุ่มสาระการเรียนรู้', 'Learning Areas', '8 กลุ่มสาระการเรียนรู้ และงานสนับสนุนการสอน', img('วิชาการ'), wpPage(364)?.url || '/academics'],
    ['กิจกรรมพัฒนาผู้เรียน', 'Student Development', 'กิจกรรม ค่าย ชุมนุม และโครงการพัฒนาผู้เรียน', img('กิจกรรม'), '/news?cat=กิจกรรม'],
  ];
  const ins = db.prepare('INSERT INTO programs (title,title_en,summary,image,link,sort) VALUES (?,?,?,?,?,?)');
  rows.forEach((r, i) => ins.run(...r, (i + 1) * 10));
}
function seedHighlights() {
  if (!isEmpty('highlights')) return;
  const rows = [
    ['สถานศึกษาขนาดใหญ่พิเศษ', 'เปิดสอนชั้น ม.1 – ม.6', 'building'],
    ['ก่อตั้ง พ.ศ. 2535', 'ประวัติการพัฒนากว่า 34 ปี', 'award'],
    ['พื้นที่ 35 ไร่', 'อาคารเรียน หอประชุม และสนามกีฬา', 'pin'],
    ['8 กลุ่มสาระการเรียนรู้', 'ครูและบุคลากร 98 คน', 'book'],
    ['บริการออนไลน์ (e-Service)', 'สำหรับนักเรียน ผู้ปกครอง และครู', 'monitor'],
    ['เปิดเผยข้อมูลสาธารณะ', 'ตามเกณฑ์การประเมิน ITA / OIT', 'shield'],
  ];
  const ins = db.prepare('INSERT INTO highlights (title,subtitle,icon,sort) VALUES (?,?,?,?)');
  rows.forEach((r, i) => ins.run(...r, (i + 1) * 10));
}

// ---------- เมนูลัดใต้ภาพหน้าแรก: แทนชุดเดิมจากสคริปต์นำเข้า (เฉพาะเมื่อยังไม่ถูกแก้ไข) ----------
const OLD_LINKS = ['รับสมัครนักเรียน', 'บุคลากร', 'e-Service', 'เปิดเผยข้อมูล (ITA)', 'เบญจมาฯ สาร', 'ช่องทางร้องเรียน'];
function seedLinks(S) {
  const titles = all('SELECT title FROM links ORDER BY sort, id').map((r) => r.title);
  if (titles.length && titles.join('|') !== OLD_LINKS.join('|')) return; // เจ้าหน้าที่ปรับเองแล้ว หรือเป็นข้อมูลตัวอย่าง
  db.prepare('DELETE FROM links').run();
  const rows = [
    ['สมัครเรียน', 'Apply Now', 'graduation', S.admission_link || '/news?cat=รับสมัคร'],
    ['ปฏิทินกิจกรรม', 'School Calendar', 'calendar', '/calendar'],
    ['e-Service', 'บริการออนไลน์', 'monitor', '/portal'],
    ['ITA / OIT', 'ความโปร่งใส', 'shield', '/ita'],
    ['Data Center', 'ข้อมูลสารสนเทศ', 'database', '/data'],
    ['เบญจมาฯ สาร', 'วารสารโรงเรียน', 'book', pageBySlug('journal-archive') ? '/p/journal-archive' : '/news'],
  ];
  const ins = db.prepare('INSERT INTO links (title,subtitle,icon,url,sort) VALUES (?,?,?,?,?)');
  rows.forEach((r, i) => ins.run(...r, i + 1));
}

// ---------- ตัวเลขหน้าแรก: ชื่อภาษาอังกฤษและไอคอน ----------
const STAT_META = {
  'นักเรียน': ['Students', 'users'], 'ครูและบุคลากร': ['Teachers & Staff', 'graduation'],
  'คุณครูและบุคลากร': ['Teachers & Staff', 'graduation'], 'ห้องเรียน': ['Classrooms', 'building'],
  'ปีแห่งการก่อตั้ง': ['Years Established', 'award'], 'รางวัลระดับชาติ': ['National Awards', 'award'],
};
function seedStatMeta() {
  const up = db.prepare('UPDATE stats SET label_en=?, icon=? WHERE id=?');
  for (const s of all('SELECT id, label FROM stats WHERE label_en IS NULL')) {
    const [en, icon] = STAT_META[s.label] || ['', 'star'];
    up.run(en, icon, s.id);
  }
}

// ---------- ทำเนียบบุคลากร: ย้ายตาราง "รูป + ชื่อ" ของหน้ากลุ่มสาระเดิมมาเป็นรายชื่อที่แก้ไขได้ ----------
function seedStaff() {
  const depts = all('SELECT id, body FROM pages WHERE menu_group=? AND title<>?', STAFF_GROUP, STAFF_GROUP);
  if (!depts.length) return false;
  const ins = db.prepare('INSERT INTO staff (name,position,duty,page_id,is_head,image,sort) VALUES (?,?,?,?,?,?,?)');
  const setBody = db.prepare('UPDATE pages SET body=? WHERE id=?');
  for (const d of depts) {
    if (one('SELECT 1 FROM staff WHERE page_id=? LIMIT 1', d.id)) continue;
    const { people, rest } = extractStaff(d.body || '');
    if (!people.length) continue;
    people.forEach((p, i) => ins.run(p.name, p.position, p.duty, d.id, p.head ? 1 : 0, p.photo || null, (i + 1) * 10));
    setBody.run(rest, d.id); // รายชื่อย้ายไปอยู่ในระบบแล้ว เหลือเฉพาะเนื้อหาอื่น (ถ้ามี)
  }
  // หน้ารวมที่เป็นเพียงรายการลิงก์ไปหน้ากลุ่มสาระ → แสดงเป็นการ์ดกลุ่มสาระแทน
  const index = one('SELECT id, body FROM pages WHERE menu_group=? AND title=?', STAFF_GROUP, STAFF_GROUP);
  if (index && /^\s*<ul>(\s*<li>\s*<a [^>]*href="\/p\/[\w-]+"[^>]*>[^<]*<\/a>\s*<\/li>)+\s*<\/ul>\s*$/.test(index.body || '')) setBody.run('', index.id);
}

// ---------- หน้าทำเนียบบุคคล: ตั้งรูปแบบหน้า + ย้ายรายชื่อจากหน้าเดิมที่เป็นรูปคน ----------
const PEOPLE_PAGES = [ // รหัสหน้าเดิม (WordPress) → ป้ายของคนบนสุด
  [903, 'ประธานกรรมการ'], // คณะกรรมการสถานศึกษา
  [907, 'ผู้อำนวยการโรงเรียน'], // ทำเนียบผู้บริหาร
  [4732, 'ประธานเครือข่าย'], // กรรมการเครือข่ายผู้ปกครอง
];
function seedPeoplePages() {
  const setLayout = db.prepare("UPDATE pages SET layout=?, head_label=COALESCE(NULLIF(head_label,''), ?) WHERE id=? AND COALESCE(layout,'')=''");
  for (const p of all('SELECT id, title FROM pages WHERE menu_group=?', STAFF_GROUP)) {
    if (p.title === STAFF_GROUP) setLayout.run('people-index', '', p.id);
    else setLayout.run('people', 'หัวหน้ากลุ่มสาระ', p.id);
  }
  const ins = db.prepare('INSERT INTO staff (name,position,duty,page_id,is_head,image,sort) VALUES (?,?,?,?,?,?,?)');
  for (const [wpId, label] of PEOPLE_PAGES) {
    const target = one('SELECT target FROM legacy_urls WHERE path=?', `?id=${wpId}`)?.target;
    const page = target?.startsWith('/p/') && one('SELECT id, body FROM pages WHERE slug=?', target.slice(3));
    if (!page) continue;
    setLayout.run('people', label, page.id);
    if (one('SELECT 1 FROM staff WHERE page_id=? LIMIT 1', page.id)) continue;
    const { people, rest } = extractStaff(page.body || '');
    people.forEach((p, i) => ins.run(p.name, p.position, p.duty, page.id, p.head ? 1 : 0, p.photo || null, (i + 1) * 10));
    const body = (people.length ? rest : page.body || '')
      .replace(/<p>\s*<strong>ผู้บริหารท่าน[^<]*<\/strong>\s*<\/p>\s*/g, '') // หัวข้อ "ผู้บริหารท่านแรก" ที่เหลือจากรายชื่อเดิม
      .replace(/^\s*<p>อยู่ระหว่างปรับปรุงข้อมูล<\/p>\s*$/, '');
    db.prepare('UPDATE pages SET body=? WHERE id=?').run(body, page.id);
  }
}

// สีตั้งต้นเดิม (เขียวเข้ม–ชมพูอมแดง) → โทนใหม่ — ไม่เปลี่ยนถ้าเจ้าหน้าที่เลือกสีเองแล้ว
function seedColors() {
  const s = getSettings();
  if (s.primary !== '#1e6b4b' || s.accent !== '#c73670') return;
  const set = db.prepare('UPDATE settings SET value=? WHERE key=?');
  set.run(SCHOOL_COLORS.primary, 'primary');
  set.run(SCHOOL_COLORS.accent, 'accent');
}

// ---------- ลิงก์หน่วยงานภายนอก (จากเมนู "Link Web" ท้ายเว็บเดิม) ----------
const EXT_LINKS = [
  ['กระทรวงศึกษาธิการ', 'http://www.moe.go.th'],
  ['สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน', 'http://www.obec.go.th'],
  ['สพม.17', 'http://www.sesa17.go.th'],
  ['สำนักงานศึกษาธิการจังหวัดจันทบุรี', 'http://www.suksachan.go.th'],
  ['โรงพยาบาลพระปกเกล้า', 'https://ppk2026.ppkhosp.go.th/th'],
  ['สำนักงานสาธารณสุขจังหวัดจันทบุรี', 'https://sites.google.com/view/moph-chanthaburi/%E0%B8%AB%E0%B8%99%E0%B8%B2%E0%B9%81%E0%B8%A3%E0%B8%81'],
  ['โรงพยาบาลสิริเวช', 'https://plus.sirivejhospital.com/'],
  ['กรมป้องกันและบรรเทาสาธารณภัย', 'https://www.disaster.go.th/home'],
];
function seedExtLinks() {
  if (!isEmpty('ext_links')) return;
  const ins = db.prepare('INSERT INTO ext_links (title,url,sort) VALUES (?,?,?)');
  EXT_LINKS.forEach(([t, u], i) => ins.run(t, u, (i + 1) * 10));
}

// ---------- ผลงานและรางวัล: ชุดเริ่มต้นจากข่าวรางวัลของเว็บเดิม (ลิงก์ไปข่าวต้นทาง แก้ไข/เพิ่มได้ที่หลังบ้าน) ----------
const AWARDS = [ // [หัวข้อข่าวต้นทาง, ชื่อผลงาน, ประเภท, ระดับ, ผู้ได้รับ]
  ['รางวัลโรงเรียนต้นแบบลดเวลาเรียน - เพิ่มเวลารู้ : Active learning ระดับประเทศ',
    'รางวัลโรงเรียนต้นแบบ “ลดเวลาเรียน เพิ่มเวลารู้” (Active Learning)', 'school', 'ประเทศ', ''],
  ['รับรางวัล The Best of The Best ผลงานวิธีปฏิบัติที่เป็นเลิศ (Best Practice)',
    'รางวัล The Best of The Best ผลงานวิธีปฏิบัติที่เป็นเลิศ (Best Practice)', 'school', '', ''],
  ['รับโล่รางวัล “ระดับเพชร” โครงการสร้างเด็กและเยาวชนต้นแบบ รู้ รัก สามัคคี และสำนึกความเป็นไทย',
    'โล่รางวัลระดับเพชร โครงการสร้างเด็กและเยาวชนต้นแบบ รู้ รัก สามัคคี และสำนึกความเป็นไทย', 'school', '', ''],
  ['ร่วมแสดงความยินดีกับคุณครู ที่ได้รับการเลื่อนวิทยฐานะ ตามเกณฑ์ วPA', 'ครูได้รับการเลื่อนวิทยฐานะตามเกณฑ์ ว PA', 'teacher', '', ''],
  ['มอบช่อดอกไม้แสดงความยินดีเนื่องในโอกาสบุคลากรครูที่ได้รับการเลื่อนวิทยฐานะเป็นครูชำนาญการพิเศษ(คศ.3',
    'ครูได้รับการเลื่อนวิทยฐานะเป็นครูชำนาญการพิเศษ (คศ.3)', 'teacher', '', ''],
  ['รางวัลกรรมการและเลขานุการสถานศึกษาขั้นพื้นฐานดีเด่น', 'รางวัลกรรมการและเลขานุการสถานศึกษาขั้นพื้นฐานดีเด่น', 'teacher', '', ''],
  ['พิธีมอบโล่รางวัลและเกียรติบัตรข้าราชการครูและบุคลากรทางการศึกษา ประจำปี 2564',
    'โล่รางวัลและเกียรติบัตรข้าราชการครูและบุคลากรทางการศึกษา ประจำปี 2564', 'teacher', '', ''],
  ['ขอแสดงความยินดีกับเนื่องในโอกาสบุคลากรครูทั้ง4 ท่านได้รับการเลื่อนวิทยฐานะเป็นครูชำนาญการพิเศษ(คศ.3)',
    'ครู 4 ท่านได้รับการเลื่อนวิทยฐานะเป็นครูชำนาญการพิเศษ (คศ.3)', 'teacher', '', ''],
  ['พิธีมอบรางวัลยกย่องเชิดชูเกียรติผู้ประกอบวิชาชีพทางการศึกษา ประจำปี 2564',
    'รางวัลยกย่องเชิดชูเกียรติผู้ประกอบวิชาชีพทางการศึกษา ประจำปี 2564', 'teacher', '', ''],
  ['รางวัลเหรียญทอง ในการเเข่งขันกีฬาเปตอง ประเภทคู่ผสม กีฬาเยาวชนแห่งชาติ ครั้งที่ 39 ราชบุรีเกมส์',
    'เหรียญทอง กีฬาเปตอง ประเภทคู่ผสม กีฬาเยาวชนแห่งชาติ ครั้งที่ 39 “ราชบุรีเกมส์”', 'student', 'ประเทศ', ''],
  ['การแข่งขันงานศิลปหัตถกรรมนักเรียน ครั้งที่ 71 ปีการศึกษา 2566', 'การแข่งขันงานศิลปหัตถกรรมนักเรียน ครั้งที่ 71 ปีการศึกษา 2566', 'student', '', ''],
  ['เยาวชนต้นแบบเก่งและดี TO BE NUMBER ONE IDOL รุ่น 12', 'เยาวชนต้นแบบเก่งและดี TO BE NUMBER ONE IDOL รุ่น 12', 'student', '', ''],
  ['มอบเกียรติบัตรความดี เข็มเชิดชูเกียรติสภานักเรียนและมอบเกียรติบัตรห้องเรียนสีขาว',
    'เกียรติบัตรความดี เข็มเชิดชูเกียรติสภานักเรียน และห้องเรียนสีขาว', 'student', 'โรงเรียน', 'สภานักเรียน'],
  ['การแข่งขันจรวดขวดน้ำ ระดับประเทศครั้งที่ 18 รอบคัดเลือก', 'การแข่งขันจรวดขวดน้ำ ระดับประเทศ ครั้งที่ 18 (รอบคัดเลือก)', 'student', 'ประเทศ', ''],
  ['การแข่งขันเครื่องบินพลังยาง งานศิลปหัตถกรรมนักเรียนครั้งที่ 69', 'การแข่งขันเครื่องบินพลังยาง งานศิลปหัตถกรรมนักเรียน ครั้งที่ 69', 'student', '', ''],
  ['การแข่งขันงานศิลปหัตถกรรมนักเรียน ครั้งที่ 69 กลุ่มสาระการเรียนรู้ภาษาต่างประเทศ (ภาษาจีน)',
    'การแข่งขันงานศิลปหัตถกรรมนักเรียน ครั้งที่ 69 ภาษาต่างประเทศ (ภาษาจีน)', 'student', '', ''],
  ['งานศิลปหัตถกรรม ครั้งที่ 69 ระดับเขตพื้นที่การศึกษา สพม.17', 'งานศิลปหัตถกรรมนักเรียน ครั้งที่ 69 ระดับเขตพื้นที่การศึกษา', 'student', 'เขตพื้นที่', ''],
];
function seedAwards() {
  if (!isEmpty('awards')) return;
  const ins = db.prepare('INSERT INTO awards (title,owner,level,people,award_date,link,image) VALUES (?,?,?,?,?,?,?)');
  const norm = (t) => String(t).replace(/\s+/g, ' ').trim(); // หัวข้อข่าวเดิมบางข่าวมีช่องว่างแบบ &nbsp;
  const byTitle = new Map(all('SELECT id, title, image, created_at FROM news WHERE published=1').map((x) => [norm(x.title), x]));
  let n = 0;
  for (const [src, title, owner, level, people] of AWARDS) {
    const news = byTitle.get(norm(src));
    if (!news) continue;
    const day = new Date(`${news.created_at.replace(' ', 'T')}Z`).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    ins.run(title, owner, level || null, people || null, day, `/news/${news.id}`, news.image);
    n++;
  }
  if (!n) return false; // ยังไม่มีข่าวต้นทาง (ยังไม่ได้นำเข้า) — ลองใหม่ครั้งหน้า
}
// เมนู "ผลงานและรางวัล" ในหมวดเกี่ยวกับโรงเรียน
function seedAwardsMenu() {
  if (one("SELECT 1 FROM menu_items WHERE url='/awards'")) return;
  const about = one("SELECT id FROM menu_items WHERE parent_id=0 AND title_en='About'");
  if (!about) return false;
  const last = one('SELECT COALESCE(MAX(sort), 0) m FROM menu_items WHERE parent_id=?', about.id).m;
  db.prepare("INSERT INTO menu_items (title,url,parent_id,sort,active) VALUES ('ผลงานและรางวัล','/awards',?,?,1)").run(about.id, last + 10);
}

// ---------- ป๊อปอัปต้อนรับก่อนเข้าเว็บ (แก้ไข/ปิดได้ที่หลังบ้าน) ----------
function seedPopup() {
  if (!isEmpty('popups')) return;
  db.prepare("INSERT INTO popups (title,body,link_text,frequency,active,sort) VALUES (?,?,?,'session',1,10)").run(
    'ยินดีต้อนรับสู่โรงเรียนเบญจมานุสรณ์',
    'บัณฑิตย่อมฝึกตน — ติดตามข่าวสาร ปฏิทินกิจกรรม และบริการออนไลน์ของโรงเรียนได้ที่เว็บไซต์นี้',
    'ดูรายละเอียด');
}

// ---------- ค่าตั้งค่าเฉพาะของโรงเรียนที่เพิ่มมาภายหลัง (เติมเมื่อยังว่าง) ----------
function seedSettings() {
  const defaults = {
    agency: 'สำนักงานเขตพื้นที่การศึกษามัธยมศึกษาจันทบุรี ตราด',
    line_url: 'https://lin.ee/pIxU3Vr', // ช่องทางรับฟังความคิดเห็น/ร้องเรียน จากหน้าข้อมูลการติดต่อเดิม
    map_query: 'โรงเรียนเบญจมานุสรณ์ จันทบุรี',
  };
  const up = db.prepare("UPDATE settings SET value=? WHERE key=? AND (value IS NULL OR value='')");
  for (const [k, v] of Object.entries(defaults)) up.run(v, k);
}

export function seedDefaults() {
  const imported = getSettings().wp_imported === '1';
  db.exec('BEGIN');
  try {
    if (imported) once('settings', seedSettings);
    once('services', seedServices);
    once('menu', () => seedMenu(getSettings()));
    if (imported) {
      once('programs', seedPrograms);
      once('highlights', seedHighlights);
      once('links', () => seedLinks(getSettings()));
      once('staff', seedStaff);
      once('people', seedPeoplePages);
      once('colors', seedColors);
      once('ext_links', seedExtLinks);
      once('popup', seedPopup);
      once('awards', seedAwards);
    }
    once('awards_menu', seedAwardsMenu);
    seedStatMeta();
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
