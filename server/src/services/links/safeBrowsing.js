// Optional: asks Google Safe Browsing whether any of these links are on its lists of dangerous sites.
// Needs a free API key (SAFE_BROWSING_API_KEY). Google's terms limit the free Lookup API to non-commercial use;
// for a paid product use Google's Web Risk API, which works the same way.
// Only the link addresses are sent to Google, never the rest of the user's message.

const ENDPOINT = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';

export const THREAT_LABELS = {
  MALWARE: 'Google lists this site as spreading malware.',
  SOCIAL_ENGINEERING: 'Google lists this site as a phishing or deceptive page.',
  UNWANTED_SOFTWARE: 'Google lists this site as offering unwanted software.',
  POTENTIALLY_HARMFUL_APPLICATION: 'Google lists this site as offering a potentially harmful app.',
};

/** Returns Map<href, [threatType]> for the links Google flags. Throws if Google cannot be reached. */
export async function lookupSafeBrowsing(hrefs, { apiKey, fetchImpl = globalThis.fetch }) {
  const res = await fetchImpl(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client: { clientId: 'threat-modeler', clientVersion: '1.0.0' },
      threatInfo: {
        threatTypes: Object.keys(THREAT_LABELS),
        platformTypes: ['ANY_PLATFORM'],
        threatEntryTypes: ['URL'],
        threatEntries: hrefs.map((url) => ({ url })),
      },
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Safe Browsing answered ${res.status}`);

  const data = await res.json();
  const hits = new Map();
  for (const m of data.matches || []) {
    const url = m.threat?.url;
    if (!url) continue;
    hits.set(url, [...(hits.get(url) || []), m.threatType]);
  }
  return hits;
}
