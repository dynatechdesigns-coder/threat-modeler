// Finds web addresses inside pasted text. Nothing here ever opens a link.

export const MAX_URLS = 25;

const WITH_SCHEME = /\b(?:https?:\/\/)[^\s<>"'`]+/gi;
const WWW = /(?<![\w/.@-])www\.[^\s<>"'`]+/gi;
const BARE_SHORTENER = /(?<![\w/.@-])(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|cutt\.ly|rb\.gy|shorturl\.at|tiny\.cc|t\.ly)\/[^\s<>"'`]+/gi;
const RISKY_SCHEME = /\b(?:javascript|vbscript|data):[^\s<>"'`]+/gi;

const trimTail = (s) => s.replace(/[.,;:!?'")\]}>]+$/g, '');

/** Returns { urls: [{ raw, href }], truncated, unreadable } */
export function extractUrls(text) {
  const found = [];
  const push = (raw, kind) => found.push({ raw: trimTail(raw), kind });

  for (const m of text.matchAll(RISKY_SCHEME)) push(m[0], 'scheme');
  for (const m of text.matchAll(WITH_SCHEME)) push(m[0], 'url');
  for (const m of text.matchAll(WWW)) push(`https://${m[0]}`, 'url');
  for (const m of text.matchAll(BARE_SHORTENER)) push(`https://${m[0]}`, 'url');

  const seen = new Set();
  const urls = [];
  let unreadable = 0;
  for (const f of found) {
    if (!f.raw || seen.has(f.raw)) continue;
    seen.add(f.raw);
    if (f.kind === 'scheme') {
      urls.push({ raw: f.raw, href: f.raw, scheme: f.raw.split(':')[0].toLowerCase() });
      continue;
    }
    try {
      const u = new URL(f.raw);
      if (!u.hostname || !/^https?:$/.test(u.protocol)) throw new Error('bad');
      urls.push({ raw: f.raw, href: u.href });
    } catch {
      unreadable += 1;
    }
  }

  // The same address can be found twice once https:// is added (for example www.x.com), so dedupe on href too.
  const byHref = new Map();
  for (const u of urls) if (!byHref.has(u.href)) byHref.set(u.href, u);
  const unique = [...byHref.values()];

  return { urls: unique.slice(0, MAX_URLS), truncated: unique.length > MAX_URLS, unreadable };
}
