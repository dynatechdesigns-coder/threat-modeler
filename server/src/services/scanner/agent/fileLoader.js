import { readZip } from '../../../utils/zipReader.js';

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'coverage', 'vendor', '__pycache__',
  '.venv', 'venv', 'target', '.idea', '.vscode', '__MACOSX',
]);

const CODE_EXTENSIONS = new Set([
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'vue', 'svelte', 'py', 'php', 'rb', 'go', 'java', 'kt', 'cs',
  'rs', 'swift', 'c', 'cpp', 'h', 'hpp', 'sh', 'bash', 'sql', 'yml', 'yaml', 'toml', 'ini', 'conf',
  'xml', 'html', 'tf', 'gradle', 'properties', 'ejs', 'hbs',
]);
const SPECIAL_FILES = new Set(['dockerfile', '.npmrc', '.htaccess']);
const MANIFESTS = new Set(['package.json', 'package-lock.json']);

export const TEST_PATH = /(^|\/)(?:tests?|__tests__|spec|e2e|fixtures?)\/|\.(?:test|spec)\.[a-z]+$/i;

export const LIMITS = {
  maxFiles: 400,
  maxFileBytes: 300 * 1024,
  maxTotalBytes: 10 * 1024 * 1024,
  maxManifestBytes: 3 * 1024 * 1024,
};

const LOW_PRIORITY = /(^|\/)(data\/static|static|public|assets|i18n|locales?|docs?|examples?|samples?|migrations?)\//i;
const BROWSER_SIDE = /(^|\/)(frontend|client|web|ui|components|views|templates)\//i;
const SERVER_SIDE = /(^|\/)(routes?|controllers?|api|server|lib|models?|services?|middleware|handlers?|config|auth|db)\//i;

function priority(path) {
  if (LOW_PRIORITY.test(path)) return 3;
  if (SERVER_SIDE.test(path)) return 0;
  if (BROWSER_SIDE.test(path)) return 2;
  return 1;
}

export const byPriority = (a, b) =>
  priority(a.path) - priority(b.path) || a.path.split('/').length - b.path.split('/').length || (a.path < b.path ? -1 : 1);

export function extOf(path) {
  const base = path.split('/').pop();
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(i + 1).toLowerCase() : '';
}

export function isEnvFile(path) {
  const base = path.split('/').pop().toLowerCase();
  return (base === '.env' || base.startsWith('.env.')) && !/\.(example|sample|template|dist)$/.test(base);
}

export async function loadSources({ files, readFile, log = () => {}, includeTests = false }) {
  const sources = [];
  const manifests = [];
  const stats = { scanned: 0, ignored: 0, tooLarge: 0, unreadable: 0, tests: 0 };
  const pending = [];
  
  // Track metadata to generate smart errors if no code is found
  const rawExtensionsFound = new Set();
  let allFilesNested = true; 
  let totalFilesConsidered = 0;

  const consider = (rawPath, buf) => {
    const p = String(rawPath).replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '');
    const parts = p.split('/');
    
    totalFilesConsidered++;
    if (parts.length === 1) allFilesNested = false;

    if (!p || parts.includes('..')) {
      stats.unreadable += 1;
      return;
    }
    if (parts.slice(0, -1).some((d) => IGNORED_DIRS.has(d))) {
      stats.ignored += 1;
      return;
    }

    const base = parts[parts.length - 1].toLowerCase();
    
    if (!includeTests && TEST_PATH.test(p) && !isEnvFile(p) && !MANIFESTS.has(base)) {
      stats.tests += 1;
      return;
    }

    if (MANIFESTS.has(base)) {
      if (buf.length <= LIMITS.maxManifestBytes) manifests.push({ path: p, content: buf.toString('utf8') });
      return;
    }

    const ext = extOf(p);
    if (ext) rawExtensionsFound.add(ext.toLowerCase());

    const scannable = CODE_EXTENSIONS.has(ext) || SPECIAL_FILES.has(base) || base.startsWith('dockerfile') || base.endsWith('.dockerfile') || isEnvFile(p);
    
    if (!scannable || base.endsWith('.min.js')) {
      stats.ignored += 1;
      return;
    }
    if (buf.length > LIMITS.maxFileBytes) {
      stats.tooLarge += 1;
      return;
    }
    
    if (buf.length > 4096) {
      let lines = 1;
      for (let i = 0; i < buf.length; i++) if (buf[i] === 10) lines++;
      if (buf.length / lines > 150) {
        stats.ignored += 1;
        return;
      }
    }
    if (buf.subarray(0, 8000).includes(0)) {
      stats.ignored += 1; 
      return;
    }
    pending.push({ path: p, ext, buf });
  };

  for (const file of files) {
    let buf;
    try {
      buf = await readFile(file.key, file.storage);
    } catch (err) {
      stats.unreadable += 1;
      log(`[WARN] Could not read ${file.originalName}: ${err.message}`);
      continue;
    }

    if (/\.zip$/i.test(file.originalName)) {
      try {
        const { entries, skipped } = readZip(buf);
        log(`Extracted ${entries.length} file(s) from ${file.originalName}`);
        stats.tooLarge += skipped.filter((s) => /large/.test(s.reason)).length;
        if (skipped.length) log(`[WARN] Skipped ${skipped.length} entr${skipped.length === 1 ? 'y' : 'ies'} in ${file.originalName} (${skipped[0].reason})`);
        for (const entry of entries) consider(entry.path, entry.buffer);
      } catch (err) {
        log(`[ERROR] ${file.originalName}: ${err.message}`);
      }
    } else {
      consider(file.originalName, buf);
    }
  }

  let totalBytes = 0;
  let capped = false;
  for (const f of pending.sort(byPriority)) {
    if (sources.length >= LIMITS.maxFiles || totalBytes + f.buf.length > LIMITS.maxTotalBytes) {
      capped = true;
      continue;
    }
    totalBytes += f.buf.length;
    const content = f.buf.toString('utf8');
    sources.push({ path: f.path, ext: f.ext, content, lines: content.split(/\r?\n/) });
  }

  if (capped) log('[WARN] Scan size limit reached, the less important files were not analyzed');
  stats.scanned = sources.length;

  let smartError = null;
  if (sources.length === 0 && totalFilesConsidered > 0) {
    const mediaExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'mp4', 'webm', 'mp3', 'wav', 'woff', 'woff2', 'ttf', 'eot'];
    
    const onlyMediaFound = Array.from(rawExtensionsFound).every(ext => mediaExts.includes(ext));
    
    if (onlyMediaFound) {
      smartError = "Analysis failed: Only image and media assets detected. Please upload a zip containing your actual source code (.js, .html, etc).";
    } else if (allFilesNested) {
      smartError = "Analysis failed: Nested folder detected. Please open your project folder and zip the code files directly, rather than zipping the outer folder.";
    } else {
      smartError = `Analysis failed: ${stats.ignored} files were ignored (e.g. minified bundles, unsupported extensions, or ignored directories) and no readable source code was found.`;
    }
  }

  return { sources, manifests, stats, smartError };
}
