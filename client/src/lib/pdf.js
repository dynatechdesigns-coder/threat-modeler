import { suggestFix } from './fixes.js';

// A small PDF writer with no dependencies. It runs in the browser, so reports can be downloaded as a real PDF even on a
// phone and even offline. Text only (built-in Helvetica and Courier), A4, automatic page breaks.

const W = 595.28;
const H = 841.89;
const M = 48; // page margin
const BODY_W = W - M * 2;

// Character widths (per 1000 units) of the built-in Helvetica fonts for ASCII 32..126.
const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const HELV_B = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

const FONTS = { regular: 'F1', bold: 'F2', mono: 'F3' };
const widthOf = (text, font, size) => {
  if (font === 'mono') return text.length * 0.6 * size;
  const table = font === 'bold' ? HELV_B : HELV;
  let w = 0;
  for (let i = 0; i < text.length; i++) w += table[text.charCodeAt(i) - 32] ?? 556;
  return (w * size) / 1000;
};

const SEV = {
  critical: { label: 'CRITICAL', color: [0.86, 0.15, 0.15] },
  high: { label: 'HIGH', color: [0.92, 0.45, 0.05] },
  medium: { label: 'MEDIUM', color: [0.79, 0.58, 0.02] },
  low: { label: 'LOW', color: [0.1, 0.52, 0.76] },
};
const ORDER = ['critical', 'high', 'medium', 'low'];
const INK = [0.1, 0.12, 0.17];
const MUTED = [0.4, 0.44, 0.5];

/** Built-in fonts only cover Latin-1 text. Anything else becomes a plain look-alike or "?". */
export function toPdfText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/·|•/g, '-')
    .replace(/\t/g, '    ')
    .replace(/\r/g, '')
    .replace(/[^\n\x20-\x7E]/g, '?');
}

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
const num = (n) => (Math.round(n * 100) / 100).toString();
const rgb = (c) => c.map(num).join(' ');

function wrap(text, font, size, maxWidth) {
  const lines = [];
  for (const para of toPdfText(text).split('\n')) {
    if (font === 'mono') {
      const per = Math.max(10, Math.floor(maxWidth / (0.6 * size)));
      if (!para.length) lines.push('');
      for (let i = 0; i < para.length; i += per) lines.push(para.slice(i, i + per));
      continue;
    }
    let line = '';
    for (const word of para.split(' ')) {
      const attempt = line ? `${line} ${word}` : word;
      if (widthOf(attempt, font, size) <= maxWidth) {
        line = attempt;
        continue;
      }
      if (line) lines.push(line);
      // a single very long word (a path or URL) is cut to fit
      let rest = word;
      while (widthOf(rest, font, size) > maxWidth) {
        let cut = rest.length - 1;
        while (cut > 1 && widthOf(rest.slice(0, cut), font, size) > maxWidth) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

class Doc {
  constructor(headerText) {
    this.pages = [];
    this.headerText = toPdfText(headerText);
    this.newPage();
  }

  newPage() {
    this.ops = [];
    this.pages.push(this.ops);
    this.y = H - M - 14; // leaves room for the running header
  }

  ensure(height) {
    if (this.y - height < M + 14) this.newPage();
  }

  text(x, y, str, { font = 'regular', size = 10, color = INK } = {}) {
    this.ops.push(`BT /${FONTS[font]} ${num(size)} Tf ${rgb(color)} rg ${num(x)} ${num(y)} Td (${esc(str)}) Tj ET`);
  }

  rect(x, y, w, h, color) {
    this.ops.push(`${rgb(color)} rg ${num(x)} ${num(y)} ${num(w)} ${num(h)} re f`);
  }

  gap(h) {
    this.y -= h;
  }

  /** A block of wrapped text. Breaks across pages line by line. */
  paragraph(str, { font = 'regular', size = 10, color = INK, indent = 0, lead = 1.35, bg = null } = {}) {
    const lines = wrap(str, font, size, BODY_W - indent - (bg ? 12 : 0));
    const lh = size * lead;
    for (const line of lines) {
      this.ensure(lh + (bg ? 4 : 0));
      if (bg) this.rect(M + indent, this.y - lh + size * 0.35, BODY_W - indent, lh, bg);
      this.text(M + indent + (bg ? 6 : 0), this.y - size, line, { font, size, color });
      this.y -= lh;
    }
  }

  badge(label, color, x, y) {
    const w = widthOf(label, 'bold', 7.5) + 12;
    this.rect(x, y - 3, w, 13, color);
    this.text(x + 6, y + 0.5, label, { font: 'bold', size: 7.5, color: [1, 1, 1] });
    return w;
  }

  build() {
    const objects = [];
    const add = (body) => objects.push(body) && objects.length;
    const catalog = add('');
    const pagesObj = add('');
    const fReg = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const fBold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const fMono = add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');

    const kids = [];
    this.pages.forEach((ops, i) => {
      const chrome = [
        `BT /F1 8 Tf ${rgb(MUTED)} rg ${num(M)} ${num(H - 30)} Td (${esc(this.headerText)}) Tj ET`,
        `BT /F1 8 Tf ${rgb(MUTED)} rg ${num(W - M - 40)} ${num(24)} Td (Page ${i + 1} of ${this.pages.length}) Tj ET`,
      ];
      const stream = [...chrome, ...ops].join('\n');
      const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      const page = add(
        `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${num(W)} ${num(H)}] /Contents ${content} 0 R ` +
          `/Resources << /Font << /F1 ${fReg} 0 R /F2 ${fBold} 0 R /F3 ${fMono} 0 R >> >> >>`
      );
      kids.push(`${page} 0 R`);
    });
    objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
    objects[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;

    let out = '%PDF-1.4\n';
    const offsets = [];
    objects.forEach((body, i) => {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
    out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;

    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }
}

const dateText = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

/** Builds the PDF (as bytes) for a completed scan report. */
export function buildReportPdf(report) {
  const doc = new Doc(`Threat Modeler security report - ${report.name}`);

  doc.paragraph('Threat Report', { font: 'bold', size: 22, lead: 1.2 });
  doc.paragraph(report.name, { font: 'bold', size: 12, color: MUTED });
  doc.paragraph(`Scan finished: ${dateText(report.completedAt) || 'n/a'}`, { size: 9, color: MUTED });
  doc.gap(10);

  // Risk score and counts
  const score = Number(report.riskScore) || 0;
  doc.ensure(60);
  const top = doc.y;
  doc.rect(M, top - 50, 130, 50, [0.95, 0.96, 0.98]);
  doc.text(M + 12, top - 16, 'RISK SCORE', { font: 'bold', size: 8, color: MUTED });
  doc.text(M + 12, top - 42, `${score}`, {
    font: 'bold',
    size: 26,
    color: score >= 70 ? SEV.critical.color : score >= 40 ? SEV.high.color : SEV.medium.color,
  });
  doc.text(M + 12 + widthOf(`${score}`, 'bold', 26) + 3, top - 42, '/100', { size: 10, color: MUTED });

  let x = M + 150;
  for (const s of ORDER) {
    doc.rect(x, top - 50, 80, 50, [0.95, 0.96, 0.98]);
    doc.rect(x, top - 50, 3, 50, SEV[s].color);
    doc.text(x + 12, top - 16, SEV[s].label, { font: 'bold', size: 8, color: MUTED });
    doc.text(x + 12, top - 42, String(report.summary?.[s] || 0), { font: 'bold', size: 22 });
    x += 88;
  }
  doc.y = top - 50 - 18;

  // Summary
  if (report.aiSummary?.text) {
    const ai = report.aiSummary.source === 'ai';
    doc.paragraph(ai ? 'AI summary and recommendations' : 'Summary and recommendations', { font: 'bold', size: 13 });
    doc.gap(3);
    doc.paragraph(report.aiSummary.text, { size: 10 });
    const priorities = report.aiSummary.priorities || [];
    if (priorities.length) {
      doc.gap(8);
      doc.paragraph('Fix these first', { font: 'bold', size: 10, color: MUTED });
      priorities.forEach((p, i) => {
        doc.gap(3);
        doc.paragraph(`${i + 1}. ${p.title}`, { font: 'bold', size: 10 });
        if (p.why) doc.paragraph(p.why, { size: 9.5, color: MUTED, indent: 14 });
        doc.paragraph(`Do this: ${p.action}`, { size: 9.5, indent: 14 });
      });
    }
    if (ai) {
      doc.gap(6);
      doc.paragraph('Written by an AI model from the findings. Double-check before acting on it.', { size: 8, color: MUTED });
    }
    doc.gap(14);
  }

  // Findings
  const findings = [...(report.findings || [])].sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity));
  doc.paragraph(`Vulnerabilities (${findings.length})`, { font: 'bold', size: 14 });
  doc.gap(6);

  if (!findings.length) doc.paragraph('No findings were reported for this scan.', { color: MUTED });

  findings.forEach((f, i) => {
    doc.ensure(70);
    const sev = SEV[f.severity] || SEV.low;
    const y = doc.y - 10;
    let bx = M;
    bx += doc.badge(sev.label, sev.color, bx, y) + 8;
    const meta = [f.category, f.cwe, { rule: 'Rule', ai: 'AI review', osv: 'Dependency' }[f.source]].filter(Boolean).join('  |  ');
    doc.text(bx, y + 0.5, toPdfText(meta), { size: 8, color: MUTED });
    doc.y -= 20;

    doc.paragraph(`${i + 1}. ${f.title}`, { font: 'bold', size: 11 });
    if (f.file) {
      doc.paragraph(`${f.file}${f.line ? `:${f.line}` : ''}`, { font: 'mono', size: 8, color: MUTED });
    }
    doc.gap(3);
    if (f.description) doc.paragraph(f.description, { size: 9.5 });
    if (f.snippet) {
      doc.gap(4);
      doc.paragraph(f.snippet, { font: 'mono', size: 7.5, bg: [0.94, 0.95, 0.97] });
    }
    if (f.recommendation) {
      doc.gap(4);
      doc.paragraph('Recommendation', { font: 'bold', size: 9 });
      doc.paragraph(f.recommendation, { size: 9.5 });
    }
    const fix = suggestFix(f);
    if (fix) {
      doc.gap(4);
      doc.paragraph('Suggested fix (an example to adapt)', { font: 'bold', size: 9 });
      doc.paragraph(fix.note, { size: 9, color: MUTED });
      doc.gap(2);
      doc.paragraph(fix.good, { font: 'mono', size: 7.5, bg: [0.9, 0.97, 0.92] });
    }
    doc.gap(10);
    doc.ensure(6);
    doc.rect(M, doc.y, BODY_W, 0.5, [0.85, 0.87, 0.9]);
    doc.gap(10);
  });

  doc.paragraph('Automated review. A scan finds common problems, not all of them, so treat it as a checklist and not a guarantee.', {
    size: 8,
    color: MUTED,
  });
  return doc.build();
}

/** Starts a browser download of the report PDF. */
export function downloadReportPdf(report) {
  const bytes = buildReportPdf(report);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const safe = String(report.name || 'report').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 50) || 'report';
  const a = document.createElement('a');
  a.href = url;
  a.download = `threat-report-${safe}-${dateText(report.completedAt) || 'scan'}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
