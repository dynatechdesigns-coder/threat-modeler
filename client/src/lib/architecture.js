// Builds ArchitectureGraph input from a scan report's findings: one node per
// affected file, one node per issue category, and one edge per finding linking
// the two — a map of where each kind of problem lives. Pure function.
export function buildArchitecture(findings) {
  const list = Array.isArray(findings) ? findings : [];
  const files = new Map();
  const categories = new Map();
  const edges = [];

  list.forEach((f, i) => {
    if (!f || !f.file) return;
    const file = String(f.file);
    const category = String(f.category || 'General');
    if (!files.has(file)) files.set(file, { id: `file:${file}`, label: file });
    if (!categories.has(category)) categories.set(category, { id: `cat:${category}`, label: category });
    edges.push({
      id: f._id !== undefined ? `edge:${String(f._id)}` : `edge:${i}`,
      source: `file:${file}`,
      target: `cat:${category}`,
      label: f.severity,
    });
  });

  return { nodes: [...files.values(), ...categories.values()], edges };
}
