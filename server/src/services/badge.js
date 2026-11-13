// A small status badge as an SVG image: "Threat Modeler | risk 23". Pure functions, no dependencies.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Rough text width for 11px Verdana/DejaVu, enough to size the two halves of the badge.
const textWidth = (s) => Math.round(String(s).length * 6.4 + 10);

/** Risk score 0-100 to a colour. Green is low risk. */
export function riskColor(score) {
  if (score < 20) return '#3fb950';
  if (score < 40) return '#a3be3a';
  if (score < 60) return '#d9a40e';
  if (score < 80) return '#f0883e';
  return '#e5534b';
}

export function renderBadge({ label = 'Threat Modeler', value, color = '#6e7781' }) {
  const lw = textWidth(label);
  const vw = textWidth(value);
  const w = lw + vw;
  const title = `${esc(label)}: ${esc(value)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${title}"><title>${title}</title>
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#0f172a"/><rect x="${lw}" width="${vw}" height="20" fill="${esc(color)}"/><rect width="${w}" height="20" fill="url(#s)"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11"><text x="${lw / 2}" y="14">${esc(label)}</text><text x="${lw + vw / 2}" y="14">${esc(value)}</text></g></svg>`;
}

/** The newest finished scan of a watched repository, or null. */
export function latestScore(events = []) {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (['baseline', 'ok', 'warning'].includes(e.status) && Number.isFinite(e.riskScore)) return e.riskScore;
  }
  return null;
}

export function badgeFor(events) {
  const score = latestScore(events);
  return score === null ? renderBadge({ value: 'no scan yet' }) : renderBadge({ value: `risk ${score}`, color: riskColor(score) });
}
