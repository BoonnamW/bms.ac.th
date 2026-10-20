// ส่วนต่าง ๆ ของหน้าแรก (ใต้ภาพสไลด์และเมนูลัด): เรียงลำดับและซ่อน/แสดงได้ที่หลังบ้าน → จัดเมนูและหน้าแรก
// kind: sec = ส่วนเนื้อหา (สีพื้นสลับขาว/อ่อนให้อัตโนมัติตามลำดับ) · row = แถวการ์ด · band = แถบเต็มความกว้าง
export const HOME_SECTIONS = {
  stats: { label: 'ตัวเลขความภาคภูมิใจ', kind: 'row' },
  news: { label: 'ข่าวสารและปฏิทินกิจกรรม', kind: 'sec' },
  programs: { label: 'หลักสูตรและจุดเด่นของโรงเรียน', kind: 'sec' },
  awards: { label: 'ผลงานและความภาคภูมิใจ', kind: 'sec' },
  gallery: { label: 'ภาพกิจกรรม', kind: 'sec' },
  about: { label: 'แนะนำโรงเรียน / วิดีโอ และศูนย์ข้อมูลสารสนเทศ', kind: 'sec' },
  connect: { label: 'ติดตามโรงเรียน (Facebook และช่องทางอื่น)', kind: 'sec' },
  cta: { label: 'แถบเชิญชวนสมัครเรียน', kind: 'band' },
};

// ลำดับที่บันทึกไว้ (JSON [{k, on}]) — ส่วนที่เพิ่มมาใหม่ในภายหลังต่อท้ายและแสดงเอง
export function homeLayout(json) {
  let saved;
  try { saved = JSON.parse(json || '[]'); } catch { saved = []; }
  const seen = new Set(), out = [];
  for (const x of Array.isArray(saved) ? saved : []) {
    if (x && Object.hasOwn(HOME_SECTIONS, x.k) && !seen.has(x.k)) { seen.add(x.k); out.push({ k: x.k, on: x.on !== false }); }
  }
  for (const k of Object.keys(HOME_SECTIONS)) if (!seen.has(k)) out.push({ k, on: true });
  return out;
}

// ส่วนที่แสดง ตามลำดับ พร้อมสีพื้นสลับ (alt) ของส่วนเนื้อหา
export function homeSections(json) {
  let n = 0;
  return homeLayout(json).filter((x) => x.on).map((x) => ({ k: x.k, alt: HOME_SECTIONS[x.k].kind === 'sec' && n++ % 2 === 1 }));
}
