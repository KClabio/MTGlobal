// Short memory for data that every visitor sees the same (Trang chủ's projects, robots, partners and services):
// one database read serves every visit for HOME_CACHE_SECONDS, instead of four reads per view. On by default only on
// the live server (NODE_ENV=production, 60 s); off on a test computer, where tests write straight into the database.
// Any admin save empties it (routes/admin.js), so staff see their change at once.
const store = new Map(); // key -> { until, value } (value may still be a pending promise)

function homeCacheSeconds(env = process.env) {
  const raw = env.HOME_CACHE_SECONDS;
  if (raw !== undefined && raw !== '') {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  return env.NODE_ENV === 'production' ? 60 : 0;
}

/**
 * The stored value of `key` while it is fresh, otherwise `loader()` (stored for `seconds`).
 * Visits at the same moment share one read; a failed read is not kept.
 */
function memo(key, seconds, loader) {
  if (!(seconds > 0)) return Promise.resolve().then(loader);
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.until > now) return hit.value;
  const entry = { until: now + seconds * 1000, value: null };
  entry.value = Promise.resolve().then(loader).catch((err) => {
    if (store.get(key) === entry) store.delete(key);
    throw err;
  });
  store.set(key, entry);
  return entry.value;
}

function clearMemo() {
  store.clear();
}

module.exports = { memo, clearMemo, homeCacheSeconds };
