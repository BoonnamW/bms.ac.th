/**
 * คลังข้อสอบออนไลน์ (Google Sheets + Apps Script) สำหรับกลุ่มเล็ก
 * - ข้อสอบ: แผ่นงานชื่อ "ข้อสอบ ..." (ชุดละแผ่นงาน) · นำเข้าจาก Drive ด้วยเมนู
 * - ผู้ใช้: แผ่นงาน "ผู้ใช้" (สมัครเองบนเว็บ ผู้ดูแลอนุมัติ) · ผลทุกครั้ง: แผ่นงาน "ประวัติการทำ"
 * - เฉลยไม่ถูกส่งไปหน้าเว็บในโหมดสอบ ตรวจคะแนนฝั่งเซิร์ฟเวอร์
 * วิธีติดตั้งดู README.md
 */

const SH = { SET: 'ตั้งค่า', USERS: 'ผู้ใช้', LOG: 'ประวัติการทำ' };
const L = ['ก', 'ข', 'ค', 'ง', 'จ'];
const EXAM_PREFIX = 'ข้อสอบ '; // แผ่นงานที่ขึ้นต้นด้วยคำนี้ = ข้อสอบ 1 ชุด
const FIXED_COLS = ['เวลาส่ง', 'ชื่อ-นามสกุล', 'เลขที่/รหัส', 'ห้อง', 'คะแนน', 'เต็ม', 'ร้อยละ', 'ระดับ', 'เรื่องที่ควรทบทวน', 'ข้อที่ผิด'];
const USER_COLS = ['รหัสส่วนตัว', 'ชื่อ-นามสกุล', 'เลขที่/รหัส', 'ห้อง', 'อนุมัติ', 'สมัครเมื่อ', 'ใช้งานล่าสุด', 'ข้อที่ผิดค้าง', 'รายการข้อที่ผิด (ระบบใช้)'];
const LOG_COLS = ['เวลา', 'รหัสผู้ใช้', 'ชื่อ-นามสกุล', 'โหมด', 'ประเภท', 'ชุด', 'หมวด', 'คะแนน', 'เต็ม', 'ร้อยละ', 'ใช้เวลา (นาที)', 'ผลรายหมวด'];
const MODE = { exam: 'สอบ', practice: 'ฝึก', review: 'ทบทวน' };
const KIND = { set: 'ทั้งชุด', random: 'สุ่ม', review: 'ข้อที่ผิด' };
const RANDOM_N = 20;
const CAT_ORDER = ['กฎหมายการศึกษา', 'ความรู้ทั่วไปเกี่ยวกับการเป็นข้าราชการที่ดี', 'มาตรฐานความรู้และวิชาชีพครู', 'การคิดวิเคราะห์', 'ภาษาอังกฤษ', 'คณิตศาสตร์'];
const CACHE_SEC = 21600; // 6 ชม. (สูงสุดของ CacheService)

// ---------------- เว็บ ----------------
function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle(settings_().title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** เปิดเว็บ: ไม่มีรหัส → ชื่อเว็บอย่างเดียว · มีรหัส → ข้อมูลผู้ใช้ รายการชุดข้อสอบ และประวัติของตัวเอง */
function boot(code) {
  const s = settings_();
  const out = { title: s.title, open: s.open, intro: s.intro };
  if (!code) return out;
  const u = login_(code);
  touch_(u);
  out.me = { code: u.code, name: u.name, studentNo: u.studentNo, room: u.room, wrong: u.wrong.length };
  out.catalog = catalog_().map(function (e) { return { id: e.name, t: e.title, c: e.cat, sp: e.special, n: e.nq }; });
  out.log = logOf_(u.code);
  return out;
}

/** สมัครใช้งาน → ได้รหัสส่วนตัว (ใช้ได้เมื่อผู้ดูแลอนุมัติ) */
function register(p) {
  const name = clean_(p && p.name, 100);
  if (!name) throw new Error('กรุณากรอกชื่อ-นามสกุล');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const us = users_();
    const key = name.replace(/\s+/g, ' ').toLowerCase();
    if (us.list.some(function (u) { return u.name.replace(/\s+/g, ' ').toLowerCase() === key; })) {
      throw new Error('ชื่อนี้สมัครไว้แล้ว — ถ้าลืมรหัส ให้ติดต่อผู้ดูแล');
    }
    if (us.list.filter(function (u) { return !u.ok; }).length >= 30) throw new Error('มีผู้สมัครรออนุมัติจำนวนมาก — กรุณาติดต่อผู้ดูแล');
    let code;
    do { code = randomCode_(6); } while (us.byCode[code]);
    us.sheet.appendRow([code, safe_(name), safe_(clean_(p.studentNo, 20)), safe_(clean_(p.room, 20)), false, new Date(), '', 0, '[]']);
    return { code: code, name: name };
  } finally {
    lock.releaseLock();
  }
}

/** ข้อสอบทั้งชุด · โหมดสอบไม่ส่งเฉลย */
function getSet(code, id, mode) {
  open_();
  login_(code);
  const e = catalog_().filter(function (x) { return x.name === id; })[0];
  if (!e) throw new Error('ไม่พบชุดข้อสอบนี้ — ลองรีเฟรชหน้าเว็บ');
  return { kind: 'set', set: e.title, cat: e.cat, title: e.title, qs: qs_(e).map(function (q) { return pub_(e, q, mode); }) };
}

/** สุ่ม 20 ข้อ จากหมวดเดียว (cat) หรือรวมทุกหมวด (cat ว่าง) */
function getRandom(code, cat, mode) {
  open_();
  login_(code);
  const pool = catalog_().filter(function (e) { return !cat || e.cat === cat; });
  if (!pool.length) throw new Error('ไม่พบข้อสอบในหมวดนี้');
  let picked = [];
  if (cat) {
    picked = pick_(pool, RANDOM_N, 4);
  } else {
    // กระจายเท่า ๆ กันทุกหมวด
    const byCat = {};
    pool.forEach(function (e) { (byCat[e.cat] = byCat[e.cat] || []).push(e); });
    const cats = shuffle_(Object.keys(byCat));
    cats.forEach(function (c, i) {
      const quota = Math.floor(RANDOM_N / cats.length) + (i < RANDOM_N % cats.length ? 1 : 0);
      if (quota) picked = picked.concat(pick_(byCat[c], quota, 2));
    });
  }
  return { kind: 'random', cat: cat || '', title: 'สุ่ม ' + picked.length + ' ข้อ · ' + (cat || 'รวมทุกหมวด'),
    qs: shuffle_(picked).map(function (x) { return pub_(x[0], x[1], mode); }) };
}

/** ทบทวนข้อที่ผิด (ครั้งละไม่เกิน 20 ข้อ) — แสดงเฉลยทันทีแบบโหมดฝึก */
function getReview(code) {
  open_();
  const u = login_(code);
  if (!u.wrong.length) throw new Error('ยังไม่มีข้อที่ผิดค้างอยู่ 🎉');
  const items = resolve_(shuffle_(u.wrong.slice()).slice(0, RANDOM_N));
  if (!items.length) throw new Error('ข้อที่ผิดค้างอยู่ไม่มีในคลังแล้ว (ข้อสอบอาจถูกแก้ไข)');
  return { kind: 'review', title: 'ทบทวนข้อที่ผิด', qs: items.map(function (x) { return pub_(x.e, x.q, 'practice'); }) };
}

/**
 * ส่งผล: p = { mode, kind, set, cat, ids: ['gid.no', …], ans: [ตัวเลือกเดิม 0–4 หรือ -1, …], secs }
 * โหมดสอบตรวจทุกข้อ (ไม่ตอบ = ผิด) · โหมดฝึก/ทบทวนนับเฉพาะข้อที่ตอบ
 */
function submit(code, p) {
  const s = open_();
  login_(code);
  const mode = MODE[p && p.mode] ? p.mode : 'exam';
  const kind = KIND[p.kind] ? p.kind : 'set';
  const ids = (p.ids || []).slice(0, 300).map(String);
  const all = resolve_(ids).map(function (x) {
    const v = Number(p.ans && p.ans[ids.indexOf(x.id)]);
    const chosen = Number.isInteger(v) && v >= 0 && v < x.q.ch.length ? v : -1;
    return { id: x.id, e: x.e, q: x.q, chosen: chosen, ok: chosen === x.q.a };
  });
  const items = mode === 'exam' ? all : all.filter(function (x) { return x.chosen >= 0; });
  if (!items.length) throw new Error('ยังไม่ได้ตอบข้อใดเลย');
  const g = grade_(items);
  const secs = Math.max(0, Math.min(86400, Math.round(Number(p.secs) || 0)));
  const setTitle = kind === 'set' ? items[0].e.title : kind === 'review' ? 'ทบทวนข้อที่ผิด' : 'สุ่ม ' + all.length + ' ข้อ';
  const cat = kind === 'set' ? items[0].e.cat : kind === 'random' ? (clean_(p.cat, 100) || 'รวมทุกหมวด') : 'รวมทุกหมวด';

  let wrongLeft;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const u = login_(code); // อ่านใหม่ภายใต้ lock กันข้อมูลทับกัน
    sheet_(SH.LOG, LOG_COLS).appendRow([new Date(), u.code, safe_(u.name), MODE[mode], KIND[kind], safe_(setTitle), safe_(cat),
      g.score, g.total, g.pct, Math.round(secs / 6) / 10, JSON.stringify(g.cats)]);
    // ข้อสอบทั้งชุดในโหมดสอบ → เก็บคำตอบรายข้อไว้วิเคราะห์ข้อสอบ (เมนู "คำนวณผลวิเคราะห์ใหม่")
    if (mode === 'exam' && kind === 'set' && items.length === items[0].e.nq) {
      const row = Array(items.length).fill('-');
      items.forEach(function (x) { row[x.q.no - 1] = x.chosen >= 0 ? L[x.chosen] : '-'; });
      answersSheet_(items[0].e.title, items.length).appendRow([new Date(), safe_(u.name), safe_(u.studentNo), safe_(u.room),
        g.score, g.total, g.pct, g.level, g.weak.join(', '), g.wrong.join(', ')].concat(row));
    }
    // ข้อที่ผิดสะสม: ผิดเมื่อใดเพิ่มเข้า · ออกจากรายการเมื่อทบทวนแล้วตอบถูก 1 ครั้ง
    const wrong = u.wrong.slice();
    items.forEach(function (x) {
      const at = wrong.indexOf(x.id);
      if (mode === 'review') { if (x.ok && at >= 0) wrong.splice(at, 1); }
      else if (!x.ok && at < 0) wrong.push(x.id);
    });
    while (wrong.length > 3000) wrong.shift();
    u.sheet.getRange(u.row, 7, 1, 3).setValues([[new Date(), wrong.length, JSON.stringify(wrong)]]);
    wrongLeft = wrong.length;
  } finally {
    lock.releaseLock();
  }

  const out = { title: setTitle, mode: mode, score: g.score, total: g.total, pct: g.pct, level: g.level, secs: secs,
    topics: g.topics, cats: g.cats, wrongLeft: wrongLeft };
  if (mode === 'exam' && s.showKey) {
    out.items = items.map(function (x) { return { id: x.id, chosen: x.chosen, a: x.q.a, ok: x.ok, ex: x.q.ex, ct: x.q.ct }; });
  }
  return out;
}

// ---------------- หน้าผู้ดูแล ----------------
function adminData(acode) {
  admin_(acode);
  const us = users_().list;
  const rows = logRows_();
  const cat = catalog_();
  const users = us.map(function (u) {
    const mine = rows.filter(function (r) { return r.code === u.code; });
    const exam = mine.filter(function (r) { return r.mode === 'exam'; });
    const sets = {}, cats = {};
    exam.forEach(function (r) {
      if (r.kind === 'set') sets[r.set] = 1;
      Object.keys(r.cats).forEach(function (c) {
        const t = cats[c] || (cats[c] = [0, 0]);
        t[0] += r.cats[c][0]; t[1] += r.cats[c][1];
      });
    });
    const last = Math.max(u.last ? u.last.getTime() : 0, mine.length ? mine[mine.length - 1].t : 0);
    return {
      code: u.code, name: u.name, studentNo: u.studentNo, room: u.room, ok: u.ok,
      created: u.created ? u.created.getTime() : 0, last: last,
      sets: Object.keys(sets).length, exams: exam.length,
      avg: exam.length ? Math.round(exam.reduce(function (a, r) { return a + r.pct; }, 0) / exam.length) : null,
      practiced: mine.filter(function (r) { return r.mode !== 'exam'; }).reduce(function (a, r) { return a + r.total; }, 0),
      wrong: u.wrong.length, cats: cats,
    };
  });
  return { users: users, nsets: cat.length, cats: catNames_(cat) };
}

function adminApprove(acode, code, ok) {
  admin_(acode);
  const u = users_().byCode[normCode_(code)];
  if (!u) throw new Error('ไม่พบผู้ใช้นี้');
  u.sheet.getRange(u.row, 5).setValue(ok === true);
  return adminData(acode);
}

// ---------------- เมนูในชีต ----------------
// ฟังก์ชันเมนูเรียก getUi() ก่อนเสมอ: ถ้ามีคนเรียกผ่านหน้าเว็บ (google.script.run) จะล้มทันทีโดยไม่แก้ข้อมูล
function onOpen() {
  SpreadsheetApp.getUi().createMenu('ห้องสอบ')
    .addItem('1) ตั้งค่าครั้งแรก', 'setup')
    .addItem('2) นำเข้าข้อสอบจาก Drive (ไฟล์ชื่อ "ข้อสอบ ...")', 'importExams')
    .addItem('อัปเดตรายการข้อสอบบนเว็บ (หลังแก้ไขชีตข้อสอบเอง)', 'refreshCatalog')
    .addItem('คำนวณผลวิเคราะห์ข้อสอบรายชุด', 'analyze')
    .addItem('เปิด/ปิดเว็บ', 'toggleOpen')
    .addSeparator()
    .addItem('ล้างผลสอบทั้งหมด (เก็บรายชื่อผู้ใช้ไว้)', 'clearAnswers')
    .addToUi();
}

function setup() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  if (!ss.getSheetByName(SH.SET)) {
    const set = ss.insertSheet(SH.SET, 0);
    set.setColumnWidth(1, 160); set.setColumnWidth(2, 360); set.setColumnWidth(3, 460);
  }
  const defaults = [
    ['ชื่อเว็บ', 'คลังข้อสอบครูผู้ช่วย', 'ชื่อที่แสดงบนหน้าเว็บ'],
    ['รหัสผู้ดูแล', randomCode_(8), 'ใช้เข้าหน้าผู้ดูแลบนเว็บ (ลิงก์ "สำหรับผู้ดูแล" ด้านล่างหน้าเข้าสู่ระบบ) · อย่าให้ผู้อื่น'],
    ['เปิดรับคำตอบ', true, 'ติ๊กออก = ปิดเว็บชั่วคราว'],
    ['แสดงเฉลยหลังส่ง', true, 'โหมดสอบ: เห็นเฉลยและคำอธิบายทันทีหลังส่ง'],
    ['คำชี้แจง', 'เลือกคำตอบที่ถูกที่สุดเพียงข้อเดียว', 'แสดงที่หน้าเข้าสู่ระบบ (เว้นว่างได้)'],
    ['ลิงก์เว็บสอบ', 'ยังไม่ได้ Deploy', 'ได้หลังจาก Deploy → New deployment → Web app'],
  ];
  defaults.forEach(function (d) { if (setting_(d[0]) === null) setSetting_(d[0], d[1], d[2]); });
  const set = ss.getSheetByName(SH.SET);
  set.getRange(1, 1, set.getLastRow(), 1).setFontWeight('bold');
  set.getRange(1, 3, set.getLastRow(), 1).setFontColor('#64708a');
  ['เปิดรับคำตอบ', 'แสดงเฉลยหลังส่ง'].forEach(function (k) {
    const r = settingRow_(k);
    if (r) set.getRange(r, 2).insertCheckboxes().setValue(setting_(k) === true);
  });
  sheet_(SH.USERS, USER_COLS);
  sheet_(SH.LOG, LOG_COLS);
  ['Sheet1', 'แผ่น1', 'ชีต1'].forEach(function (n) { const x = ss.getSheetByName(n); if (x && ss.getSheets().length > 1 && x.getLastRow() === 0) ss.deleteSheet(x); });
  ss.setActiveSheet(ss.getSheetByName(SH.SET));
  ui.alert('ตั้งค่าเรียบร้อย\n\nรหัสผู้ดูแล: ' + settings_().admin + ' (อยู่ในแผ่นงาน "ตั้งค่า")\n\nขั้นต่อไป\n1. เมนู ห้องสอบ → นำเข้าข้อสอบจาก Drive\n2. Deploy → New deployment → Web app (Execute as: Me · Who has access: Anyone)');
}

/** คัดลอกข้อสอบจากไฟล์ Google Sheet ใน Drive ที่ชื่อขึ้นต้นด้วย "ข้อสอบ " มาเป็นแผ่นงาน (ชุดละแผ่นงาน)
 *  ทำได้ไม่เกิน ~4.5 นาทีต่อรอบ (Apps Script จำกัด 6 นาที) ที่เหลือจะทำต่อเองอัตโนมัติทุก 1 นาทีจนครบ */
function importExams() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  const props = PropertiesService.getScriptProperties();
  const pending = JSON.parse(props.getProperty('importQueue') || '[]');
  if (pending.length) {
    const b = ui.alert('ยังนำเข้าค้างอยู่ ' + pending.length + ' ชุด', 'กด YES = ทำต่อจากเดิม · NO = เริ่มนับใหม่ทั้งหมด', ui.ButtonSet.YES_NO_CANCEL);
    if (b === ui.Button.CANCEL || b === ui.Button.CLOSE) return;
    if (b === ui.Button.YES) { finishImport_(ui, importRun_()); return; }
  }
  const files = [];
  const it = DriveApp.searchFiles('mimeType = "application/vnd.google-apps.spreadsheet" and trashed = false and title contains "' + EXAM_PREFIX.trim() + '"');
  while (it.hasNext()) {
    const f = it.next();
    if (f.getName().indexOf(EXAM_PREFIX) === 0 && f.getId() !== ss.getId()) files.push(f);
  }
  if (!files.length) { ui.alert('ไม่พบไฟล์ข้อสอบใน Drive (ชื่อไฟล์ต้องขึ้นต้นด้วย "' + EXAM_PREFIX + '")'); return; }
  files.sort(function (a, b) { return a.getName().localeCompare(b.getName(), undefined, { numeric: true }); });
  // ไฟล์ใหญ่แบ่งอัปโหลดเป็น "ข้อสอบ X (ส่วนที่ 1)", "(ส่วนที่ 2)" … → รวมเป็นแผ่นงาน "ข้อสอบ X" เดียว
  const groups = {};
  files.forEach(function (f) {
    const base = f.getName().replace(/\s*\(ส่วนที่\s*\d+\)\s*$/, '').trim().slice(0, 99);
    (groups[base] = groups[base] || []).push(f);
  });
  const bases = Object.keys(groups);
  const names = bases.map(function (b) { return '• ' + b + (groups[b].length > 1 ? ' (' + groups[b].length + ' ส่วน)' : ''); }).join('\n');
  if (ui.alert('นำเข้าข้อสอบ ' + bases.length + ' ชุด (' + files.length + ' ไฟล์)?', names + '\n\n(แผ่นงานชื่อเดียวกันจะถูกแทนที่ · ผลสอบเดิมไม่หาย)', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  props.setProperty('importQueue', JSON.stringify(bases.map(function (b) { return [b, groups[b].map(function (f) { return f.getId(); })]; })));
  props.setProperty('importTotal', String(bases.length));
  finishImport_(ui, importRun_());
}

function finishImport_(ui, left) {
  const total = Number(PropertiesService.getScriptProperties().getProperty('importTotal')) || 0;
  ui.alert(left
    ? 'นำเข้าแล้ว ' + (total - left) + '/' + total + ' ชุด\n\nที่เหลือ ' + left + ' ชุด ระบบจะทำต่อเองทุก 1 นาทีจนครบ (ปิดชีตได้เลย)\nดูความคืบหน้าได้ที่แถว "สถานะการนำเข้า" ในแผ่นงาน "ตั้งค่า"'
    : 'นำเข้าเรียบร้อยครบ ' + total + ' ชุด\nผู้ใช้เห็นข้อสอบบนเว็บทันที (ไม่ต้อง Deploy ใหม่)');
}

/** ทำงานจากตัวตั้งเวลา (ทำต่อจากรอบก่อน) — ไม่มีคิวค้างก็ไม่ทำอะไร */
function importContinue() { importRun_(); }

function importRun_() {
  const props = PropertiesService.getScriptProperties();
  const lock = LockService.getDocumentLock(); // คนละล็อกกับการส่งคำตอบ → ระหว่างนำเข้ายังใช้เว็บได้
  if (!lock.tryLock(1000)) return Number(JSON.parse(props.getProperty('importQueue') || '[]').length); // อีกรอบกำลังทำอยู่
  try {
    const t0 = Date.now();
    let queue = JSON.parse(props.getProperty('importQueue') || '[]');
    const total = Number(props.getProperty('importTotal')) || queue.length;
    while (queue.length && Date.now() - t0 < 270000) {
      importOne_(queue[0][0], queue[0][1]);
      queue = queue.slice(1);
      props.setProperty('importQueue', JSON.stringify(queue));
      setSetting_('สถานะการนำเข้า', 'กำลังนำเข้า ' + (total - queue.length) + '/' + total + ' ชุด', 'อัปเดตเมื่อ ' + new Date().toLocaleString('th-TH'));
    }
    ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'importContinue') ScriptApp.deleteTrigger(t); });
    if (queue.length) {
      ScriptApp.newTrigger('importContinue').timeBased().after(60 * 1000).create();
    } else {
      props.deleteProperty('importQueue');
      rebuildCatalog_();
      setSetting_('สถานะการนำเข้า', 'นำเข้าครบ ' + total + ' ชุด · ทั้งหมดบนเว็บ ' + catalog_().length + ' ชุด', 'เสร็จเมื่อ ' + new Date().toLocaleString('th-TH'));
    }
    return queue.length;
  } finally {
    lock.releaseLock();
  }
}

function importOne_(name, ids) {
  const ss = SpreadsheetApp.getActive();
  let values = [];
  ids.forEach(function (id) {
    const v = SpreadsheetApp.openById(id).getSheets()[0].getDataRange().getDisplayValues();
    values = values.concat(values.length ? v.slice(1) : v); // หัวตารางเอาจากส่วนแรกเท่านั้น
  });
  if (!values.length) return;
  const width = Math.max.apply(null, values.map(function (r) { return r.length; }));
  values = values.map(function (r) { return r.concat(Array(width - r.length).fill('')); });
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clear();
  sh.getRange(1, 1, values.length, width).setNumberFormat('@').setValues(values);
  sh.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#e8eef8');
  sh.setFrozenRows(1);
  sh.setColumnWidth(4, 280); sh.setColumnWidth(5, 420);
  if (width >= 11) sh.setColumnWidth(11, 320);
}

function refreshCatalog() {
  const ui = SpreadsheetApp.getUi();
  const list = rebuildCatalog_();
  ui.alert('อัปเดตแล้ว: บนเว็บมีข้อสอบ ' + list.length + ' ชุด ' + list.reduce(function (a, e) { return a + e.nq; }, 0).toLocaleString() + ' ข้อ');
}

function toggleOpen() {
  SpreadsheetApp.getUi();
  const now = setting_('เปิดรับคำตอบ') !== true;
  setSetting_('เปิดรับคำตอบ', now);
  SpreadsheetApp.getActive().toast(now ? 'เปิดเว็บแล้ว' : 'ปิดเว็บแล้ว');
}

function clearAnswers() {
  const ui = SpreadsheetApp.getUi();
  if (ui.alert('ลบผลสอบ ประวัติ และข้อที่ผิดสะสมของทุกคน?', 'รายชื่อผู้ใช้และรหัสยังอยู่ · ควรดาวน์โหลด/คัดลอกชีตเก็บไว้ก่อน — กู้คืนไม่ได้', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  const ss = SpreadsheetApp.getActive();
  ss.getSheets().forEach(function (x) {
    const n = x.getName();
    if (n.indexOf('ผล ') === 0 || n.indexOf('วิเคราะห์ ') === 0) ss.deleteSheet(x);
  });
  const log = ss.getSheetByName(SH.LOG);
  if (log && log.getLastRow() > 1) log.deleteRows(2, log.getLastRow() - 1);
  const us = ss.getSheetByName(SH.USERS);
  if (us && us.getLastRow() > 1) {
    const n = us.getLastRow() - 1;
    us.getRange(2, 8, n, 2).setValues(Array.from({ length: n }, function () { return [0, '[]']; }));
  }
}

// ---------------- วิเคราะห์ผล (รายชุด จากโหมดสอบทั้งชุด) ----------------
function analyze() {
  SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  let n = 0;
  catalog_().forEach(function (e) { if (ss.getSheetByName(ansName_(e.title))) { analyzeExam_(e); n++; } });
  ss.toast(n ? 'คำนวณผลวิเคราะห์ ' + n + ' ชุดแล้ว' : 'ยังไม่มีผลสอบทั้งชุดในโหมดสอบ');
}

function analyzeExam_(e) {
  const ss = SpreadsheetApp.getActive();
  const title = e.title;
  const qs = questions_(ss.getSheetByName(e.name));
  const ans = ss.getSheetByName(ansName_(title));
  if (!ans || !qs.length) return;
  const nq = qs.length, F = FIXED_COLS.length;
  const width = Math.min(ans.getLastColumn(), F + nq);
  const rows = ans.getLastRow() > 1
    ? ans.getRange(2, 1, ans.getLastRow() - 1, width).getValues().map(function (r) {
      const a = qs.map(function (q, i) { return L.indexOf(String(r[F + i])); });
      return { name: r[1], a: a, score: a.filter(function (x, i) { return x === qs[i].a; }).length };
    })
    : [];
  const n = rows.length;
  const nc = Math.max.apply(null, qs.map(function (q) { return q.ch.length; }));
  const scores = rows.map(function (r) { return r.score; });
  const mean = n ? scores.reduce(function (s, x) { return s + x; }, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(scores.reduce(function (s, x) { return s + Math.pow(x - mean, 2); }, 0) / (n - 1)) : 0;
  const sorted = rows.slice().sort(function (a, b) { return b.score - a.score; });
  const g = n >= 4 ? Math.max(1, Math.round(n * 0.27)) : 0;
  const hi = sorted.slice(0, g), lo = sorted.slice(n - g);

  // ---- รายข้อ
  const head = ['ข้อ', 'เรื่อง', 'เฉลย'].concat(L.slice(0, nc).map(function (c) { return 'เลือก ' + c; }), ['ไม่ตอบ', 'ตอบถูก %', 'p (ความยาก)', 'r (อำนาจจำแนก)', 'ผลวิเคราะห์']);
  let pq = 0;
  const topicMap = {};
  const items = qs.map(function (q, i) {
    const counts = L.slice(0, nc).map(function () { return 0; });
    let blank = 0;
    rows.forEach(function (r) { const c = r.a[i]; if (c >= 0 && c < nc) counts[c]++; else blank++; });
    const p = n ? counts[q.a] / n : 0;
    pq += p * (1 - p);
    const r = g ? (hi.filter(function (x) { return x.a[i] === q.a; }).length - lo.filter(function (x) { return x.a[i] === q.a; }).length) / g : '';
    const notes = [];
    if (n) notes.push(p < 0.2 ? 'ยากมาก' : p < 0.4 ? 'ค่อนข้างยาก' : p <= 0.8 ? 'ยากง่ายพอเหมาะ' : 'ง่าย');
    notes.push(r === '' ? 'ผู้สอบน้อย (ต้อง 4 คนขึ้นไปจึงคำนวณ r)' : r < 0 ? 'จำแนกกลับ — ตรวจเฉลย/โจทย์' : r < 0.2 ? 'จำแนกต่ำ — ควรปรับปรุง' : r < 0.4 ? 'จำแนกพอใช้' : 'จำแนกดี');
    let pw = -1;
    counts.forEach(function (v, c) { if (c !== q.a && v > 0 && (pw < 0 || v > counts[pw])) pw = c; });
    if (pw >= 0 && counts[pw] >= counts[q.a]) notes.push('คนส่วนใหญ่เลือก ' + L[pw] + ' — ตรวจเฉลยหรือสอนแก้ความเข้าใจผิด');
    const dead = counts.map(function (v, c) { return c !== q.a && c < q.ch.length && n && v / n < 0.05 ? L[c] : ''; }).filter(String);
    if (dead.length) notes.push('ตัวลวงแทบไม่มีคนเลือก: ' + dead.join(' '));
    const t = topicMap[q.tp] || (topicMap[q.tp] = { ok: 0, total: 0, items: 0 });
    t.items++; t.total += n; t.ok += counts[q.a];
    return [q.no, q.tp, L[q.a]].concat(counts, [blank, n ? Math.round(p * 100) : '', n ? round_(p) : '', r === '' ? '-' : round_(r), notes.join(' · ')]);
  });
  // ---- สรุปผล
  const k = nq;
  const kr20 = n > 1 && k > 1 && sd > 0 ? (k / (k - 1)) * (1 - pq / (sd * sd)) : '';
  const stats = [
    ['สรุปผลการสอบ: ' + title, ''],
    ['จำนวนครั้งที่สอบ', n],
    ['คะแนนเต็ม', nq],
    ['คะแนนเฉลี่ย', n ? round_(mean) : '-'],
    ['ร้อยละเฉลี่ย', n ? round_(mean / nq * 100) : '-'],
    ['สูงสุด', n ? Math.max.apply(null, scores) : '-'],
    ['ต่ำสุด', n ? Math.min.apply(null, scores) : '-'],
    ['ส่วนเบี่ยงเบนมาตรฐาน', n > 1 ? round_(sd) : '-'],
    ['ความเชื่อมั่น KR-20', kr20 === '' ? '-' : round_(kr20)],
    ['', ''],
    ['ผลรายเรื่อง (ทั้งกลุ่ม)', 'ตอบถูก %'],
  ].concat(Object.keys(topicMap).map(function (t) { return [t + ' (' + topicMap[t].items + ' ข้อ)', topicMap[t].total ? Math.round(topicMap[t].ok / topicMap[t].total * 100) : '-']; }),
    [['', ''], ['ช่วงคะแนน (ร้อยละ)', 'จำนวนครั้ง']]);
  for (let bin = 9; bin >= 0; bin--) {
    stats.push([(bin * 10) + '–' + (bin === 9 ? 100 : bin * 10 + 9) + '%', rows.filter(function (r) { return Math.min(9, Math.floor(r.score / nq * 10)) === bin; }).length]);
  }
  const ana = sheet_(anaName_(title));
  ana.clear();
  ana.getRange(1, 1, stats.length, 2).setValues(stats);
  ana.getRange('A1').setFontSize(14).setFontWeight('bold');
  ana.setColumnWidth(1, 260);
  const top = stats.length + 3;
  ana.getRange(top - 1, 1).setValue('วิเคราะห์รายข้อ').setFontWeight('bold').setFontSize(13);
  ana.getRange(top, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#e8eef8');
  if (items.length) ana.getRange(top + 1, 1, items.length, head.length).setValues(items);
  ana.getRange(top + items.length + 2, 1, 3, 1).setValues([
    ['p = สัดส่วนคนตอบถูก · 0.20–0.80 กำลังดี · ต่ำกว่า 0.20 ยากมาก · เกิน 0.80 ง่าย'],
    ['r = กลุ่มเก่ง 27% ตอบถูกมากกว่ากลุ่มอ่อน 27% เท่าใด · 0.40 ขึ้นไปดี · ต่ำกว่า 0.20 ควรปรับ · ติดลบ = อาจเฉลยผิดหรือโจทย์กำกวม'],
    ['ตัวลวงที่ดีควรมีคนเลือกอย่างน้อย 5%'],
  ]).setFontColor('#64708a');
  ana.setColumnWidth(head.length, 520);
}

// ---------------- ตั้งค่า ----------------
function settings_() {
  if (!SpreadsheetApp.getActive().getSheetByName(SH.SET)) throw new Error('ยังไม่ได้ตั้งค่า — เปิด Google Sheet แล้วเลือกเมนู ห้องสอบ → ตั้งค่าครั้งแรก');
  const v = settingsMap_();
  return {
    title: String(v['ชื่อเว็บ'] || v['ชื่อข้อสอบ'] || 'คลังข้อสอบ'),
    admin: normCode_(v['รหัสผู้ดูแล']),
    open: v['เปิดรับคำตอบ'] === true,
    showKey: v['แสดงเฉลยหลังส่ง'] !== false,
    intro: String(v['คำชี้แจง'] || ''),
  };
}
function settingsMap_() {
  const set = SpreadsheetApp.getActive().getSheetByName(SH.SET);
  const v = {};
  if (set && set.getLastRow()) set.getRange(1, 1, set.getLastRow(), 2).getValues().forEach(function (r) { v[String(r[0]).trim()] = r[1]; });
  return v;
}
function setting_(key) { const v = settingsMap_(); return key in v ? v[key] : null; }
function settingRow_(key) {
  const set = SpreadsheetApp.getActive().getSheetByName(SH.SET);
  if (!set || !set.getLastRow()) return 0;
  const keys = set.getRange(1, 1, set.getLastRow(), 1).getValues().map(function (r) { return String(r[0]).trim(); });
  return keys.indexOf(key) + 1;
}
function setSetting_(key, value, note) {
  const set = SpreadsheetApp.getActive().getSheetByName(SH.SET);
  const r = settingRow_(key) || set.getLastRow() + 1;
  set.getRange(r, 1, 1, 2).setValues([[key, value]]);
  if (note != null) set.getRange(r, 3).setValue(note);
}
function open_() {
  const s = settings_();
  if (!s.open) throw new Error('ปิดใช้งานชั่วคราว — ติดต่อผู้ดูแล');
  return s;
}
function admin_(acode) {
  const s = settings_();
  if (!s.admin) throw new Error('ยังไม่ได้ตั้ง "รหัสผู้ดูแล" ในแผ่นงาน ตั้งค่า');
  if (normCode_(acode) !== s.admin) throw new Error('รหัสผู้ดูแลไม่ถูกต้อง');
}

// ---------------- ผู้ใช้ ----------------
function users_() {
  const sh = sheet_(SH.USERS, USER_COLS);
  const list = [], byCode = {};
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, USER_COLS.length).getValues().forEach(function (r, i) {
      const code = normCode_(r[0]);
      if (!code) return;
      let wrong = [];
      try { wrong = JSON.parse(r[8] || '[]'); } catch (e) { /* แก้มือผิดรูปแบบ → เริ่มใหม่ */ }
      const u = { sheet: sh, row: i + 2, code: code, name: unsafe_(r[1]), studentNo: unsafe_(r[2]), room: unsafe_(r[3]), ok: r[4] === true,
        created: r[5] instanceof Date ? r[5] : null, last: r[6] instanceof Date ? r[6] : null, wrong: Array.isArray(wrong) ? wrong : [] };
      list.push(u);
      byCode[code] = u;
    });
  }
  return { sheet: sh, list: list, byCode: byCode };
}
function login_(code) {
  const c = normCode_(code);
  if (!c) throw new Error('กรุณากรอกรหัสส่วนตัว');
  const u = users_().byCode[c];
  if (!u) throw new Error('ไม่พบรหัสนี้ — ตรวจสอบรหัสอีกครั้ง หรือสมัครใช้งานก่อน');
  if (!u.ok) throw new Error('รหัสนี้ยังรอผู้ดูแลอนุมัติ — แจ้งผู้ดูแลแล้วลองใหม่อีกครั้ง');
  return u;
}
function touch_(u) { // บันทึก "ใช้งานล่าสุด" ไม่เกินชั่วโมงละครั้ง (ประหยัดเวลาเขียนชีต)
  if (!u.last || Date.now() - u.last.getTime() > 3600000) u.sheet.getRange(u.row, 7).setValue(new Date());
}

// ---------------- ประวัติการทำ ----------------
function logRows_() {
  const sh = sheet_(SH.LOG, LOG_COLS);
  if (sh.getLastRow() < 2) return [];
  const modeKey = invert_(MODE), kindKey = invert_(KIND);
  return sh.getRange(2, 1, sh.getLastRow() - 1, LOG_COLS.length).getValues().map(function (r) {
    let cats = {};
    try { cats = JSON.parse(r[11] || '{}'); } catch (e) { /* */ }
    return { t: r[0] instanceof Date ? r[0].getTime() : 0, code: normCode_(r[1]), mode: modeKey[r[3]] || 'exam', kind: kindKey[r[4]] || 'set',
      set: unsafe_(r[5]), cat: unsafe_(r[6]), score: Number(r[7]) || 0, total: Number(r[8]) || 0, pct: Number(r[9]) || 0,
      min: Number(r[10]) || 0, cats: cats };
  });
}
function logOf_(code) {
  return logRows_().filter(function (r) { return r.code === code; }).map(function (r) { delete r.code; return r; });
}

// ---------------- คลังข้อสอบ (แคชไว้ให้เปิดเว็บเร็ว) ----------------
// รายการชุด: เก็บใน Script Properties (ถาวร) สร้างใหม่ตอนนำเข้า/กดเมนูอัปเดต
function catalog_() {
  const raw = getBig_('catalog');
  const list = raw ? JSON.parse(raw) : null;
  return (list || rebuildCatalog_(true)).map(function (x) {
    const title = x[0].slice(EXAM_PREFIX.length).trim();
    return { name: x[0], gid: x[1], nq: x[2], title: title, cat: catOf_(title), special: /^ชุดพิเศษ/.test(title) };
  });
}
function rebuildCatalog_(raw) {
  PropertiesService.getScriptProperties().setProperty('ver', String(Date.now())); // ล้างแคชข้อสอบเดิมทั้งหมด
  const list = SpreadsheetApp.getActive().getSheets()
    .filter(function (sh) { return sh.getName().indexOf(EXAM_PREFIX) === 0; })
    .map(function (sh) { return [sh.getName(), sh.getSheetId(), questions_(sh).length]; })
    .filter(function (x) { return x[2] > 0; });
  const rank = function (x) { const t = x[0].slice(EXAM_PREFIX.length).trim(); const i = CAT_ORDER.indexOf(catOf_(t)); return (i < 0 ? 50 : i) * 2 + (/^ชุดพิเศษ/.test(t) ? 1 : 0); };
  list.sort(function (a, b) { return rank(a) - rank(b) || a[0].localeCompare(b[0], undefined, { numeric: true }); });
  putBig_('catalog', JSON.stringify(list));
  return raw ? list : catalog_();
}

/** หมวด: ตัด "ชุดพิเศษ" และเลขชุดออก · ชุดที่ชื่อมี " - วิชา" ใช้วิชานั้น · คณิต/อังกฤษรวมหมวดเดียวกัน */
function catOf_(title) {
  let t = title.replace(/^ชุดพิเศษ\s*/, '');
  const m = t.match(/\s-\s(.+)$/);
  if (m) t = m[1];
  if (/คณิต/.test(t)) return 'คณิตศาสตร์';
  if (/ภาษาอังกฤษ|english/i.test(t)) return 'ภาษาอังกฤษ';
  return t.replace(/\s*\d+$/, '').trim() || 'ทั่วไป';
}
function catNames_(cat) {
  const seen = {};
  cat.forEach(function (e) { seen[e.cat] = 1; });
  return Object.keys(seen);
}

/** ข้อสอบของชุด (แคช 6 ชม. แบ่งเป็นก้อน เพราะ CacheService รับได้ไม่เกิน 100KB ต่อค่า) */
function qs_(e) {
  const key = 'q' + (PropertiesService.getScriptProperties().getProperty('ver') || '0') + '.' + e.gid;
  const c = CacheService.getScriptCache();
  const n = Number(c.get(key));
  if (n) {
    const keys = Array.from({ length: n }, function (_, i) { return key + '.' + i; });
    const got = c.getAll(keys);
    if (keys.every(function (k) { return got[k] != null; })) return JSON.parse(keys.map(function (k) { return got[k]; }).join(''));
  }
  const sh = SpreadsheetApp.getActive().getSheets().filter(function (x) { return x.getSheetId() === e.gid; })[0];
  const qs = questions_(sh);
  const s = JSON.stringify(qs), size = 25000, o = {};
  const parts = Math.ceil(s.length / size);
  for (let i = 0; i < parts; i++) o[key + '.' + i] = s.slice(i * size, (i + 1) * size);
  o[key] = String(parts);
  try { c.putAll(o, CACHE_SEC); } catch (err) { console.error(err); }
  return qs;
}

/** คอลัมน์: ข้อ | เฉลย | เรื่อง | คำอธิบาย | โจทย์ | ก | ข | ค | ง | จ | เนื้อหาที่ควรรู้ */
function questions_(sh) {
  if (!sh || sh.getLastRow() < 2) return [];
  const out = [];
  sh.getRange(2, 1, sh.getLastRow() - 1, 11).getValues().forEach(function (r) {
    const a = letter_(r[1]);
    const ch = r.slice(5, 10).map(function (c) { return String(c).trim(); });
    while (ch.length && !ch[ch.length - 1]) ch.pop();
    const tx = String(r[4] || '').trim();
    if (!tx || ch.length < 2 || a < 0 || a >= ch.length) return;
    out.push({ no: out.length + 1, a: a, tp: String(r[2] || '').trim() || 'ทั่วไป', ex: String(r[3] || '').trim(), tx: tx, ch: ch, ct: String(r[10] || '').trim() });
  });
  return out;
}

/** ข้อสอบที่ส่งให้หน้าเว็บ: โหมดสอบตัดเฉลย/คำอธิบายออก */
function pub_(e, q, mode) {
  const o = { id: e.gid + '.' + q.no, tx: q.tx, ch: q.ch, tp: q.tp, set: e.title, c: e.cat };
  if (mode !== 'exam') { o.a = q.a; o.ex = q.ex; o.ct = q.ct; }
  return o;
}

/** 'gid.no' → { id, e, q } (ข้ามข้อที่ไม่มีแล้ว) */
function resolve_(ids) {
  const byGid = {};
  catalog_().forEach(function (e) { byGid[e.gid] = e; });
  const maps = {};
  return ids.map(function (id) {
    const m = String(id).match(/^(\d+)\.(\d+)$/);
    const e = m && byGid[m[1]];
    if (!e) return null;
    if (!maps[e.gid]) { maps[e.gid] = {}; qs_(e).forEach(function (q) { maps[e.gid][q.no] = q; }); }
    const q = maps[e.gid][m[2]];
    return q ? { id: id, e: e, q: q } : null;
  }).filter(Boolean);
}

/** สุ่ม n ข้อจากชุดใน pool โดยอ่านไม่เกิน k ชุด (อ่านชีตน้อย = เร็ว) */
function pick_(pool, n, k) {
  const sets = shuffle_(pool.slice()).slice(0, Math.max(1, k));
  let out = [];
  for (let round = 0; out.length < n && round < 3; round++) {
    const per = Math.ceil((n - out.length) / sets.length);
    sets.forEach(function (e) {
      const have = {};
      out.forEach(function (x) { if (x[0] === e) have[x[1].no] = 1; });
      const take = shuffle_(qs_(e).filter(function (q) { return !have[q.no]; })).slice(0, Math.min(per, n - out.length));
      out = out.concat(take.map(function (q) { return [e, q]; }));
    });
  }
  return out;
}

function grade_(items) {
  const topics = {}, cats = {};
  items.forEach(function (x) {
    const t = topics[x.q.tp] || (topics[x.q.tp] = { topic: x.q.tp, ok: 0, total: 0 });
    t.total++; if (x.ok) t.ok++;
    const c = cats[x.e.cat] || (cats[x.e.cat] = [0, 0]);
    c[1]++; if (x.ok) c[0]++;
  });
  const score = items.filter(function (x) { return x.ok; }).length;
  const list = Object.keys(topics).map(function (k) { return topics[k]; });
  const pct = Math.round(score / items.length * 100);
  return {
    score: score, total: items.length, pct: pct, topics: list, cats: cats,
    level: pct >= 80 ? 'ดีมาก' : pct >= 60 ? 'ดี' : pct >= 50 ? 'ผ่านเกณฑ์' : 'ควรทบทวนเพิ่มเติม',
    weak: list.length > 1 ? list.filter(function (t) { return t.ok / t.total < 0.5; }).map(function (t) { return t.topic; }) : [],
    wrong: items.filter(function (x) { return !x.ok; }).map(function (x) { return x.q.no; }).sort(function (a, b) { return a - b; }),
  };
}

// ---------------- ตัวช่วย ----------------
function ansName_(title) { return ('ผล ' + title).slice(0, 99); }
function anaName_(title) { return ('วิเคราะห์ ' + title).slice(0, 99); }

function answersSheet_(title, nq) {
  const sh = sheet_(ansName_(title));
  const head = FIXED_COLS.concat(Array.from({ length: nq }, function (_, i) { return 'ข้อ ' + (i + 1); }));
  const cur = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
  if (cur.length !== head.length || cur[0] !== head[0]) {
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#e8eef8');
    sh.setFrozenRows(1);
  }
  return sh;
}

function sheet_(name, head) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (head) {
      sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#e8eef8');
      sh.setFrozenRows(1);
      if (name === SH.USERS) {
        sh.getRange('A2:A').setNumberFormat('@');
        sh.getRange('E2:E1000').setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
        sh.setColumnWidth(2, 220);
        sh.getRange(1, 5).setNote('ติ๊กเพื่ออนุมัติให้เข้าใช้งาน (หรืออนุมัติในหน้าผู้ดูแลบนเว็บ)');
        sh.hideColumns(9);
      }
      if (name === SH.LOG) sh.hideColumns(12);
    }
  }
  return sh;
}

// Script Properties จำกัด ~9KB ต่อค่า → แบ่งเก็บเป็นก้อน
function putBig_(key, s) {
  const props = PropertiesService.getScriptProperties();
  const size = 2500, o = {}; // ภาษาไทย 3 ไบต์ต่อตัวอักษร
  const n = Math.ceil(s.length / size);
  for (let i = 0; i < n; i++) o[key + '.' + i] = s.slice(i * size, (i + 1) * size);
  o[key] = String(n);
  props.setProperties(o);
}
function getBig_(key) {
  const all = PropertiesService.getScriptProperties().getProperties();
  const n = Number(all[key]);
  if (!n) return null;
  let s = '';
  for (let i = 0; i < n; i++) { if (all[key + '.' + i] == null) return null; s += all[key + '.' + i]; }
  return s;
}

function letter_(v) {
  const s = String(v).trim();
  let i = L.indexOf(s);
  if (i < 0) i = 'abcde'.indexOf(s.toLowerCase());
  if (i < 0 && /^[1-5]$/.test(s)) i = Number(s) - 1;
  return s ? i : -1;
}
function shuffle_(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
function invert_(o) { const r = {}; Object.keys(o).forEach(function (k) { r[o[k]] = k; }); return r; }
function clean_(v, n) { return String(v == null ? '' : v).trim().replace(/\s+/g, ' ').slice(0, n); }
// กันข้อความที่ขึ้นต้นด้วยสูตร (=, +, -, @) ถูกตีความเป็นสูตรในชีต
function safe_(s) { return /^[=+\-@]/.test(s) ? "'" + s : s; }
function unsafe_(v) { return String(v == null ? '' : v).replace(/^'/, ''); }
function normCode_(v) { return String(v || '').trim().toUpperCase().replace(/\s+/g, ''); }
function round_(x) { return Math.round(x * 100) / 100; }
function randomCode_(n) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  while (!/[A-Z]/.test(s)) { // ต้องมีตัวอักษร ไม่อย่างนั้นชีตแปลงเป็นตัวเลข
    s = '';
    for (let i = 0; i < n; i++) s += abc[Math.floor(Math.random() * abc.length)];
  }
  return s;
}
