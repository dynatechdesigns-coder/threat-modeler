import { extractUrls } from './extract.js';
import { analyzeUrl, verdictFor } from './heuristics.js';
import { analyzeMessage } from './spamText.js';

// Everything here is plain JavaScript with no network and no Node-only features, so the very same file runs on the
// server and inside the browser (that is how the Link Checker keeps working offline).
// IMPORTANT: server/src/services/links/ and client/src/lib/links/ must hold identical copies of these files.
// A test fails if they drift apart.

const RANK = { ok: 0, suspicious: 1, dangerous: 2 };
const worst = (a, b) => (RANK[a] >= RANK[b] ? a : b);

/** Link-by-link and wording analysis. Returns results that still carry an internal `href`. */
export function analyzeText(text) {
  const { urls, truncated, unreadable } = extractUrls(text);
  const notes = [];
  if (truncated) notes.push('Only the first 25 links were checked.');
  if (unreadable) {
    notes.push(`${unreadable} piece${unreadable === 1 ? '' : 's'} of text looked like links but could not be read as web addresses.`);
  }

  const results = urls.map((u) => {
    const { score, signals } = analyzeUrl(u);
    return {
      url: u.raw.length > 300 ? `${u.raw.slice(0, 300)}...` : u.raw,
      href: u.href,
      score,
      verdict: verdictFor(score),
      reasons: signals.sort((a, b) => b.weight - a.weight).map(({ level, text: t }) => ({ level, text: t })),
      sources: ['Pattern checks'],
    };
  });

  return { results, message: analyzeMessage(text), notes, truncated };
}

/** Final answer shape used by the API and by the offline checker. The internal `href` is dropped. */
export function summarize({ results, message, notes, truncated }) {
  const urls = results.map(({ href, ...rest }) => rest);
  const summary = { dangerous: 0, suspicious: 0, ok: 0 };
  for (const r of urls) summary[r.verdict] += 1;

  let overall = urls.reduce((v, r) => worst(v, r.verdict), 'ok');
  if (message.verdict === 'spam') overall = worst(overall, 'dangerous');
  else if (message.verdict === 'suspicious') overall = worst(overall, 'suspicious');

  return { overall, message, urls, summary, notes, truncated };
}
