/**
 * ห้องสอบออนไลน์ด้วย Google Sheets + Google Drive (Google Apps Script)
 * - รูปข้อสอบ: อยู่ในโฟลเดอร์ Google Drive (ไม่ต้องแชร์ให้ใคร สคริปต์ส่งรูปให้ผู้สอบเอง)
 * - เฉลย: แผ่นงาน "เฉลย" (ผู้สอบมองไม่เห็น ตรวจคะแนนฝั่งเซิร์ฟเวอร์)
 * - คำตอบ/คะแนน: แผ่นงาน "คำตอบ" · ผลวิเคราะห์: "สรุปผล" และ "วิเคราะห์รายข้อ"
 * วิธีติดตั้งดู README.md
 */

const SH = { SET: 'ตั้งค่า', KEY: 'เฉลย', ANS: 'คำตอบ', SUM: 'สรุปผล', ANA: 'วิเคราะห์รายข้อ' };
const L = ['ก', 'ข', 'ค', 'ง', 'จ'];
const EXAM_PREFIX = 'ข้อสอบ '; // แผ่นงานที่ขึ้นต้นด้วยคำนี้ = ข้อสอบ 1 ชุด (หลายชุดได้)
const FIXED_COLS = ['เวลาส่ง', 'ชื่อ-นามสกุล', 'เลขที่/รหัส', 'ห้อง', 'คะแนน', 'เต็ม', 'ร้อยละ', 'ระดับ', 'เรื่องที่ควรทบทวน', 'ข้อที่ผิด'];

// ---------------- เว็บ ----------------
function doGet() {
  const t = HtmlService.createTemplateFromFile('Index');
  return t.evaluate()
    .setTitle(settings_().title || 'ห้องสอบออนไลน์')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .addMetaTag('robots', 'noindex, nofollow');
}

/** ข้อมูลหน้าแรก (ยังไม่ส่งข้อสอบ) — รายชื่อชุดข้อสอบไม่มีเฉลย */
function getInfo() {
  const s = settings_();
  const exams = examSheets_().map(function (sh) { return { id: sh.getName(), title: examTitle_(sh), nq: questions_(sh).length }; })
    .filter(function (e) { return e.nq > 0; });
  return { title: s.title, needCode: !!s.code, open: s.open, exams: exams };
}

/** เปิดข้อสอบ: ตรวจรหัส แล้วส่งจำนวนข้อ/หน้ารูป (ไม่ส่งเฉลย) */
function getExam(code, id) {
  const s = checkAccess_(code);
  const sh = findExam_(id);
  const qs = questions_(sh);
  if (!qs.length) throw new Error('ข้อสอบชุดนี้ยังไม่มีเฉลย');
  const typed = qs.every(function (q) { return q.text; }); // ข้อสอบแบบพิมพ์ทุกข้อ
  const files = s.folder && !typed ? images_(s) : [];
  const pages = files.length;
  if (!pages && !typed) throw new Error('ยังไม่มีไฟล์ข้อสอบ (รูปหรือ PDF) ในโฟลเดอร์ Google Drive');
  return {
    id: sh.getName(), title: examTitle_(sh), intro: s.intro, nq: qs.length, nc: s.nc, pages: pages,
    pdf: files.map(function (f) { return isPdf_(f) ? f.getId() : null; }), // PDF แสดงผ่านตัวดูของ Google Drive
    questions: typed ? qs.map(function (q) { return { text: q.text, choices: q.choices }; }) : null, // ไม่ส่งเฉลย
  };
}

/** รูปข้อสอบหน้า i (base64) */
function getPage(code, i) {
  const s = checkAccess_(code);
  const files = images_(s);
  const f = files[Number(i)];
  if (!f || isPdf_(f)) throw new Error('ไม่พบรูปหน้านี้');
  const blob = f.getBlob();
  return { mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

/** ส่งคำตอบ → ตรวจ บันทึกลงชีต แล้วส่งผลกลับ */
function submit(code, id, p) {
  const s = checkAccess_(code);
  const ex = findExam_(id);
  const qs = questions_(ex);
  const name = String(p && p.name || '').trim().slice(0, 100);
  if (!name) throw new Error('กรุณากรอกชื่อ-นามสกุล');
  const studentNo = String(p.studentNo || '').trim().slice(0, 20);
  const room = String(p.room || '').trim().slice(0, 20);
  const ans = qs.map(function (q, i) {
    const v = Number(p.answers && p.answers[i]);
    return Number.isInteger(v) && v >= 0 && v < s.nc ? v : -1;
  });
  const g = grade_(qs, ans);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = answersSheet_(examTitle_(ex), qs.length);
    sh.appendRow([new Date(), safe_(name), safe_(studentNo), safe_(room), g.score, g.total, g.pct, g.level,
      g.weak.join(', '), g.wrong.join(', ')].concat(ans.map(function (a) { return a >= 0 ? L[a] : '-'; })));
    SpreadsheetApp.flush();
    try { analyzeExam_(ex); } catch (e) { console.error(e); } // วิเคราะห์ใหม่ทุกครั้งที่มีคนส่ง
  } finally {
    lock.releaseLock();
  }

  const out = { title: examTitle_(ex), score: g.score, total: g.total, pct: g.pct, level: g.level, topics: g.topics, weak: g.weak, strong: g.strong, wrong: g.wrong, showKey: s.showKey };
  if (s.showKey) out.items = g.items;
  return out;
}

// ---------------- เมนูในชีต ----------------
function onOpen() {
  SpreadsheetApp.getUi().createMenu('ห้องสอบ')
    .addItem('1) ตั้งค่าครั้งแรก', 'setup')
    .addItem('2) ให้ผู้สอบเปิดดู PDF ได้ (ถ้าใช้ PDF)', 'sharePdfs')
    .addItem('นำเข้าข้อสอบจาก Drive (ไฟล์ชื่อ "ข้อสอบ ...")', 'importExams')
    .addItem('คำนวณผลวิเคราะห์ใหม่', 'analyze')
    .addItem('เปิด/ปิดรับคำตอบ', 'toggleOpen')
    .addSeparator()
    .addItem('ล้างคำตอบทั้งหมด (เริ่มสอบรอบใหม่)', 'clearAnswers')
    .addToUi();
}

function setup() {
  const ss = SpreadsheetApp.getActive();
  let set = ss.getSheetByName(SH.SET);
  if (!set) {
    set = ss.insertSheet(SH.SET, 0);
    const folder = DriveApp.createFolder('รูปข้อสอบ - ' + ss.getName());
    set.getRange(1, 1, 8, 3).setValues([
      ['ชื่อข้อสอบ', 'ข้อสอบชุดที่ 1', 'ชื่อที่แสดงบนหน้าเว็บ'],
      ['รหัสเข้าสอบ', randomCode_(), 'ให้เฉพาะผู้สอบ · ลบทิ้งได้ถ้าไม่ต้องการรหัส'],
      ['เปิดรับคำตอบ', true, 'ติ๊กออกเมื่อสอบเสร็จ'],
      ['แสดงเฉลยหลังส่ง', true, 'ผู้สอบเห็นข้อที่ผิดและคำตอบที่ถูกทันทีหลังส่ง'],
      ['จำนวนตัวเลือก', 4, '2–5 ตัว (ก ข ค ง จ)'],
      ['คำชี้แจง', 'อ่านโจทย์แล้วเลือกคำตอบที่ถูกที่สุดเพียงข้อเดียว', ''],
      ['โฟลเดอร์รูปข้อสอบ', folder.getUrl(), 'อัปโหลดรูปหรือ PDF ข้อสอบลงโฟลเดอร์นี้ (เรียงตามชื่อไฟล์ เช่น 01.jpg, 02.jpg)'],
      ['ลิงก์เว็บสอบ', 'ยังไม่ได้ Deploy', 'ได้หลังจาก Deploy → New deployment → Web app'],
    ]);
    set.getRange('B3:B4').insertCheckboxes();
    set.getRange('A1:A8').setFontWeight('bold');
    set.setColumnWidth(1, 160); set.setColumnWidth(2, 360); set.setColumnWidth(3, 420);
    set.getRange('C1:C8').setFontColor('#64708a');
  }
  let key = ss.getSheetByName(SH.KEY);
  if (!key) {
    key = ss.insertSheet(SH.KEY, 1);
    key.getRange(1, 1, 1, 10).setValues([['ข้อ', 'เฉลย', 'เรื่อง (ไม่บังคับ)', 'คำอธิบาย (ไม่บังคับ)', 'โจทย์ (เว้นว่างถ้าใช้รูป)', 'ก', 'ข', 'ค', 'ง', 'จ']]).setFontWeight('bold').setBackground('#e8eef8');
    const nums = [];
    for (let i = 1; i <= 20; i++) nums.push([i]);
    key.getRange(2, 1, 20, 1).setValues(nums);
    key.getRange('B2:B201').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(L, true).setAllowInvalid(false).build());
    key.setFrozenRows(1);
    key.setColumnWidth(3, 160); key.setColumnWidth(4, 320); key.setColumnWidth(5, 420);
    key.getRange('L1').setValue('ใส่เฉลยในคอลัมน์ B ทีละข้อ — ข้อสอบแบบรูป: เว้นคอลัมน์ E–J ว่าง · ข้อสอบแบบพิมพ์: ใส่โจทย์ในคอลัมน์ E และตัวเลือกใน F–J').setFontColor('#64708a');
  }
  ['Sheet1', 'แผ่น1', 'ชีต1'].forEach(function (n) { const x = ss.getSheetByName(n); if (x && ss.getSheets().length > 2 && x.getLastRow() === 0) ss.deleteSheet(x); });
  ss.setActiveSheet(key);
  SpreadsheetApp.getUi().alert('ตั้งค่าเรียบร้อย\n\n1. ใส่ข้อสอบในแผ่นงาน "เฉลย" หรือนำเข้าแผ่นงานชื่อ "ข้อสอบ ..." ได้หลายชุด\n2. (ถ้าใช้รูป/PDF) อัปโหลดลงโฟลเดอร์ใน Drive ตามลิงก์ในแผ่นงาน "ตั้งค่า"\n3. Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone)');
}

/** คัดลอกข้อสอบจากไฟล์ Google Sheet ใน Drive ที่ชื่อขึ้นต้นด้วย "ข้อสอบ " มาเป็นแผ่นงานในไฟล์นี้ (ชุดละแผ่นงาน) */
function importExams() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  const files = [];
  const it = DriveApp.searchFiles('mimeType = "application/vnd.google-apps.spreadsheet" and trashed = false and title contains "' + EXAM_PREFIX.trim() + '"');
  while (it.hasNext()) {
    const f = it.next();
    if (f.getName().indexOf(EXAM_PREFIX) === 0 && f.getId() !== ss.getId()) files.push(f);
  }
  if (!files.length) { ui.alert('ไม่พบไฟล์ข้อสอบใน Drive (ชื่อไฟล์ต้องขึ้นต้นด้วย "' + EXAM_PREFIX + '")'); return; }
  files.sort(function (a, b) { return a.getName().localeCompare(b.getName(), undefined, { numeric: true }); });
  const names = files.map(function (f) { return '• ' + f.getName(); }).join('\n');
  if (ui.alert('นำเข้าข้อสอบ ' + files.length + ' ชุด?', names + '\n\n(แผ่นงานชื่อเดียวกันจะถูกแทนที่ · ผลสอบเดิมไม่หาย)', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  files.forEach(function (f) {
    const src = SpreadsheetApp.openById(f.getId()).getSheets()[0];
    const values = src.getDataRange().getDisplayValues();
    const name = f.getName().slice(0, 99);
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.clear();
    sh.getRange(1, 1, values.length, values[0].length).setNumberFormat('@').setValues(values);
    sh.getRange(1, 1, 1, values[0].length).setFontWeight('bold').setBackground('#e8eef8');
    sh.setFrozenRows(1);
    sh.setColumnWidth(4, 280); sh.setColumnWidth(5, 420);
  });
  ui.alert('นำเข้าเรียบร้อย ' + files.length + ' ชุด\nผู้สอบจะเห็นรายชื่อชุดให้เลือกในหน้าเว็บทันที (ไม่ต้อง Deploy ใหม่)');
}

function toggleOpen() {
  const set = SpreadsheetApp.getActive().getSheetByName(SH.SET);
  const c = set.getRange('B3');
  c.setValue(!c.getValue());
  SpreadsheetApp.getActive().toast(c.getValue() ? 'เปิดรับคำตอบแล้ว' : 'ปิดรับคำตอบแล้ว');
}

function clearAnswers() {
  const ui = SpreadsheetApp.getUi();
  if (ui.alert('ลบคำตอบและผลวิเคราะห์ทั้งหมด?', 'ควรดาวน์โหลด/คัดลอกชีตเก็บไว้ก่อน — กู้คืนไม่ได้', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  const ss = SpreadsheetApp.getActive();
  ss.getSheets().forEach(function (x) {
    const n = x.getName();
    if (n.indexOf('ผล ') === 0 || n.indexOf('วิเคราะห์ ') === 0 || [SH.ANS, SH.SUM, SH.ANA].indexOf(n) >= 0) ss.deleteSheet(x);
  });
}

// ---------------- วิเคราะห์ผล ----------------
function analyze() {
  examSheets_().forEach(analyzeExam_);
}

function analyzeExam_(ex) {
  const ss = SpreadsheetApp.getActive();
  const title = examTitle_(ex);
  const qs = questions_(ex);
  const ans = ss.getSheetByName(ansName_(title));
  if (!ans) return;
  const nq = qs.length, F = FIXED_COLS.length;
  const rows = ans && ans.getLastRow() > 1
    ? ans.getRange(2, 1, ans.getLastRow() - 1, F + nq).getValues().map(function (r) {
      const a = r.slice(F).map(function (x) { return L.indexOf(String(x)); });
      return { name: r[1], a: a, score: a.filter(function (x, i) { return x === qs[i].answer; }).length };
    })
    : [];
  const n = rows.length;
  const nc = settings_().nc;
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
    const p = n ? counts[q.answer] / n : 0;
    pq += p * (1 - p);
    const r = g ? (hi.filter(function (x) { return x.a[i] === q.answer; }).length - lo.filter(function (x) { return x.a[i] === q.answer; }).length) / g : '';
    const notes = [];
    if (n) notes.push(p < 0.2 ? 'ยากมาก' : p < 0.4 ? 'ค่อนข้างยาก' : p <= 0.8 ? 'ยากง่ายพอเหมาะ' : 'ง่าย');
    notes.push(r === '' ? 'ผู้สอบน้อย (ต้อง 4 คนขึ้นไปจึงคำนวณ r)' : r < 0 ? 'จำแนกกลับ — ตรวจเฉลย/โจทย์' : r < 0.2 ? 'จำแนกต่ำ — ควรปรับปรุง' : r < 0.4 ? 'จำแนกพอใช้' : 'จำแนกดี');
    let pw = -1;
    counts.forEach(function (v, c) { if (c !== q.answer && v > 0 && (pw < 0 || v > counts[pw])) pw = c; });
    if (pw >= 0 && counts[pw] >= counts[q.answer]) notes.push('คนส่วนใหญ่เลือก ' + L[pw] + ' — ตรวจเฉลยหรือสอนแก้ความเข้าใจผิด');
    const dead = counts.map(function (v, c) { return c !== q.answer && n && v / n < 0.05 ? L[c] : ''; }).filter(String);
    if (dead.length) notes.push('ตัวลวงแทบไม่มีคนเลือก: ' + dead.join(' '));
    const t = topicMap[q.topic] || (topicMap[q.topic] = { ok: 0, total: 0, items: 0 });
    t.items++; t.total += n; t.ok += counts[q.answer];
    return [q.no, q.topic, L[q.answer]].concat(counts, [blank, n ? Math.round(p * 100) : '', n ? round_(p) : '', r === '' ? '-' : round_(r), notes.join(' · ')]);
  });
  // ---- สรุปผล
  const k = nq;
  const kr20 = n > 1 && k > 1 && sd > 0 ? (k / (k - 1)) * (1 - pq / (sd * sd)) : '';
  const stats = [
    ['สรุปผลการสอบ: ' + title, ''],
    ['จำนวนผู้สอบ', n],
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
    [['', ''], ['ช่วงคะแนน (ร้อยละ)', 'จำนวนคน']]);
  for (let bin = 9; bin >= 0; bin--) {
    stats.push([(bin * 10) + '–' + (bin === 9 ? 100 : bin * 10 + 9) + '%', rows.filter(function (r) { return Math.min(9, Math.floor(r.score / nq * 10)) === bin; }).length]);
  }
  const ana = sheet_(anaName_(title));
  ana.clear();
  ana.getRange(1, 1, stats.length, 2).setValues(stats);
  ana.getRange('A1').setFontSize(14).setFontWeight('bold');
  ana.setColumnWidth(1, 260);
  // ---- วิเคราะห์รายข้อ (ใต้สรุปผล)
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

// ---------------- ตัวช่วย ----------------
function settings_() {
  const set = SpreadsheetApp.getActive().getSheetByName(SH.SET);
  if (!set) throw new Error('ยังไม่ได้ตั้งค่า — เปิด Google Sheet แล้วเลือกเมนู ห้องสอบ → ตั้งค่าครั้งแรก');
  const v = {};
  set.getRange(1, 1, Math.max(1, set.getLastRow()), 2).getValues().forEach(function (r) { v[String(r[0]).trim()] = r[1]; });
  const nc = Math.min(5, Math.max(2, parseInt(v['จำนวนตัวเลือก'], 10) || 4));
  return {
    title: String(v['ชื่อข้อสอบ'] || 'ห้องสอบออนไลน์'),
    code: normCode_(v['รหัสเข้าสอบ']),
    open: v['เปิดรับคำตอบ'] === true,
    showKey: v['แสดงเฉลยหลังส่ง'] === true,
    nc: nc,
    intro: String(v['คำชี้แจง'] || ''),
    folder: String(v['โฟลเดอร์รูปข้อสอบ'] || ''),
  };
}

function checkAccess_(code) {
  const s = settings_();
  if (!s.open) throw new Error('ข้อสอบชุดนี้ปิดรับคำตอบแล้ว');
  if (s.code && normCode_(code) !== s.code) throw new Error('รหัสเข้าสอบไม่ถูกต้อง');
  return s;
}

// ---- ชุดข้อสอบ: แผ่นงานชื่อ "ข้อสอบ ..." (ถ้าไม่มี ใช้แผ่นงาน "เฉลย" แบบเดิม)
function examSheets_() {
  const ss = SpreadsheetApp.getActive();
  const list = ss.getSheets().filter(function (x) { return x.getName().indexOf(EXAM_PREFIX) === 0; });
  if (list.length) return list;
  const key = ss.getSheetByName(SH.KEY);
  return key ? [key] : [];
}
function examTitle_(sh) {
  const n = sh.getName();
  return n.indexOf(EXAM_PREFIX) === 0 ? n.slice(EXAM_PREFIX.length).trim() : settings_().title;
}
function findExam_(id) {
  const list = examSheets_();
  const sh = list.filter(function (x) { return x.getName() === id; })[0] || (list.length === 1 ? list[0] : null);
  if (!sh) throw new Error('ไม่พบชุดข้อสอบนี้');
  return sh;
}
function ansName_(title) { return ('ผล ' + title).slice(0, 99); }
function anaName_(title) { return ('วิเคราะห์ ' + title).slice(0, 99); }

function questions_(key) {
  if (!key || key.getLastRow() < 2) return [];
  const nc = settings_().nc;
  const out = [];
  key.getRange(2, 1, key.getLastRow() - 1, 5 + nc).getValues().forEach(function (r) {
    const a = letter_(r[1]);
    if (a < 0 || a >= nc) return;
    out.push({ no: out.length + 1, answer: a, topic: String(r[2] || '').trim() || 'ทั่วไป', explain: String(r[3] || '').trim(),
      text: String(r[4] || '').trim(), choices: r.slice(5, 5 + nc).map(function (c) { return String(c).trim(); }) });
  });
  return out;
}

function letter_(v) {
  const s = String(v).trim();
  let i = L.indexOf(s);
  if (i < 0) i = 'abcde'.indexOf(s.toLowerCase());
  if (i < 0 && /^[1-5]$/.test(s)) i = Number(s) - 1;
  return s ? i : -1;
}

function images_(s) {
  const m = s.folder.match(/[-\w]{25,}/);
  if (!m) return [];
  const cache = CacheService.getScriptCache();
  const hit = cache.get('img:' + m[0]);
  if (hit) return JSON.parse(hit).map(function (id) { return DriveApp.getFileById(id); });
  const files = [];
  const it = DriveApp.getFolderById(m[0]).getFiles();
  while (it.hasNext()) { const f = it.next(); if (/^image\//.test(f.getMimeType()) || isPdf_(f)) files.push(f); }
  files.sort(function (a, b) { return a.getName().localeCompare(b.getName(), undefined, { numeric: true }); });
  cache.put('img:' + m[0], JSON.stringify(files.map(function (f) { return f.getId(); })), 120);
  return files;
}

function isPdf_(f) { return f.getMimeType() === 'application/pdf'; }

/** PDF ต้องเปิดสิทธิ์ "ทุกคนที่มีลิงก์ดูได้" ผู้สอบจึงจะเห็นในหน้าเว็บ (รูปภาพไม่ต้อง) */
function sharePdfs() {
  const pdfs = images_(settings_()).filter(isPdf_);
  pdfs.forEach(function (f) { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); });
  SpreadsheetApp.getUi().alert(pdfs.length ? 'เปิดสิทธิ์ดูแบบมีลิงก์ให้ PDF ' + pdfs.length + ' ไฟล์แล้ว\n(คนที่ไม่มีลิงก์ไฟล์จะหาไม่เจอ — ลิงก์ไฟล์ไม่ได้แสดงที่ใด)' : 'ไม่พบไฟล์ PDF ในโฟลเดอร์ข้อสอบ');
}

function grade_(qs, ans) {
  const topics = {};
  const items = qs.map(function (q, i) {
    const ok = ans[i] === q.answer;
    const t = topics[q.topic] || (topics[q.topic] = { topic: q.topic, ok: 0, total: 0 });
    t.total++; if (ok) t.ok++;
    return { no: q.no, chosen: ans[i], answer: q.answer, ok: ok, explain: q.explain, topic: q.topic, text: q.text };
  });
  const score = items.filter(function (x) { return x.ok; }).length;
  const list = Object.keys(topics).map(function (k) { return topics[k]; });
  const pct = qs.length ? Math.round(score / qs.length * 100) : 0;
  return {
    score: score, total: qs.length, pct: pct, items: items, topics: list,
    level: pct >= 80 ? 'ดีมาก' : pct >= 60 ? 'ดี' : pct >= 50 ? 'ผ่านเกณฑ์' : 'ควรทบทวนเพิ่มเติม',
    weak: list.length > 1 ? list.filter(function (t) { return t.ok / t.total < 0.5; }).map(function (t) { return t.topic; }) : [],
    strong: list.length > 1 ? list.filter(function (t) { return t.ok / t.total >= 0.8; }).map(function (t) { return t.topic; }) : [],
    wrong: items.filter(function (x) { return !x.ok; }).map(function (x) { return x.no; }),
  };
}

function answersSheet_(title, nq) {
  const sh = sheet_(ansName_(title));
  const head = FIXED_COLS.concat(Array.from({ length: nq }, function (_, i) { return 'ข้อ ' + (i + 1); }));
  const cur = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
  if (cur.length !== head.length || cur[0] !== head[0]) {
    if (sh.getLastRow() > 1 && cur.length !== head.length) throw new Error('จำนวนข้อในเฉลยไม่ตรงกับคำตอบเดิม — ครูต้องล้างคำตอบเก่าก่อน');
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#e8eef8');
    sh.setFrozenRows(1);
  }
  return sh;
}

function sheet_(name) {
  const ss = SpreadsheetApp.getActive();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

// กันข้อความที่ขึ้นต้นด้วยสูตร (=, +, -, @) ถูกตีความเป็นสูตรในชีต
function safe_(s) { return /^[=+\-@]/.test(s) ? "'" + s : s; }
function normCode_(v) { return String(v || '').trim().toUpperCase().replace(/\s+/g, ''); }
function round_(x) { return Math.round(x * 100) / 100; }
function randomCode_() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}
