// School levels of the reference projects (/giai-phap/du-an): THCS, THPT, Đại học, plus "Khác" for projects without a school.
// A project's level is chosen in the admin, or (left on automatic) worked out from its school name.

const LEVELS = ['thcs', 'thpt', 'dai-hoc', 'khac'];

const fold = (text) => String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

// "THCS Cầu Giấy" -> 'thcs', "THPT Chuyên Lam Sơn" -> 'thpt', "Trường Đại học …" -> 'dai-hoc', no school -> 'khac'
function levelFromSchool(schoolName) {
  const s = fold(schoolName);
  if (/\bthcs\b|trung hoc co so/.test(s)) return 'thcs';
  if (/\bthpt\b|trung hoc pho thong|\bpt dtnt\b/.test(s)) return 'thpt';
  if (/\bdai hoc\b|\bdh\b|\bcao dang\b|university|college/.test(s)) return 'dai-hoc';
  return 'khac';
}

function projectLevel(project) {
  return LEVELS.includes(project.level) ? project.level : levelFromSchool(project.schoolName);
}

// projects (already in display order) -> [{ key, items }] in level order; "khac" only when it has projects
function groupProjectsByLevel(projects) {
  return LEVELS
    .map((key) => ({ key, items: (projects || []).filter((p) => projectLevel(p) === key) }))
    .filter((g) => g.key !== 'khac' || g.items.length);
}

module.exports = { LEVELS, levelFromSchool, projectLevel, groupProjectsByLevel };
