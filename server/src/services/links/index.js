import { analyzeText, summarize } from './analyze.js';
import { lookupSafeBrowsing, THREAT_LABELS } from './safeBrowsing.js';

/**
 * Checks the links and the wording of a pasted message. Nothing is opened, fetched or stored.
 * Returns { overall, message, urls, summary, notes, truncated }.
 */
export async function checkLinks({ text, safeBrowsingKey = '', fetchImpl = globalThis.fetch }) {
  const base = analyzeText(text);
  const webUrls = base.results.filter((r) => /^https?:\/\//i.test(r.href));

  if (safeBrowsingKey && webUrls.length) {
    try {
      const hits = await lookupSafeBrowsing(webUrls.map((r) => r.href), { apiKey: safeBrowsingKey, fetchImpl });
      for (const r of webUrls) {
        r.sources.push('Google Safe Browsing');
        const threats = hits.get(r.href);
        if (threats) {
          r.verdict = 'dangerous';
          r.score = 100;
          r.reasons.unshift(...threats.map((t) => ({ level: 'danger', text: THREAT_LABELS[t] || 'Google lists this site as dangerous.' })));
        }
      }
    } catch {
      base.notes.push('Google Safe Browsing could not be reached, so only the pattern checks were used.');
    }
  } else if (!safeBrowsingKey) {
    base.notes.push('Google Safe Browsing is not switched on for this server, so only pattern checks were used.');
  }

  return summarize(base);
}
