import { db } from '../lib/db.js';
import { getExam, parseExam, newCode, normCode, analyze, grade, advice, LETTERS } from '../lib/exam.js';

// หลังบ้าน: สร้างชุดข้อสอบ ดูผลรายคน และวิเคราะห์ข้อสอบ — เรียกจาก routes/admin.js ก่อนเส้นทาง CRUD ทั่วไป
export default function examAdmin(r, { requireAuth, csrfCheck }) {
  const notFound = (res) => res.status(404).render('admin/message', { title: 'ไม่พบข้อสอบ', msg: 'ไม่พบชุดข้อสอบที่ต้องการ' });
  const loadExam = (req, res, next) => {
    const e = /^\d+$/.test(req.params.id) ? getExam(req.params.id) : null;
    if (!e) return notFound(res);
    req.exam = e;
    next();
  };

  r.use('/exams', (req, res, next) => { res.locals.L = LETTERS; next(); });

  r.get('/exams', requireAuth, (req, res) => {
    const rows = db.prepare(`SELECT e.id, e.title, e.code, e.open, e.created_at, json_array_length(e.questions) qn,
      (SELECT COUNT(*) FROM attempts a WHERE a.exam_id=e.id) n, (SELECT AVG(score*100.0/total) FROM attempts a WHERE a.exam_id=e.id) avg
      FROM exams e ORDER BY e.id DESC`).all();
    res.render('admin/exams', { title: 'ข้อสอบออนไลน์', rows, saved: req.query.saved, deleted: req.query.deleted });
  });

  const form = (res, title, item, errors = [], status = 200) =>
    res.status(status).render('admin/exam-form', { title, item, errors, preview: errors.length ? null : item.qs });

  r.get('/exams/new', requireAuth, (req, res) =>
    form(res, 'สร้างชุดข้อสอบ', { title: '', code: newCode(), intro: '', source: '', open: 1, show_key: 1, qs: null }));

  r.get('/exams/:id/edit', requireAuth, loadExam, (req, res) => form(res, 'แก้ไขชุดข้อสอบ', req.exam));

  r.post('/exams/save', requireAuth, csrfCheck, (req, res) => {
    const b = req.body;
    const id = /^\d+$/.test(b.id || '') ? Number(b.id) : null;
    if (id && !getExam(id)) return notFound(res);
    const item = {
      id, title: String(b.title || '').trim().slice(0, 200), code: normCode(b.code).slice(0, 40),
      intro: String(b.intro || '').replace(/\r\n/g, '\n').trim().slice(0, 2000),
      source: String(b.source || '').replace(/\r\n/g, '\n').slice(0, 200000),
      open: b.open ? 1 : 0, show_key: b.show_key ? 1 : 0,
    };
    const { questions, errors } = parseExam(item.source);
    item.qs = questions;
    if (!item.title) errors.unshift('กรุณากรอกชื่อชุดข้อสอบ');
    if (!/^[A-Z0-9]{6,40}$/.test(item.code)) errors.unshift('รหัสเข้าสอบต้องเป็น A-Z หรือ 0-9 ยาว 6 ตัวขึ้นไป');
    const dup = db.prepare('SELECT id FROM exams WHERE code=? AND id IS NOT ?').get(item.code, id);
    if (dup) errors.unshift('รหัสเข้าสอบนี้ถูกใช้กับชุดอื่นแล้ว');
    const title = id ? 'แก้ไขชุดข้อสอบ' : 'สร้างชุดข้อสอบ';
    if (errors.length) return form(res, title, item, errors, 400);
    if (b.preview) return form(res, title, item); // ดูตัวอย่างก่อนบันทึก

    const vals = [item.title, item.code, item.intro, item.source, JSON.stringify(questions), item.open, item.show_key];
    let newId = id;
    if (id) db.prepare('UPDATE exams SET title=?, code=?, intro=?, source=?, questions=?, open=?, show_key=? WHERE id=?').run(...vals, id);
    else newId = Number(db.prepare('INSERT INTO exams (title, code, intro, source, questions, open, show_key) VALUES (?,?,?,?,?,?,?)').run(...vals).lastInsertRowid);
    // ถ้าแก้เฉลยหลังมีคนสอบแล้ว ให้ตรวจคะแนนเดิมใหม่ตามเฉลยล่าสุด
    const upd = db.prepare('UPDATE attempts SET score=?, total=? WHERE id=?');
    for (const a of db.prepare('SELECT id, answers FROM attempts WHERE exam_id=?').all(newId)) {
      const g = grade(questions, JSON.parse(a.answers));
      upd.run(g.score, g.total, a.id);
    }
    res.redirect(`/admin/exams?saved=${newId}`);
  });

  r.post('/exams/:id/toggle', requireAuth, csrfCheck, loadExam, (req, res) => {
    db.prepare('UPDATE exams SET open=? WHERE id=?').run(req.exam.open ? 0 : 1, req.exam.id);
    res.redirect('/admin/exams');
  });

  r.post('/exams/:id/delete', requireAuth, csrfCheck, loadExam, (req, res) => {
    db.prepare('DELETE FROM exams WHERE id=?').run(req.exam.id);
    res.redirect('/admin/exams?deleted=1');
  });

  r.get('/exams/:id', requireAuth, loadExam, (req, res) => {
    const attempts = db.prepare('SELECT * FROM attempts WHERE exam_id=? ORDER BY score DESC, created_at').all(req.exam.id);
    res.render('admin/exam-results', { title: req.exam.title, exam: req.exam, A: analyze(req.exam, attempts), deleted: req.query.deleted });
  });

  r.get('/exams/:id/a/:aid', requireAuth, loadExam, (req, res, next) => {
    const a = /^\d+$/.test(req.params.aid) ? db.prepare('SELECT * FROM attempts WHERE id=? AND exam_id=?').get(req.params.aid, req.exam.id) : null;
    if (!a) return next();
    const g = grade(req.exam.qs, JSON.parse(a.answers));
    const rank = db.prepare('SELECT COUNT(*) c FROM attempts WHERE exam_id=? AND score>?').get(req.exam.id, a.score).c + 1;
    const n = db.prepare('SELECT COUNT(*) c FROM attempts WHERE exam_id=?').get(req.exam.id).c;
    res.render('admin/exam-attempt', { title: `ผลสอบ: ${a.name}`, exam: req.exam, a, g, adv: advice(g), rank, n });
  });

  r.post('/exams/:id/a/:aid/delete', requireAuth, csrfCheck, loadExam, (req, res) => {
    if (/^\d+$/.test(req.params.aid)) db.prepare('DELETE FROM attempts WHERE id=? AND exam_id=?').run(req.params.aid, req.exam.id);
    res.redirect(`/admin/exams/${req.exam.id}?deleted=1`);
  });

  // ส่งออกคะแนนเป็น CSV (เปิดใน Excel ได้ภาษาไทยถูกต้อง)
  r.get('/exams/:id/csv', requireAuth, loadExam, (req, res) => {
    const qs = req.exam.qs;
    const cell = (v) => {
      let s = String(v ?? '');
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // กันสูตร Excel
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = ['ลำดับ', 'ชื่อ-นามสกุล', 'เลขที่/รหัส', 'ห้อง', 'คะแนน', 'เต็ม', 'ร้อยละ', 'เวลาส่ง', ...qs.map((q) => `ข้อ ${q.no}`)];
    const rows = db.prepare('SELECT * FROM attempts WHERE exam_id=? ORDER BY score DESC, created_at').all(req.exam.id).map((a, i) => {
      const ans = JSON.parse(a.answers);
      return [i + 1, a.name, a.student_no, a.room, a.score, a.total, Math.round((a.score / (a.total || 1)) * 100), a.created_at,
        ...qs.map((q, k) => (ans[k] >= 0 ? LETTERS[ans[k]] + (ans[k] === q.answer ? ' ✓' : ' ✗') : '-'))];
    });
    rows.push(['', 'เฉลย', '', '', '', '', '', '', ...qs.map((q) => LETTERS[q.answer])]);
    const csv = '﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
    res.type('text/csv; charset=utf-8').attachment(`exam-${req.exam.id}.csv`).send(csv);
  });
}
