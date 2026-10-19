import { db } from './db.js';

// เมนูหลักจากตาราง menu_items (จัดการได้ในหลังบ้าน) — [{ label, en, href, children: [{ label, href }] | null }]
// ถ้ายังไม่มีเมนูเลย ใช้กลุ่มของหน้าเว็บแทน (แบบเดิม)
export function navTree() {
  const rows = db.prepare('SELECT id, title, title_en, url, parent_id FROM menu_items WHERE active=1 ORDER BY sort, id').all();
  if (!rows.length) return pageGroups();
  const tops = new Map();
  for (const r of rows) if (!r.parent_id) tops.set(r.id, { label: r.title, en: r.title_en || '', href: r.url || '', children: [] });
  for (const r of rows) if (r.parent_id) tops.get(r.parent_id)?.children.push({ label: r.title, href: r.url || '#' });
  return [...tops.values()]
    .filter((t) => t.href || t.children.length)
    .map((t) => ({ ...t, children: t.children.length ? t.children : null }));
}

function pageGroups() {
  const rows = db.prepare('SELECT title, slug, menu_group FROM pages WHERE published=1 AND in_menu=1 ORDER BY sort, id').all();
  const items = [{ label: 'หน้าหลัก', en: 'Home', href: '/', children: null }], groups = new Map();
  for (const r of rows) {
    if (r.menu_group) {
      if (!groups.has(r.menu_group)) {
        const g = { label: r.menu_group, en: '', href: '', children: [] };
        groups.set(r.menu_group, g);
        items.push(g);
      }
      groups.get(r.menu_group).children.push({ label: r.title, href: `/p/${r.slug}` });
    } else items.push({ label: r.title, en: '', href: `/p/${r.slug}`, children: null });
  }
  items.push({ label: 'ข่าวสาร', en: 'News', href: '/news', children: null }, { label: 'ติดต่อเรา', en: 'Contact', href: '/contact', children: null });
  return items;
}
