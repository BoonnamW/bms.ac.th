import { db } from './db.js';

// สร้างเมนูหลักจากหน้าเว็บที่เปิดให้แสดง (จัดกลุ่มเป็นเมนูย่อยตามชื่อกลุ่ม)
export function navTree() {
  const rows = db.prepare('SELECT title, slug, menu_group FROM pages WHERE published=1 AND in_menu=1 ORDER BY sort, id').all();
  const items = [], groups = new Map();
  for (const r of rows) {
    if (r.menu_group) {
      if (!groups.has(r.menu_group)) {
        const g = { label: r.menu_group, children: [] };
        groups.set(r.menu_group, g);
        items.push(g);
      }
      groups.get(r.menu_group).children.push({ label: r.title, href: `/p/${r.slug}` });
    } else items.push({ label: r.title, href: `/p/${r.slug}` });
  }
  return items;
}
