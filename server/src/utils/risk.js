export const SEVERITIES = ['critical', 'high', 'medium', 'low'];

export function summarize(findings = []) {
  const summary = { critical: 0, high: 0, medium: 0, low: 0, total: findings.length };
  for (const f of findings) {
    if (summary[f.severity] !== undefined) summary[f.severity] += 1;
  }
  return summary;
}

// 0-100 score. Tune the weights to your own risk model.
export function calcRiskScore(summary) {
  const raw = summary.critical * 25 + summary.high * 10 + summary.medium * 4 + summary.low;
  return Math.min(100, raw);
}
