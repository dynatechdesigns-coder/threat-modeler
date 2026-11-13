// Compares two scans of the same project. Findings are matched by what they are and where (category, title, file),
// not by line number, so adding a few lines above a problem does not make it look "new".

/** Scans started by a push are named "owner/repo @ abc1234". The project name is the part before " @ ". */
export const projectName = (name = '') => String(name).replace(/ @ [0-9a-f]{7}$/i, '');

const keyOf = (f) => `${f.category || ''}|${f.title || ''}|${f.file || ''}`;

function indexByKey(findings = []) {
  const map = new Map();
  for (const f of findings) {
    const key = keyOf(f);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(f);
  }
  return map;
}

/** older -> newer. Returns { added, fixed, remaining, scoreChange, totalChange }. */
export function compareScans(older, newer) {
  const before = indexByKey(older?.findings);
  const after = indexByKey(newer?.findings);
  const added = [];
  const fixed = [];
  const remaining = [];

  for (const [key, items] of after) {
    const had = before.get(key) || [];
    items.forEach((f, i) => (i < had.length ? remaining : added).push(f));
  }
  for (const [key, items] of before) {
    const has = after.get(key) || [];
    items.forEach((f, i) => {
      if (i >= has.length) fixed.push(f);
    });
  }

  const order = ['critical', 'high', 'medium', 'low'];
  const bySeverity = (a, b) => order.indexOf(a.severity) - order.indexOf(b.severity);
  [added, fixed, remaining].forEach((list) => list.sort(bySeverity));

  return {
    added,
    fixed,
    remaining,
    scoreChange: (newer?.riskScore || 0) - (older?.riskScore || 0),
    totalChange: (newer?.findings?.length || 0) - (older?.findings?.length || 0),
  };
}

/**
 * Picks sensible defaults from the list of reports: the later scan (the one given, or the newest finished one) and the
 * scan before it, preferring one with the same name.
 */
export function defaultPair(reports = [], newerId = null) {
  const done = reports
    .filter((r) => r.status === 'completed')
    .sort((x, y) => new Date(y.completedAt || y.createdAt) - new Date(x.completedAt || x.createdAt));
  const newer = (newerId && done.find((r) => r._id === newerId)) || done[0];
  if (!newer) return { older: null, newer: null };
  const stamp = (r) => new Date(r.completedAt || r.createdAt);
  const others = done.filter((r) => r._id !== newer._id);
  const before = others.filter((r) => stamp(r) <= stamp(newer));
  const older = before.find((r) => projectName(r.name) === projectName(newer.name)) || before[0] || others.find((r) => projectName(r.name) === projectName(newer.name)) || others[0] || null;
  return { older: older?._id || null, newer: newer._id };
}
