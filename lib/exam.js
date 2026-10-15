import crypto from 'node:crypto';
import { db } from './db.js';

db.exec(`
CREATE TABLE IF NOT EXISTS exams (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, code TEXT UNIQUE NOT NULL, intro TEXT,
  source TEXT NOT NULL, questions TEXT NOT NULL, open INTEGER DEFAULT 1, show_key INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY, exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  view_key TEXT UNIQUE NOT NULL, name TEXT NOT NULL, student_no TEXT, room TEXT,
  answers TEXT NOT NULL, score INTEGER NOT NULL, total INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS attempts_exam ON attempts(exam_id);
`);

export const LETTERS = ['ก', 'ข', 'ค', 'ง', 'จ'];
const LATIN = ['a', 'b', 'c', 'd', 'e'];
const letterIndex = (s) => {
  s = String(s || '').trim().toLowerCase();
  const i = LETTERS.indexOf(s);
  return i >= 0 ? i : LATIN.indexOf(s);
};

// รหัสเข้าสอบแบบสุ่ม (ตัด 0/O/1/I ที่อ่านสับสน)
export function newCode(len = 8) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(len), (b) => abc[b % abc.length]).join('');
}
export const normCode = (v) => String(v || '').trim().toUpperCase().replace(/\s+/g, '');

/*
 * แปลงข้อความข้อสอบที่วางมา → รายการข้อ
 *   1. คำถาม (หลายบรรทัดได้)
 *   ก. ตัวเลือก   (ใช้ ก-จ หรือ A-E ก็ได้)
 *   ข. ...
 *   ตอบ: ข        (หรือ เฉลย:)
 *   เรื่อง: ...    (ไม่บังคับ — ใช้จัดกลุ่มในการวิเคราะห์)
 *   อธิบาย: ...    (ไม่บังคับ — หลายบรรทัดได้ จนถึงข้อถัดไป)
 */
export function parseExam(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const qs = [], errors = [];
  let q = null, mode = null;
  const push = () => { if (q) qs.push(q); };
  for (const raw of lines) {
    const line = raw.trim();
    let m;
    if ((m = line.match(/^(?:ข้อ(?:ที่)?\s*)?(\d{1,3})\s*[.)]\s*(.*)$/))) {
      push();
      q = { no: Number(m[1]), text: m[2], choices: [], answer: -1, topic: '', explain: '' };
      mode = 'q';
    } else if (!q) {
      if (line) errors.push(`บรรทัด "${line.slice(0, 40)}" อยู่ก่อนข้อที่ 1 — ข้อแรกต้องขึ้นต้นด้วย "1."`);
    } else if ((m = line.match(/^(?:ตอบ|เฉลย|คำตอบ|answer|ans)\s*[:：]?\s*\(?([ก-จA-Ea-e])\)?\.?\s*/i))) {
      q.answer = letterIndex(m[1]); mode = null;
    } else if ((m = line.match(/^(?:เรื่อง|หัวข้อ|topic)\s*[:：]\s*(.*)$/i))) {
      q.topic = m[1].trim(); mode = null;
    } else if ((m = line.match(/^(?:อธิบาย|คำอธิบาย|เหตุผล|explain)\s*[:：]\s*(.*)$/i))) {
      q.explain = m[1]; mode = 'e';
    } else if (mode !== 'e' && (m = line.match(/^\(?([กขคงจ]|[A-Ea-e])\s*[.)]\s*(.+)$/))
      && letterIndex(m[1]) === q.choices.length) {
      q.choices.push(m[2].trim()); mode = 'c';
    } else if (line) {
      if (mode === 'q') q.text += (q.text ? '\n' : '') + line;
      else if (mode === 'e') q.explain += (q.explain ? '\n' : '') + line;
      else if (mode === 'c') q.choices[q.choices.length - 1] += ' ' + line;
    }
  }
  push();
  if (!qs.length && !errors.length) errors.push('ไม่พบข้อสอบ — ข้อแรกต้องขึ้นต้นด้วย "1."');
  qs.forEach((x, i) => {
    const n = `ข้อ ${x.no}`;
    if (!x.text.trim()) errors.push(`${n}: ไม่มีคำถาม`);
    if (x.choices.length < 2) errors.push(`${n}: ต้องมีตัวเลือกอย่างน้อย 2 ตัว (ขึ้นบรรทัดด้วย ก. ข. ค. ง.)`);
    if (x.answer < 0) errors.push(`${n}: ไม่มีเฉลย (เพิ่มบรรทัด "ตอบ: ก")`);
    else if (x.answer >= x.choices.length) errors.push(`${n}: เฉลย "${LETTERS[x.answer]}" ไม่มีในตัวเลือก`);
    x.no = i + 1;
    x.topic = x.topic || 'ทั่วไป';
    x.explain = x.explain.trim();
  });
  return { questions: qs, errors };
}

export const getExam = (id) => {
  const e = db.prepare('SELECT * FROM exams WHERE id=?').get(id);
  if (e) e.qs = JSON.parse(e.questions);
  return e;
};
export const findOpenExam = (code) => {
  const e = code ? db.prepare('SELECT * FROM exams WHERE code=? AND open=1').get(code) : null;
  if (e) e.qs = JSON.parse(e.questions);
  return e;
};

// ตรวจคำตอบ: answers[i] = ดัชนีตัวเลือก หรือ -1 (ไม่ตอบ)
export function grade(qs, answers) {
  const topics = new Map();
  let score = 0;
  const items = qs.map((q, i) => {
    const a = answers[i] ?? -1, ok = a === q.answer;
    if (ok) score++;
    const t = topics.get(q.topic) || { topic: q.topic, ok: 0, total: 0 };
    t.total++; if (ok) t.ok++;
    topics.set(q.topic, t);
    return { ...q, chosen: a, ok };
  });
  return { score, total: qs.length, items, topics: [...topics.values()] };
}

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

// วิเคราะห์ข้อสอบทั้งชุด: ค่าความยาก (p), อำนาจจำแนก (r) แบบกลุ่มสูง-ต่ำ 27%, ตัวลวง
export function analyze(exam, attempts) {
  const qs = exam.qs, n = attempts.length;
  const rows = attempts.map((a) => ({ ...a, ans: JSON.parse(a.answers) }));
  const scores = rows.map((a) => a.score);
  const mean = n ? scores.reduce((s, x) => s + x, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(scores.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : 0;
  const sorted = [...rows].sort((a, b) => b.score - a.score);
  const g = n >= 4 ? Math.max(1, Math.round(n * 0.27)) : 0;
  const hi = sorted.slice(0, g), lo = sorted.slice(n - g);

  const items = qs.map((q, i) => {
    const counts = q.choices.map(() => 0); let blank = 0;
    for (const a of rows) { const c = a.ans[i] ?? -1; if (c >= 0 && c < counts.length) counts[c]++; else blank++; }
    const p = n ? counts[q.answer] / n : 0;
    const r = g ? (hi.filter((a) => a.ans[i] === q.answer).length - lo.filter((a) => a.ans[i] === q.answer).length) / g : null;
    const pLabel = !n ? '-' : p < 0.2 ? 'ยากมาก' : p < 0.4 ? 'ค่อนข้างยาก' : p <= 0.8 ? 'ยากง่ายพอเหมาะ' : 'ง่าย';
    const rLabel = r === null ? 'ผู้สอบน้อยเกินไป' : r < 0 ? 'จำแนกกลับ — ตรวจเฉลย/คำถาม' : r < 0.2 ? 'จำแนกต่ำ — ควรปรับปรุง' : r < 0.4 ? 'จำแนกได้พอใช้' : 'จำแนกได้ดี';
    // ตัวลวงที่ดีควรมีคนเลือกอย่างน้อย ~5% และกลุ่มต่ำเลือกมากกว่ากลุ่มสูง
    const distractors = q.choices.map((_, c) => {
      if (c === q.answer) return null;
      const share = n ? counts[c] / n : 0;
      const hiC = hi.filter((a) => a.ans[i] === c).length, loC = lo.filter((a) => a.ans[i] === c).length;
      return n && share < 0.05 ? 'แทบไม่มีคนเลือก' : g && hiC > loC ? 'กลุ่มเก่งเลือกมากกว่า' : '';
    });
    let popularWrong = -1; // ตัวเลือกผิดที่คนเลือกมากที่สุด
    counts.forEach((v, c) => { if (c !== q.answer && v > 0 && (popularWrong < 0 || v > counts[popularWrong])) popularWrong = c; });
    return { ...q, counts, blank, p, r, pLabel, rLabel, distractors, popularWrong, pPct: pct(counts[q.answer], n) };
  });

  const topicMap = new Map();
  qs.forEach((q, i) => {
    const t = topicMap.get(q.topic) || { topic: q.topic, ok: 0, total: 0, items: 0 };
    t.items++; t.total += n; t.ok += items[i].counts[q.answer];
    topicMap.set(q.topic, t);
  });

  // คะแนนเป็นช่วง 10% สำหรับกราฟแท่ง
  const bins = Array.from({ length: 10 }, (_, k) => ({ label: `${k * 10}-${k === 9 ? 100 : k * 10 + 9}%`, count: 0 }));
  for (const a of rows) bins[Math.min(9, Math.floor((a.score / (a.total || 1)) * 10))].count++;

  // KR-20 ความเชื่อมั่นของแบบทดสอบ
  const k = qs.length;
  const pq = items.reduce((s, it) => s + it.p * (1 - it.p), 0);
  const kr20 = n > 1 && k > 1 && sd > 0 ? (k / (k - 1)) * (1 - pq / (sd * sd)) : null;

  return {
    n, mean, sd, kr20, total: k,
    max: n ? Math.max(...scores) : 0, min: n ? Math.min(...scores) : 0,
    items, topics: [...topicMap.values()].map((t) => ({ ...t, pct: pct(t.ok, t.total) })), bins, rows,
  };
}

// คำแนะนำรายบุคคลจากผลรายเรื่อง
export function advice(g) {
  const weak = g.topics.filter((t) => t.ok / t.total < 0.5).map((t) => t.topic);
  const strong = g.topics.filter((t) => t.ok / t.total >= 0.8).map((t) => t.topic);
  const p = g.total ? g.score / g.total : 0;
  const level = p >= 0.8 ? 'ดีมาก' : p >= 0.6 ? 'ดี' : p >= 0.5 ? 'ผ่านเกณฑ์' : 'ควรทบทวนเพิ่มเติม';
  return { level, weak, strong, pct: pct(g.score, g.total) };
}
