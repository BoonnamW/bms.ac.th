// ที่อยู่หลักของเว็บไซต์ (เช่น https://www.bms.ac.th) ใช้ในลิงก์แบ่งปัน แผนผังเว็บไซต์ RSS และปฏิทิน
// ตั้ง SITE_URL ไว้ = ไม่อ่านจาก Host header ที่ผู้ส่งคำขอปลอมได้ · ไม่ตั้ง = ใช้ที่อยู่ที่ผู้ชมเปิดเข้ามา (เหมาะกับเดโม/ในเครื่อง)
const raw = String(process.env.SITE_URL || '').trim().replace(/\/+$/, '');
let fixed = '';
try { if (/^https?:\/\/[^/\s]+$/i.test(raw)) fixed = new URL(raw).origin; } catch { fixed = ''; }
if (raw && !fixed) console.warn('SITE_URL ไม่ถูกต้อง (ตัวอย่าง: https://www.bms.ac.th) — ใช้ที่อยู่จากคำขอแทน');

export const siteOrigin = (req) => fixed || `${req.protocol}://${req.get('host')}`;
export const siteHost = (req) => new URL(siteOrigin(req)).host;

// ชื่อเดียวกันที่ต่างแค่ www (bms.ac.th ↔ www.bms.ac.th) → ส่งไปที่อยู่หลักใน SITE_URL ให้เหลือที่อยู่เดียว
export function canonicalHost(req, res, next) {
  if (!fixed) return next();
  const want = new URL(fixed).hostname;
  const host = String(req.hostname || '').toLowerCase();
  if (host === want || host.replace(/^www\./, '') !== want.replace(/^www\./, '')) return next();
  res.redirect(301, fixed + req.originalUrl);
}
