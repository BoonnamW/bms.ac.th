// อ่านไฟล์ส่งออกฐานข้อมูล WordPress (.sql จาก phpMyAdmin) แล้วดึงเฉพาะเนื้อหาสาธารณะที่เผยแพร่แล้ว
// ไม่อ่านตารางผู้ใช้ (users/usermeta) และไม่เก็บค่าตั้งค่าอื่นนอกจากที่ระบุไว้ด้านล่าง

// ---------- ตัวแยก INSERT INTO ... VALUES (...),(...); แบบไม่ต้องมี MySQL ----------
function parseValues(sql, start) {
  // คืน [rows, indexAfterSemicolon]; รองรับสตริงที่มี \' \\ และวงเล็บข้างใน
  const rows = [];
  let i = start, row = null, cur = '', inStr = false, touched = false;
  const push = () => { row.push(touched ? cur : (cur.trim() === 'NULL' ? null : cur.trim())); cur = ''; touched = false; };
  for (; i < sql.length; i++) {
    const c = sql[i];
    if (inStr) {
      if (c === '\\') {
        const n = sql[++i];
        cur += n === 'n' ? '\n' : n === 'r' ? '\r' : n === 't' ? '\t' : n === '0' ? '\0' : n;
      } else if (c === "'") {
        if (sql[i + 1] === "'") { cur += "'"; i++; } else inStr = false;
      } else cur += c;
      continue;
    }
    if (c === "'") { inStr = true; touched = true; cur = ''; continue; }
    if (touched && c !== ',' && c !== ')') continue; // ช่องว่างหลังปิดเครื่องหมายคำพูด
    if (row === null) {
      if (c === '(') row = [];
      else if (c === ';') return [rows, i + 1];
      continue;
    }
    if (c === ',') push();
    else if (c === ')') { push(); rows.push(row); row = null; }
    else cur += c;
  }
  return [rows, i];
}

const WANTED = ['posts', 'postmeta', 'terms', 'term_taxonomy', 'term_relationships', 'options'];

export function parseDump(sql) {
  const m = sql.match(/CREATE TABLE `(\w+?)posts`/);
  if (!m) throw new Error('ไม่พบตาราง *_posts ในไฟล์ — ต้องเป็นไฟล์ส่งออกฐานข้อมูล WordPress (.sql)');
  const prefix = m[1];
  const tables = Object.fromEntries(WANTED.map((t) => [t, []]));
  const re = new RegExp(`INSERT INTO \`${prefix}(${WANTED.join('|')})\` \\(([^)]*)\\) VALUES`, 'g');
  let hit;
  while ((hit = re.exec(sql))) {
    const cols = hit[2].split(',').map((c) => c.trim().replace(/`/g, ''));
    const [rows, end] = parseValues(sql, re.lastIndex);
    for (const r of rows) if (r.length === cols.length) tables[hit[1]].push(Object.fromEntries(cols.map((c, k) => [c, r[k]])));
    re.lastIndex = end;
  }
  return { prefix, tables };
}

// ---------- ดึงเนื้อหาที่ต้องใช้ ----------
const ints = (s) => [...String(s || '').matchAll(/i:\d+;i:(\d+);/g)].map((x) => Number(x[1]));

export function extractContent({ tables }) {
  const opt = Object.fromEntries(tables.options.map((o) => [o.option_name, o.option_value]));
  const meta = new Map();
  for (const m of tables.postmeta) {
    const id = Number(m.post_id);
    if (!meta.has(id)) meta.set(id, {});
    meta.get(id)[m.meta_key] = m.meta_value;
  }
  const posts = new Map(tables.posts.map((p) => [Number(p.ID), p]));
  const file = (id) => meta.get(Number(id))?._wp_attached_file || null;

  // หมวดหมู่ของโพสต์ และเมนู
  const terms = new Map(tables.terms.map((t) => [Number(t.term_id), t]));
  const tax = new Map(tables.term_taxonomy.map((t) => [Number(t.term_taxonomy_id), { ...t, term: terms.get(Number(t.term_id)) }]));
  const postTax = new Map();
  for (const r of tables.term_relationships) {
    const t = tax.get(Number(r.term_taxonomy_id));
    if (!t) continue;
    const id = Number(r.object_id);
    if (!postTax.has(id)) postTax.set(id, []);
    postTax.get(id).push(t);
  }

  const used = new Set(); // ไฟล์แนบที่ถูกใช้จริง
  const useFile = (id) => { const f = file(id); if (f) used.add(f); return f; };

  const galleries = {};
  for (const p of posts.values()) {
    if (p.post_type !== 'rl_gallery') continue;
    const m = String(meta.get(Number(p.ID))?._rl_images || '').match(/"ids";a:\d+:\{([^}]*)\}/);
    galleries[p.ID] = (m ? ints(m[1]) : []).map(useFile).filter(Boolean);
  }

  const pub = (type) => [...posts.values()].filter((p) => p.post_type === type && p.post_status === 'publish');
  const news = pub('post').map((p) => ({
    wp_id: Number(p.ID), title: p.post_title, slug: p.post_name, date_gmt: p.post_date_gmt, date: p.post_date,
    excerpt: p.post_excerpt || '', body: p.post_content || '',
    categories: (postTax.get(Number(p.ID)) || []).filter((t) => t.taxonomy === 'category').map((t) => t.term.name),
    thumb: useFile(meta.get(Number(p.ID))?._thumbnail_id),
  }));
  const pages = pub('page').map((p) => ({
    wp_id: Number(p.ID), title: p.post_title, slug: p.post_name, parent: Number(p.post_parent) || 0,
    body: p.post_content || '', order: Number(p.menu_order) || 0,
  }));

  // เมนูหลักตามตำแหน่งที่ธีมใช้ (ไม่มีข้อมูลก็เลือกเมนูที่มีรายการมากที่สุด)
  const locs = String(opt.theme_mods_covernews || opt[`theme_mods_${opt.stylesheet}`] || '');
  const primary = Number((locs.match(/primary[\w-]*";i:(\d+)/) || [])[1]) || 0;
  const menus = [...tax.values()].filter((t) => t.taxonomy === 'nav_menu');
  const menuTax = menus.find((t) => Number(t.term_id) === primary) || menus.sort((a, b) => b.count - a.count)[0];
  const menu = [];
  if (menuTax) {
    for (const r of tables.term_relationships) {
      if (Number(r.term_taxonomy_id) !== Number(menuTax.term_taxonomy_id)) continue;
      const p = posts.get(Number(r.object_id));
      if (!p || p.post_status !== 'publish') continue;
      const m = meta.get(Number(p.ID)) || {};
      menu.push({
        id: Number(p.ID), title: p.post_title, order: Number(p.menu_order) || 0,
        parent: Number(m._menu_item_menu_item_parent) || 0, type: m._menu_item_type,
        object: m._menu_item_object, object_id: Number(m._menu_item_object_id) || 0, url: m._menu_item_url || '',
      });
    }
    menu.sort((a, b) => a.order - b.order);
  }

  return {
    source: { home: opt.home, uploads: `${String(opt.home || '').replace(/\/$/, '')}/wp-content/uploads/` },
    site: { name: opt.blogname, logo: useFile(opt.site_logo) },
    news, pages, galleries, menu,
    files: [...used].sort(),
    media: mediaSizes(meta, [...used], [...news, ...pages].map((p) => p.body)),
  };
}

// ---------- รูปย่อที่ WordPress สร้างไว้ (ขนาดเล็กกว่า สัดส่วนเดียวกับรูปต้นฉบับ) ----------
// { 'ปี/เดือน/รูป.jpg': [กว้าง, [[กว้าง, 'รูป-768x512.jpg'], …]] } — ใช้ทำ srcset ให้เบราว์เซอร์โหลดรูปพอดีจอ
// เก็บเฉพาะรูปที่ใช้เป็นภาพปกหรืออยู่ในเนื้อหาข่าว/หน้าเว็บ
const IMAGE = /\.(jpe?g|png|webp|gif)$/i;
function mediaSizes(meta, usedFiles, bodies) {
  const all = new Map(), byVariant = new Map();
  for (const m of meta.values()) {
    const file = m._wp_attached_file, raw = String(m._wp_attachment_metadata || '');
    if (!file || !IMAGE.test(file)) continue;
    const W = Number((raw.match(/s:5:"width";i:(\d+);/) || [])[1]), H = Number((raw.match(/s:6:"height";i:(\d+);/) || [])[1]);
    if (!W || !H) continue;
    const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : '';
    const seen = new Set(), sizes = [];
    for (const [, f, w, h] of raw.matchAll(/s:4:"file";s:\d+:"([^"]+)";s:5:"width";i:(\d+);s:6:"height";i:(\d+);/g)) {
      const wi = Number(w), hi = Number(h);
      if (!hi || wi >= W || seen.has(wi) || !IMAGE.test(f) || f.includes('/')) continue;
      if (Math.abs(wi / hi - W / H) > 0.02 * (W / H)) continue; // รูปที่ครอปเป็นสัดส่วนอื่น ใช้แทนกันไม่ได้
      seen.add(wi);
      sizes.push([wi, f]);
    }
    if (!sizes.length) continue;
    sizes.sort((a, b) => a[0] - b[0]);
    all.set(file, [W, sizes]);
    for (const [, f] of sizes) byVariant.set(dir + f, file);
  }
  const want = new Set(usedFiles.filter((f) => all.has(f)));
  for (const body of bodies) {
    for (const [, ref] of String(body || '').matchAll(/wp-content\/uploads\/([^"'\s?#)]+)/g)) {
      let f = ref;
      try { f = decodeURIComponent(ref); } catch { /* ใช้ตามเดิม */ }
      if (all.has(f)) want.add(f); else if (byVariant.has(f)) want.add(byVariant.get(f));
    }
  }
  return Object.fromEntries([...want].sort().map((f) => [f, all.get(f)]));
}
