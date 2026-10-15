import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { db } from '../lib/db.js';
import { formToken, checkFormToken, token } from '../lib/helpers.js';
import { findOpenExam, normCode, grade, advice, LETTERS } from '../lib/exam.js';

// ห้องสอบออนไลน์ — ไม่มีลิงก์จากหน้าเว็บ ไม่ให้ search engine เก็บ และต้องมีรหัสเข้าสอบจากครู
const r = Router();

r.use((req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.set('Cache-Control', 'no-store');
  res.locals.L = LETTERS;
  next();
});

// นักเรียนทั้งห้องมักใช้ IP เดียวกัน (เน็ตโรงเรียน) จึงเผื่อจำนวนครั้งไว้มาก แต่ยังกันการสุ่มรหัส
const codeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 200, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => res.status(429).render('exam/enter', { title: 'เข้าสอบ', ft: formToken(req, res), error: 'ลองรหัสบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่', code: '' }) });

r.get('/', (req, res) => res.render('exam/enter', { title: 'เข้าสอบ', ft: formToken(req, res), error: '', code: '' }));

r.post('/', codeLimiter, (req, res) => {
  const code = normCode(req.body.code).slice(0, 40);
  const back = (error, status = 400) => res.status(status).render('exam/enter', { title: 'เข้าสอบ', ft: formToken(req, res), error, code });
  if (!checkFormToken(req)) return back('เซสชันหมดอายุ กรุณาลองใหม่อีกครั้ง');
  const exam = findOpenExam(code);
  if (!exam) return back('รหัสเข้าสอบไม่ถูกต้อง หรือข้อสอบชุดนี้ปิดแล้ว', 404);
  res.render('exam/take', { title: exam.title, exam, code, ft: formToken(req, res), error: '', prev: {} });
});

r.post('/submit', codeLimiter, (req, res) => {
  const b = req.body || {};
  const code = normCode(b.code).slice(0, 40);
  const exam = findOpenExam(code);
  if (!exam) return res.status(404).render('exam/enter', { title: 'เข้าสอบ', ft: formToken(req, res), error: 'ข้อสอบชุดนี้ปิดรับคำตอบแล้ว หรือรหัสไม่ถูกต้อง', code });
  const answers = exam.qs.map((q, i) => {
    const v = /^\d$/.test(b[`q${i}`] || '') ? Number(b[`q${i}`]) : -1;
    return v < q.choices.length ? v : -1;
  });
  const prev = { name: String(b.name || '').trim().slice(0, 100), student_no: String(b.student_no || '').trim().slice(0, 20),
    room: String(b.room || '').trim().slice(0, 20), answers };
  const again = (error) => res.status(400).render('exam/take', { title: exam.title, exam, code, ft: formToken(req, res), error, prev });
  if (!checkFormToken(req)) return again('เซสชันหมดอายุ กรุณากดส่งคำตอบอีกครั้ง');
  if (!prev.name) return again('กรุณากรอกชื่อ-นามสกุล');

  const g = grade(exam.qs, answers);
  const key = token(18);
  db.prepare('INSERT INTO attempts (exam_id, view_key, name, student_no, room, answers, score, total) VALUES (?,?,?,?,?,?,?,?)')
    .run(exam.id, key, prev.name, prev.student_no, prev.room, JSON.stringify(answers), g.score, g.total);
  res.redirect(303, `/exam/r/${key}`);
});

// หน้าผลสอบส่วนตัว — เปิดได้เฉพาะผู้ที่มีลิงก์ (คีย์สุ่ม)
r.get('/r/:key', (req, res, next) => {
  if (!/^[\w-]{20,40}$/.test(req.params.key)) return next();
  const a = db.prepare('SELECT a.*, e.title, e.questions, e.show_key FROM attempts a JOIN exams e ON e.id=a.exam_id WHERE a.view_key=?').get(req.params.key);
  if (!a) return next();
  const g = grade(JSON.parse(a.questions), JSON.parse(a.answers));
  res.render('exam/result', { title: `ผลสอบ ${a.title}`, a, g, adv: advice(g) });
});

export default r;
