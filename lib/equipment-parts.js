// STEM equipment catalog, grouped by its "Phần I…IV" part (the order of the official equipment list).
// A part can hold several sub-lists: "Phần II: Thiết bị chuyên dùng" and "Phần II: … — Lập trình & Rô-bốt giáo dục".

const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
const PART_RE = /^(?:Phần|Part)\s+([IVX]+)\b\s*[:.–—-]?\s*(.*)$/i;

// "Phần III: Robot STEM – VEX Robotics" -> { n: 3, roman: 'III', name: 'Robot STEM – VEX Robotics' }
function parsePart(subcategory) {
  const m = String(subcategory || '').trim().match(PART_RE);
  if (!m || !ROMAN[m[1].toUpperCase()]) return null;
  return { n: ROMAN[m[1].toUpperCase()], roman: m[1].toUpperCase(), name: m[2].trim() };
}

// The tab an item lives in: "phan-3", or "khac" for items without a part
function partSlug(subcategory) {
  const p = parsePart(subcategory);
  return p ? `phan-${p.n}` : 'khac';
}

// items (already in admin order) -> [{ slug, label: 'Phần I' | 'Part I', name, title, count, groups: [{ title, items }] }]
function groupEquipmentByPart(items, lang, t) {
  const parts = [];
  for (const item of items || []) {
    const vi = parsePart(item.subcategory);
    const shown = (lang === 'en' && item.subcategoryEn) ? item.subcategoryEn : (item.subcategory || '');
    const local = parsePart(shown) || vi;
    const slug = vi ? `phan-${vi.n}` : 'khac';
    let part = parts.find((p) => p.slug === slug);
    if (!part) {
      // The part's own name: its first sub-list, without the "— sub-topic" ending
      const name = local ? local.name.split(/\s+—\s+/)[0] : '';
      part = {
        slug,
        n: vi ? vi.n : 99,
        label: vi ? `${lang === 'en' ? 'Part' : 'Phần'} ${vi.roman}` : t('equipment.other'),
        name,
        title: shown || t('equipment.other'),
        count: 0,
        groups: [],
      };
      parts.push(part);
    }
    let group = part.groups.find((g) => g.key === (item.subcategory || ''));
    if (!group) {
      group = { key: item.subcategory || '', title: shown, items: [] };
      part.groups.push(group);
    }
    group.items.push(item);
    part.count += 1;
  }
  parts.sort((a, b) => a.n - b.n);
  // Sub-list headings only where a part really has more than one list
  parts.forEach((p) => { p.groups.forEach((g) => { g.showTitle = p.groups.length > 1; }); });
  return parts;
}

module.exports = { parsePart, partSlug, groupEquipmentByPart };
