// In-memory cache for RentCast responses
// Key: hash of request params
// Value: { data, expiresAt }
// TTL: 24 hours for property records, 6 hours for comps (more volatile)

const cache = new Map();

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const COMPS_TTL_MS = 6 * 60 * 60 * 1000;   // 6 hours

function hashKey(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

export function get(key) {
  const entry = cache.get(hashKey(key));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(hashKey(key));
    return null;
  }
  return entry.data;
}

export function set(key, data, ttlMs = DEFAULT_TTL_MS) {
  cache.set(hashKey(key), { data, expiresAt: Date.now() + ttlMs });
  // Periodic cleanup: drop expired entries when cache gets large
  if (cache.size > 500) {
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
      if (v.expiresAt < now) cache.delete(k);
    }
  }
}

export function stats() {
  return {
    entries: cache.size,
    maxSize: 500,
  };
}

export const TTL = { DEFAULT: DEFAULT_TTL_MS, COMPS: COMPS_TTL_MS };