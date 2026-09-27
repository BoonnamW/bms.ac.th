// นำเข้าเนื้อหาทั้งหมดจาก WordPress เดิมของโรงเรียนเบญจมานุสรณ์ (www.bms.ac.th/bs) — ข่าว หน้าเว็บ อัลบั้มภาพ เมนู และลิงก์เดิม
//
//   node scripts/import-wp.mjs <ไฟล์.sql | ไฟล์.json.gz> [--once]
//   node scripts/import-wp.mjs <ไฟล์.sql> --export seed/bms-wp.json.gz   (เก็บเฉพาะเนื้อหาสาธารณะ ไว้ใช้ขึ้นเซิร์ฟเวอร์)
//
// รันซ้ำได้: รายการที่นำเข้าแล้วจะข้าม ไม่ทับสิ่งที่เจ้าหน้าที่แก้ไขในหลังบ้าน
// รูปและไฟล์อ้างอิงเป็น /uploads/wp/<ปี>/<เดือน>/<ไฟล์> — คัดลอกโฟลเดอร์ wp-content/uploads ของเว็บเดิมไปไว้ที่ uploads/wp
// หรือตั้ง WP_MEDIA_URL ให้ระบบส่งต่อไปยังเว็บเดิมระหว่างย้ายไฟล์
import fs from 'node:fs';
import zlib from 'node:zlib';
import { parseDump, extractContent } from '../lib/wp.js';

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--export');
const exportTo = args.includes('--export') ? args[args.indexOf('--export') + 1] : null;
if (!input) {
  console.error('วิธีใช้: node scripts/import-wp.mjs <ไฟล์.sql | ไฟล์.json.gz> [--once] [--export ไฟล์.json.gz]');
  process.exit(1);
}

function load(file) {
  if (/\.sql$/i.test(file)) return extractContent(parseDump(fs.readFileSync(file, 'utf8')));
  const raw = fs.readFileSync(file);
  return JSON.parse((/\.gz$/i.test(file) ? zlib.gunzipSync(raw) : raw).toString('utf8'));
}

const content = load(input);
if (exportTo) {
  fs.writeFileSync(exportTo, zlib.gzipSync(JSON.stringify(content), { level: 9 }));
  console.log(`✓ ส่งออกเนื้อหาสาธารณะ: ข่าว ${content.news.length} · หน้า ${content.pages.length} · อัลบั้ม ${Object.keys(content.galleries).length} → ${exportTo}`);
  process.exit(0);
}

// โหลดฐานข้อมูลหลังจากตรวจอาร์กิวเมนต์แล้ว (การส่งออกไม่ต้องแตะฐานข้อมูลของเว็บ)
const { db } = await import('../lib/db.js');
const { cleanHtml } = await import('../lib/helpers.js');
const { OIT_GROUP, OIT_SORT, oitSort } = await import('../lib/oit.js');

if (args.includes('--once') && db.prepare("SELECT 1 FROM settings WHERE key='wp_imported'").get()) {
  console.log('นำเข้าข้อมูลจาก WordPress ไปแล้ว — ข้าม');
  process.exit(0);
}

// ---------- แปลงเนื้อหา WordPress → HTML ที่ปลอดภัยของระบบใหม่ ----------
const media = (f) => '/uploads/wp/' + String(f).split('/').map(encodeURIComponent).join('/');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const BLOCK = /^<(p|h[1-6]|ul|ol|li|table|thead|tbody|tr|td|th|figure|iframe|blockquote|div|hr|pre)\b/i;

function toHtml(raw) {
  let s = String(raw || '').replace(/\r\n?/g, '\n');
  s = s.replace(/\[rl_gallery[^\]]*?id="?(\d+)"?[^\]]*\]/g, (m, id) => {
    const files = content.galleries[id] || [];
    return files.length ? `\n\n<figure class="wp-gallery">${files.map((f) => `<a href="${media(f)}"><img src="${media(f)}" alt=""></a>`).join('')}</figure>\n\n` : '';
  });
  s = s.replace(/\[embedyt\]\s*(\S+?)\s*\[\/embedyt\]/g, (m, url) => `<a href="${esc(url)}">${esc(url)}</a>`);
  s = s.replace(/\[caption[^\]]*\]([\s\S]*?)\[\/caption\]/g, '$1');
  s = s.replace(/\[\/?[a-zA-Z_][\w-]*(\s[^\]]*)?\]/g, ''); // shortcode อื่นที่ระบบใหม่ไม่มี
  s = s.replace(/(?:https?:)?\/\/(?:www\.)?bms\.ac\.th\/bs\/wp-content\/uploads\//gi, '/uploads/wp/');
  s = s.replace(/(?:https?:)?\/\/(?:www\.)?bms\.ac\.th\/bs(?=[/"'?#<\s]|$)/gi, '/bs'); // ลิงก์ภายในเดิม → ส่งต่ออัตโนมัติ
  // PDF ที่ฝังไว้: เพิ่มลิงก์เปิดไฟล์ (มือถือแสดง PDF ใน iframe ไม่ได้)
  s = s.replace(/<iframe\b[^>]*\bsrc="(\/uploads\/wp\/[^"]+\.pdf)"[^>]*>\s*<\/iframe>/gi,
    (m, src) => `<iframe src="${src}" width="100%" height="900" title="เอกสาร PDF"></iframe>\n\n<p><a href="${src}">เปิดไฟล์ PDF</a></p>`);
  // ย่อหน้าแบบ WordPress (บรรทัดว่าง = ย่อหน้าใหม่, ขึ้นบรรทัด = <br>)
  s = s.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
    .map((b) => (BLOCK.test(b) ? b : `<p>${b.replace(/\n/g, '<br>')}</p>`)).join('\n');
  return cleanHtml(s)
    .replace(/<p>(\s|&nbsp;| |<br\s*\/?>)*<\/p>/g, '')
    .replace(/(<br\s*\/?>\s*){3,}/g, '<br /><br />');
}
const plain = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const excerptOf = (text) => (text.length > 160 ? text.slice(0, 160).trim() + '…' : text);
const firstImage = (html) => (html.match(/<img[^>]+src="\/uploads\/wp\/([^"]+)"/) || [])[1];
const decode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

// ---------- หมวดหมู่ข่าว: หมวดเดิม 17 หมวด → หมวดของระบบใหม่ (เลือกตามลำดับความสำคัญ) ----------
const CAT_RULES = [
  ['รับสมัคร', ['ข่าวรับสมัครเรียน']],
  ['จัดซื้อจัดจ้าง', ['ประกวดราคา-สอบราคา', 'การจัดซื้อจัดจ้าง']],
  ['รับสมัครงาน', ['ข่าวรับสมัครงาน']],
  ['ผลงานนักเรียน', ['ผลงานนักเรียน']],
  ['วิชาการ', ['บริหารงานวิชาการ']],
  ['กิจกรรม', ['ภาพกิจกรรม', 'วิดีโอกิจกรรม', 'โครงการ-ค่าย-ชุมนุม']],
  ['ประกาศ', ['การประชุม', 'บริหารงานบุคคล', 'บริหารงานงบประมาณ', 'บริหารงานทั่วไป']],
];
const categoryOf = (cats) => (CAT_RULES.find(([, from]) => from.some((c) => cats.includes(c))) || ['ประชาสัมพันธ์'])[0];

// ---------- เมนูเดิม → กลุ่มเมนูของระบบใหม่ (จัดให้กระชับ ลึกไม่เกิน 2 ชั้น) ----------
const RENAME = { 'ข้อมูลพื้นฐาน': 'เกี่ยวกับเรา', 'การบริหารงาน': OIT_GROUP, 'ข่าวสาร': 'เกี่ยวกับเรา' };
// หน้าเดิมที่ตรงกับหัวข้อ OIT → ใช้แทนหน้าว่างของหัวข้อนั้น
const OIT_PAGES = { 5844: 'o1', 5847: 'o2', 384: 'o3', 9334: 'o6', 9347: 'o12', 9317: 'o16', 9293: 'o17', 9374: 'o18', 9653: 'o20', 9414: 'o23' };

// ลำดับกลุ่มในเมนูหลัก (เลขฐานของ sort) — กลุ่มอื่นที่ไม่อยู่ในรายการนี้ต่อท้าย
const GROUP_SORT = { 'เกี่ยวกับเรา': 0, 'บุคลากร': 100, [OIT_GROUP]: OIT_SORT + 30, 'e-Service': 500, 'เบญจมาฯ สาร': 600 };
const groupBase = (g) => GROUP_SORT[g] ?? 700;

const menuById = new Map(content.menu.map((m) => [m.id, m]));
const topOf = (m) => { while (m.parent && menuById.has(m.parent)) m = menuById.get(m.parent); return m; };
const hasChildren = new Set(content.menu.map((m) => m.parent));
const pageMenu = new Map(); // wp page id → { group, sort, label, children: [wp page id] }
const extLinks = { eservice: [], journal: [] };
let admissionUrl = '';
content.menu.forEach((m, i) => {
  const top = topOf(m);
  const group = RENAME[top.title] || top.title;
  if (m.object === 'page' && !pageMenu.has(m.object_id)) {
    const g = m === top && !hasChildren.has(m.id) ? null : group;
    pageMenu.set(m.object_id, { group: g, sort: groupBase(g) + 10 + i, label: m.title, children: [] });
    const parent = menuById.get(m.parent);
    if (parent?.object === 'page') pageMenu.get(parent.object_id)?.children.push(m.object_id);
  } else if (m.type === 'custom' && /^https?:\/\//.test(m.url)) {
    if (m === top) { if (m.title.includes('รับสมัคร')) admissionUrl = m.url; return; }
    const list = top.title.includes('สาร') ? extLinks.journal : extLinks.eservice;
    if (!list.some((l) => l.url === m.url)) list.push({ title: m.title, url: m.url });
  }
});

// ---------- บันทึกลงฐานข้อมูล ----------
const setSetting = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
const legacyGet = db.prepare('SELECT target FROM legacy_urls WHERE path=?');
const legacySet = db.prepare('INSERT OR IGNORE INTO legacy_urls (path, target) VALUES (?,?)');
const slugTaken = db.prepare('SELECT 1 FROM pages WHERE slug=?');

const firstImport = !db.prepare("SELECT 1 FROM settings WHERE key='wp_imported'").get();
db.exec('BEGIN');
try {
  // ตั้งค่าเว็บไซต์ (ข้อมูลจริงของโรงเรียน)
  const settings = {
    school_name: 'โรงเรียนเบญจมานุสรณ์',
    school_name_en: 'Benjamanusorn School, Chanthaburi',
    tagline: 'บัณฑิตย่อมฝึกตน',
    primary: '#1e6b4b', accent: '#c73670', // สีประจำโรงเรียน: เขียว–ชมพู
    about_title: 'บัณฑิตย่อมฝึกตน — อตฺตานํ ทมยนฺติ ปณฺฑิตา',
    about_text: 'โรงเรียนเบญจมานุสรณ์ จังหวัดจันทบุรี เป็นโรงเรียนสหศึกษาขนาดใหญ่พิเศษ เปิดสอนระดับมัธยมศึกษาตอนต้นและตอนปลาย ' +
      'ก่อตั้งเมื่อ พ.ศ. 2535 มุ่งพัฒนาคุณภาพของผู้เรียนสู่มาตรฐานสากลบนพื้นฐานความเป็นไทย',
    phone: '039-325990', email: 'bms_school@hotmail.com',
    address: '1/7 ถนนแผ่นดินทอง ตำบลตลาด อำเภอเมือง จังหวัดจันทบุรี 22000',
    facebook: 'https://www.facebook.com/benjamanusornschool/',
    admission_title: 'รับสมัครนักเรียน ปีการศึกษา 2569',
    admission_text: 'ดูรายละเอียด คุณสมบัติ และกำหนดการรับสมัครนักเรียนของโรงเรียนเบญจมานุสรณ์',
    admission_link: admissionUrl || '/news?cat=รับสมัคร',
  };
  if (content.site.logo) settings.logo = 'wp/' + content.site.logo;
  if (firstImport) for (const [k, v] of Object.entries(settings)) setSetting.run(k, v);

  // เอาข้อมูลตัวอย่างของโรงเรียนสมมติออก (เฉพาะที่ยังไม่ถูกแก้ไข)
  db.prepare("DELETE FROM news WHERE body LIKE '%โรงเรียนวิทยาปัญญาขอเชิญ%'").run();
  db.prepare("DELETE FROM pages WHERE body LIKE '%(แก้ไขเนื้อหานี้ได้ที่หลังบ้าน)%'").run();
  db.prepare('DELETE FROM gallery WHERE image IS NULL').run();

  // ข่าว
  const insNews = db.prepare('INSERT INTO news (title,category,excerpt,body,image,published,created_at) VALUES (?,?,?,?,?,1,?)');
  let nNews = 0;
  for (const n of content.news) {
    if (legacyGet.get(`?id=${n.wp_id}`)) continue;
    const body = toHtml(n.body);
    const image = n.thumb ? 'wp/' + n.thumb : (firstImage(body) ? 'wp/' + decode(firstImage(body)) : null);
    const excerpt = excerptOf(plain(n.excerpt) || plain(body));
    const date = /^0000/.test(n.date_gmt || '0000') ? n.date : n.date_gmt;
    const title = n.title.trim() || excerptOf(plain(body)).slice(0, 90) || 'ข่าวประชาสัมพันธ์';
    const { lastInsertRowid: id } = insNews.run(title, categoryOf(n.categories), excerpt, body, image, date);
    const [y, mo, d] = n.date.slice(0, 10).split('-');
    legacySet.run(`?id=${n.wp_id}`, `/news/${id}`);
    if (n.slug) legacySet.run(`/bs/${y}/${mo}/${d}/${decode(n.slug)}`, `/news/${id}`);
    nNews++;
  }

  // หน้าเว็บไซต์
  const insPage = db.prepare('INSERT INTO pages (title,slug,menu_group,body,in_menu,sort,published) VALUES (?,?,?,?,?,?,1)');
  const byWp = new Map(content.pages.map((p) => [p.wp_id, p]));
  const wpPath = (p) => { const parts = []; for (let q = p; q; q = byWp.get(q.parent)) parts.unshift(decode(q.slug)); return '/bs/' + parts.join('/'); };
  const THAI = /[฀-๿]/;
  const linkList = (items) => '<ul>' + items.map((l) => `<li><a href="${esc(l.url)}"${/^https?:/.test(l.url) ? ' target="_blank"' : ''}>${esc(l.title)}</a></li>`).join('') + '</ul>';
  // หน้าที่นำเข้า: ข้ามหน้าตัวอย่างของธีมเดิม (ไม่มีภาษาไทยและไม่อยู่ในเมนู) และหน้าว่างที่ไม่อยู่ในเมนู
  const wanted = content.pages.filter((p) => pageMenu.has(p.wp_id) || OIT_PAGES[p.wp_id] || (THAI.test(p.title + p.body) && toHtml(p.body)));
  const slugOf = new Map();
  for (const p of wanted) {
    const oit = OIT_PAGES[p.wp_id];
    let slug = oit ? `oit-${oit}` : /^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug) ? p.slug : `page-${p.wp_id}`;
    if (!oit && (slugTaken.get(slug) && !legacyGet.get(`?id=${p.wp_id}`))) slug = `page-${p.wp_id}`;
    slugOf.set(p.wp_id, slug);
  }
  let nPages = 0;
  for (const p of wanted) {
    if (legacyGet.get(`?id=${p.wp_id}`)) continue;
    const inMenu = pageMenu.get(p.wp_id);
    const oit = OIT_PAGES[p.wp_id];
    const slug = slugOf.get(p.wp_id);
    const title = THAI.test(p.title) || !inMenu?.label ? p.title : inMenu.label; // เช่น หน้า "Blog" ที่เมนูเดิมใช้ชื่อ "บุคลากร"
    // หน้าว่างที่เป็นหัวข้อเมนู → แสดงรายการหน้าย่อยแทน
    const kids = (inMenu?.children || []).filter((id) => slugOf.has(id))
      .map((id) => ({ title: byWp.get(id).title, url: `/p/${slugOf.get(id)}` }));
    const body = toHtml(p.body) || (kids.length ? cleanHtml(linkList(kids)) : '<p>อยู่ระหว่างปรับปรุงข้อมูล</p>');
    if (slugTaken.get(slug)) {
      // หน้า OIT ที่ยังเป็นข้อความรอข้อมูล → เติมเนื้อหาจากเว็บเดิม
      if (oit) db.prepare("UPDATE pages SET title=?, body=? WHERE slug=? AND body LIKE '<p>อยู่ระหว่างจัดเตรียมข้อมูล%'").run(title, body, slug);
    } else {
      const group = oit ? OIT_GROUP : inMenu?.group ?? null;
      insPage.run(title, slug, group, body, inMenu || oit ? 1 : 0, oit ? oitSort(oit) : inMenu?.sort ?? 0);
      nPages++;
    }
    legacySet.run(`?id=${p.wp_id}`, `/p/${slug}`);
    if (p.slug) legacySet.run(wpPath(p), `/p/${slug}`);
  }

  // หน้ารวมลิงก์จากเมนูเดิม (ระบบออนไลน์ภายนอก และวารสารฉบับย้อนหลัง)
  if (extLinks.eservice.length && !slugTaken.get('online-services')) {
    insPage.run('ระบบบริการออนไลน์', 'online-services', 'e-Service', cleanHtml(linkList(extLinks.eservice)), 1, groupBase('e-Service'));
  }
  if (extLinks.journal.length && !slugTaken.get('journal-archive')) {
    insPage.run('เบญจมาฯ สาร ฉบับย้อนหลัง', 'journal-archive', 'เบญจมาฯ สาร', cleanHtml(linkList(extLinks.journal)), 1, groupBase('เบญจมาฯ สาร'));
  }

  // ตัวเลข สไลด์ เมนูลัด แกลเลอรี (หน้าแรก) — ทำเฉพาะการนำเข้าครั้งแรก ไม่ทับสิ่งที่แก้ไขในหลังบ้านภายหลัง
  if (firstImport) {
    const stats = [['นักเรียน', 1694], ['ครูและบุคลากร', 98], ['ห้องเรียน', 48], ['ปีแห่งการก่อตั้ง', 34]];
    db.prepare('DELETE FROM stats WHERE label IN (?,?,?,?)').run('นักเรียน', 'คุณครูและบุคลากร', 'ปีแห่งการก่อตั้ง', 'รางวัลระดับชาติ');
    if (!db.prepare('SELECT 1 FROM stats').get()) stats.forEach(([l, v], i) => db.prepare('INSERT INTO stats (label,value,sort) VALUES (?,?,?)').run(l, v, i + 1));

    const pageOf = (wpId, fallback) => legacyGet.get(`?id=${wpId}`)?.target || fallback;
    const slides = [
      ['โรงเรียนเบญจมานุสรณ์ จังหวัดจันทบุรี', 'บัณฑิตย่อมฝึกตน — พัฒนาคุณภาพผู้เรียนสู่มาตรฐานสากล บนพื้นฐานความเป็นไทย', pageOf(379, '/')], // ประวัติโรงเรียน
      ['รับสมัครนักเรียน ปีการศึกษา 2569', 'ติดตามประกาศและรายละเอียดการรับสมัครนักเรียน', settings.admission_link],
      ['กิจกรรมและความภาคภูมิใจของเรา', 'ข่าวและภาพกิจกรรมของนักเรียน คณะครู และบุคลากร', '/news?cat=กิจกรรม'],
    ];
    db.prepare("DELETE FROM slides WHERE title IN ('เรียนดี มีคุณธรรม นำสู่สากล','เปิดรับสมัครนักเรียนใหม่ 2569','ห้องเรียนแห่งอนาคต')").run();
    if (!db.prepare('SELECT 1 FROM slides').get()) slides.forEach(([t, s, l], i) => db.prepare('INSERT INTO slides (title,subtitle,link,sort) VALUES (?,?,?,?)').run(t, s, l, i + 1));

    const links = [
      ['รับสมัครนักเรียน', 'graduation', settings.admission_link],
      ['บุคลากร', 'users', pageOf(364, '/')],
      ['e-Service', 'monitor', '/p/online-services'],
      ['เปิดเผยข้อมูล (ITA)', 'file', '/p/oit-o1'],
      ['เบญจมาฯ สาร', 'book', '/p/journal-archive'],
      ['ช่องทางร้องเรียน', 'phone', '/contact'],
    ];
    const demoLinks = ['สมัครเรียน', 'หลักสูตร', 'ปฏิทินการศึกษา', 'บุคลากร', 'ดาวน์โหลดเอกสาร', 'ติดต่อเรา', 'ช่องทางร้องเรียน'];
    db.prepare(`DELETE FROM links WHERE title IN (${demoLinks.map(() => '?').join(',')})`).run(...demoLinks);
    if (!db.prepare('SELECT 1 FROM links').get()) links.forEach(([t, ic, u], i) => db.prepare('INSERT INTO links (title,icon,url,sort) VALUES (?,?,?,?)').run(t, ic, u, i + 1));

    if (!db.prepare('SELECT 1 FROM gallery').get()) {
      const pics = db.prepare("SELECT title, image FROM news WHERE category='กิจกรรม' AND image IS NOT NULL AND image NOT LIKE '%.pdf' ORDER BY created_at DESC LIMIT 12").all();
      pics.forEach((p, i) => db.prepare('INSERT INTO gallery (title,image,sort) VALUES (?,?,?)').run((p.title || 'ภาพกิจกรรม').slice(0, 100), p.image, i + 1));
    }
  }

  setSetting.run('wp_imported', '1');
  db.exec('COMMIT');
  console.log(`✓ นำเข้าจาก WordPress: ข่าว ${nNews} · หน้าเว็บ ${nPages} · ลิงก์ e-Service ${extLinks.eservice.length} · วารสาร ${extLinks.journal.length}`);
  console.log(`  ไฟล์รูป/เอกสารที่อ้างถึง ${content.files.length} ไฟล์ (อยู่ใน wp-content/uploads ของเว็บเดิม → คัดลอกไปที่ uploads/wp)`);
} catch (e) {
  db.exec('ROLLBACK');
  throw e;
}
