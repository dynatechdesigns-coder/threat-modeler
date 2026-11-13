// Dependency check against the free OSV.dev vulnerability database (no API key needed).
// Looks at the direct "dependencies" in package.json, using exact versions from package-lock.json when present.

const OSV = 'https://api.osv.dev/v1';

async function postJson(fetchImpl, url, body) {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`OSV responded with ${res.status}`);
  return res.json();
}

async function getJson(fetchImpl, url) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`OSV responded with ${res.status}`);
  return res.json();
}

function severityOf(detail) {
  const s = String(detail.database_specific?.severity || '').toUpperCase();
  if (s === 'CRITICAL') return 'critical';
  if (s === 'HIGH') return 'high';
  if (s === 'LOW') return 'low';
  return 'medium'; // MODERATE, MEDIUM or unknown
}

function collectQueries(manifests) {
  const queries = [];
  const seen = new Set();

  for (const m of manifests.filter((x) => x.path.split('/').pop() === 'package.json').slice(0, 5)) {
    let pkg;
    try {
      pkg = JSON.parse(m.content);
    } catch {
      continue;
    }
    const dir = m.path.includes('/') ? m.path.slice(0, m.path.lastIndexOf('/') + 1) : '';
    const lockManifest = manifests.find((x) => x.path === `${dir}package-lock.json`);
    let lock = null;
    try {
      lock = lockManifest ? JSON.parse(lockManifest.content) : null;
    } catch {
      lock = null;
    }

    for (const [name, range] of Object.entries(pkg.dependencies || {})) {
      if (/^(git|http|file:|link:|workspace:)/.test(String(range))) continue;
      const locked = lock?.packages?.[`node_modules/${name}`]?.version || lock?.dependencies?.[name]?.version;
      const version = locked || String(range).match(/\d+\.\d+\.\d+(?:-[\w.]+)?/)?.[0];
      if (!version) continue;
      const key = `${name}@${version}`;
      if (seen.has(key)) continue;
      seen.add(key);
      queries.push({ name, version, manifest: m });
    }
  }
  return queries;
}

export async function scanDependencies(manifests, { fetchImpl = globalThis.fetch, log = () => {}, maxFindings = 25 } = {}) {
  const queries = collectQueries(manifests);
  if (queries.length === 0) return [];
  log(`Checking ${queries.length} dependencies against the OSV vulnerability database...`);

  const hits = [];
  for (let i = 0; i < queries.length; i += 500) {
    const chunk = queries.slice(i, i + 500);
    const res = await postJson(fetchImpl, `${OSV}/querybatch`, {
      queries: chunk.map((q) => ({ package: { name: q.name, ecosystem: 'npm' }, version: q.version })),
    });
    (res.results || []).forEach((r, idx) => {
      const ids = (r.vulns || []).map((v) => v.id);
      if (ids.length) hits.push({ q: chunk[idx], ids });
    });
  }
  if (hits.length === 0) return [];

  // Fetch details for each unique advisory (capped), a few at a time
  const uniqueIds = [...new Set(hits.flatMap((h) => h.ids))].slice(0, 40);
  const details = new Map();
  for (let i = 0; i < uniqueIds.length; i += 5) {
    await Promise.all(
      uniqueIds.slice(i, i + 5).map(async (id) => {
        try {
          details.set(id, await getJson(fetchImpl, `${OSV}/vulns/${encodeURIComponent(id)}`));
        } catch {
          /* skip advisories we cannot load */
        }
      })
    );
  }

  const findings = [];
  for (const { q, ids } of hits) {
    const lines = q.manifest.content.split(/\r?\n/);
    const lineNo = lines.findIndex((l) => l.includes(`"${q.name}"`)) + 1 || 1;

    for (const id of ids) {
      const d = details.get(id);
      if (!d || d.withdrawn) continue;

      const fixed = (d.affected || [])
        .filter((a) => a.package?.name === q.name && a.package?.ecosystem === 'npm')
        .flatMap((a) => a.ranges || [])
        .flatMap((r) => r.events || [])
        .map((e) => e.fixed)
        .find(Boolean);
      const cve = (d.aliases || []).find((a) => a.startsWith('CVE-'));
      const summary = d.summary || d.id;

      findings.push({
        title: `${q.name}@${q.version}: ${summary}`.slice(0, 140),
        severity: severityOf(d),
        category: 'Vulnerable Dependency',
        description: `${d.id}${cve ? ` (${cve})` : ''}. ${String(d.details || '').replace(/\s+/g, ' ').slice(0, 400)}`.trim(),
        file: q.manifest.path,
        line: lineNo,
        cwe: (d.database_specific?.cwe_ids || [])[0] || '',
        recommendation: fixed
          ? `Upgrade ${q.name} to ${fixed} or later, then re-run your tests.`
          : `Check the advisory ${d.id} for a patched version of ${q.name} or a workaround.`,
        snippet: `${lineNo}| ${(lines[lineNo - 1] || '').trim().slice(0, 200)}`,
        source: 'osv',
      });
    }
  }

  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  if (findings.length > maxFindings) {
    log(`[WARN] ${findings.length} dependency advisories found, showing the ${maxFindings} most severe`);
    return findings.slice(0, maxFindings);
  }
  return findings;
}
