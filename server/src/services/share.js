import crypto from 'node:crypto';

/** 32 characters of randomness that cannot be guessed. */
export const newShareToken = () => crypto.randomBytes(24).toString('base64url');

export const isShareToken = (t) => typeof t === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(t);

/**
 * What a visitor with the link may see. Built field by field (an allow-list), so a field added to the model later is
 * never exposed by accident. No scan log, no file names or storage keys, no owner details.
 */
export function publicReport(report) {
  const r = typeof report.toObject === 'function' ? report.toObject() : report;
  return {
    name: r.name,
    completedAt: r.completedAt,
    riskScore: r.riskScore,
    summary: r.summary,
    aiSummary: r.aiSummary
      ? {
          text: r.aiSummary.text,
          source: r.aiSummary.source,
          priorities: (r.aiSummary.priorities || []).map(({ title, why, action }) => ({ title, why, action })),
        }
      : undefined,
    findings: (r.findings || []).map((f) => ({
      _id: String(f._id),
      title: f.title,
      severity: f.severity,
      category: f.category,
      description: f.description,
      file: f.file,
      line: f.line,
      cwe: f.cwe,
      recommendation: f.recommendation,
      snippet: f.snippet,
      source: f.source,
    })),
  };
}
