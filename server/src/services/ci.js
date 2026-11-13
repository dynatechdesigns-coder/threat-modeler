import { compareScans } from './compare.js';

/** Project names come from the CI job (owner/repo). Keep them short and plain. */
export function cleanProject(value) {
  const s = String(value || '').trim();
  if (!/^[A-Za-z0-9._\/-]{1,100}$/.test(s)) return '';
  const parts = s.split('/');
  // owner/repo style: no empty parts and no "." or ".." parts, so it can never look like a path
  return parts.length <= 3 && parts.every((p) => p && p !== '.' && p !== '..') ? s : '';
}

export const shortSha = (value) => (/^[0-9a-f]{7,40}$/i.test(String(value || '')) ? String(value).slice(0, 7).toLowerCase() : '');

/**
 * What the CI job gets back. `previous` is the latest baseline scan (a scan of the main branch), or null.
 * With no baseline there is nothing to compare, so the job never fails on the first run.
 */
export function ciResult(previous, current) {
  const total = current?.summary || {};
  const base = {
    status: current?.status,
    riskScore: current?.riskScore || 0,
    summary: { critical: total.critical || 0, high: total.high || 0, medium: total.medium || 0, low: total.low || 0, total: total.total || 0 },
    baseline: !previous,
  };
  if (!previous) return { ...base, newCount: 0, newSevere: 0, fixedCount: 0, scoreChange: 0, newFindings: [] };

  const diff = compareScans(previous, current);
  return {
    ...base,
    newCount: diff.added.length,
    newSevere: diff.added.filter((f) => f.severity === 'critical' || f.severity === 'high').length,
    fixedCount: diff.fixed.length,
    scoreChange: diff.scoreChange,
    newFindings: diff.added.slice(0, 20).map((f) => ({
      severity: f.severity,
      title: String(f.title || '').slice(0, 160),
      file: String(f.file || '').slice(0, 200),
      line: f.line || 0,
      cwe: f.cwe || '',
    })),
  };
}
