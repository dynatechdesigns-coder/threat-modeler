// Threat Modeler CI step. Zips the project, uploads it, waits for the scan and decides whether the build should fail.
// Plain Node 18+, no dependencies. Settings come from the INPUT_* environment variables set by action.yml.
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const env = process.env;
const input = (name, fallback = '') => (env[`INPUT_${name.toUpperCase().replace(/-/g, '_')}`] ?? fallback).trim();

const token = input('token');
const api = input('api-url').replace(/\/+$/, '').replace(/\/api$/, '');
const failOn = input('fail-on', 'new-severe');
const path = input('path', '.') || '.';
const timeoutSec = Math.max(30, Number(input('timeout', '600')) || 600);
const project = input('project') || env.GITHUB_REPOSITORY || '';
const sha = env.GITHUB_SHA || '';
const ghToken = input('github-token');
const wantComment = input('comment', 'true') !== 'false';

const MODES = ['new-severe', 'new-any', 'severe', 'never'];
const log = (m) => console.log(`[threat-modeler] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function die(message) {
  console.error(`::error::${message}`);
  summary(`### Threat Modeler\n\n:x: ${message}\n`);
  // fail-on "never" means the scan must not be able to break the build, not even when it cannot run.
  process.exit(failOn === 'never' ? 0 : 1);
}

function summary(markdown) {
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

function setOutput(name, value) {
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

/** A scan of the main branch becomes the baseline that pull requests are compared with. */
function scanRole() {
  const mode = input('baseline', 'auto');
  if (mode === 'true') return 'baseline';
  if (mode === 'false') return 'pr';
  try {
    const event = env.GITHUB_EVENT_PATH && existsSync(env.GITHUB_EVENT_PATH) ? JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8')) : {};
    const defaultBranch = event.repository?.default_branch;
    if (env.GITHUB_EVENT_NAME === 'push' && defaultBranch && env.GITHUB_REF === `refs/heads/${defaultBranch}`) return 'baseline';
  } catch {
    /* fall through */
  }
  return 'pr';
}

async function main() {
  if (!token) die('No API token. Add it as a repository secret and pass it as the "token" input.');
  if (!api) die('No "api-url" given. Use the address of your Threat Modeler server.');
  if (!MODES.includes(failOn)) die(`"fail-on" must be one of: ${MODES.join(', ')}`);
  if (!project) die('Could not work out the project name. Pass the "project" input.');

  const zipPath = join(mkdtempSync(join(tmpdir(), 'tm-')), 'project.zip');
  const zipped = spawnSync('zip', ['-qr', zipPath, '.', '-x', '.git/*', '*/node_modules/*', 'node_modules/*', '*/.git/*', 'dist/*', 'build/*'], { cwd: path });
  if (zipped.error || zipped.status !== 0 || !existsSync(zipPath)) die(`Could not zip the project: ${zipped.error?.message || zipped.stderr?.toString().slice(0, 200) || 'the zip tool failed'}`);

  const role = scanRole();
  log(`Uploading ${project}${sha ? ` @ ${sha.slice(0, 7)}` : ''} (${role} scan)`);

  const form = new FormData();
  form.append('file', new Blob([readFileSync(zipPath)], { type: 'application/zip' }), 'project.zip');
  form.append('project', project);
  form.append('sha', sha);
  form.append('role', role);

  let res;
  try {
    res = await fetch(`${api}/api/ci/scan`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  } catch (err) {
    die(`Could not reach ${api}: ${err.message}`);
  }
  const started = await res.json().catch(() => ({}));
  if (!res.ok) die(`The server refused the upload (${res.status}): ${started.message || 'no reason given'}`);

  const deadline = Date.now() + timeoutSec * 1000;
  let result;
  while (Date.now() < deadline) {
    await sleep(Number(env.TM_POLL_MS) || 4000);
    const poll = await fetch(`${api}/api/ci/scans/${started.id}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
    if (!poll || !poll.ok) continue; // a hiccup (the server may be waking up): try again until the deadline
    const body = await poll.json().catch(() => ({}));
    if (body.status === 'completed') {
      result = body;
      break;
    }
    if (body.status === 'failed') die(`The scan failed: ${body.error || 'unknown error'}`);
  }
  if (!result) die(`The scan did not finish within ${timeoutSec} seconds.`);

  await report(result);
}

const SEV_ICON = { critical: ':red_circle:', high: ':orange_circle:', medium: ':yellow_circle:', low: ':white_circle:' };

function verdict(r) {
  if (failOn === 'never') return { fail: false, why: 'fail-on is "never"' };
  if (failOn === 'severe') {
    const n = r.summary.critical + r.summary.high;
    return { fail: n > 0, why: `${n} critical or high problem${n === 1 ? '' : 's'} in the project` };
  }
  if (r.baseline) return { fail: false, why: 'first scan of this project: nothing to compare with yet' };
  if (failOn === 'new-any') return { fail: r.newCount > 0, why: `${r.newCount} new problem${r.newCount === 1 ? '' : 's'}` };
  return { fail: r.newSevere > 0, why: `${r.newSevere} new critical or high problem${r.newSevere === 1 ? '' : 's'}` };
}

// Text that comes from the scan (rule titles, file names) is cleaned before it goes into a comment: no HTML, no
// @mentions that would notify strangers, no way to break the table or the code span.
const safe = (s, max = 200) =>
  String(s ?? '')
    .replace(/[<>`]/g, '')
    .replace(/@/g, '@\u200b')
    .replace(/\|/g, '/')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, max);

const COMMENT_MARK = '<!-- threat-modeler-comment -->';

function pullRequestNumber() {
  try {
    const event = env.GITHUB_EVENT_PATH && existsSync(env.GITHUB_EVENT_PATH) ? JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8')) : {};
    const n = event.pull_request?.number ?? /^refs\/pull\/(\d+)\//.exec(env.GITHUB_REF || '')?.[1];
    return Number.isInteger(Number(n)) && Number(n) > 0 ? Number(n) : 0;
  } catch {
    return 0;
  }
}

/** One comment per pull request, edited in place on every new push. Never changes whether the build passes. */
async function postComment(markdown) {
  if (!wantComment || !ghToken || !(env.GITHUB_EVENT_NAME || '').startsWith('pull_request')) return;
  const repo = env.GITHUB_REPOSITORY || '';
  const number = pullRequestNumber();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !number) return;

  const base = (env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, '');
  const headers = { Authorization: `Bearer ${ghToken}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'threat-modeler-action' };
  const url = `${base}/repos/${repo}/issues/${number}/comments`;
  try {
    let existing = null;
    for (let page = 1; page <= 5 && !existing; page++) {
      const list = await fetch(`${url}?per_page=100&page=${page}`, { headers });
      if (!list.ok) throw new Error(`GitHub answered ${list.status}`);
      const items = await list.json();
      existing = items.find((c) => typeof c.body === 'string' && c.body.includes(COMMENT_MARK)) || null;
      if (items.length < 100) break;
    }
    const body = JSON.stringify({ body: `${COMMENT_MARK}\n${markdown}` });
    const res = existing
      ? await fetch(`${base}/repos/${repo}/issues/comments/${existing.id}`, { method: 'PATCH', headers, body })
      : await fetch(url, { method: 'POST', headers, body });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    log(`${existing ? 'Updated' : 'Posted'} the pull request comment`);
  } catch (err) {
    console.log(`::warning::Could not post the pull request comment (${err.message}). Add "permissions: pull-requests: write" to the workflow. The scan result is unaffected.`);
  }
}

async function report(r) {
  const v = verdict(r);
  const lines = [
    `### Threat Modeler: ${v.fail ? ':x: failed' : ':white_check_mark: passed'}`,
    '',
    `Risk score **${r.riskScore}/100**${r.baseline ? '' : ` (${r.scoreChange >= 0 ? '+' : ''}${r.scoreChange} since the main branch)`}. ${r.summary.critical} critical, ${r.summary.high} high, ${r.summary.medium} medium, ${r.summary.low} low.`,
    `Result: ${v.why}.`,
  ];
  if (r.newFindings?.length) {
    lines.push('', '**New in this change**', '', '| Severity | Problem | Where |', '|---|---|---|');
    for (const f of r.newFindings) lines.push(`| ${SEV_ICON[f.severity] || ''} ${safe(f.severity, 20)} | ${safe(f.title)} | \`${safe(f.file)}${f.line ? `:${Number(f.line) || 0}` : ''}\` |`);
  }
  if (r.reportUrl) lines.push('', `[Open the full report](${r.reportUrl})`);
  summary(lines.join('\n'));
  await postComment(lines.join('\n'));

  for (const f of r.newFindings || []) {
    const kind = f.severity === 'critical' || f.severity === 'high' ? 'error' : 'warning';
    console.log(`::${kind} file=${safe(f.file)},line=${Number(f.line) || 1}::${safe(f.severity, 20)}: ${safe(f.title)}`);
  }
  setOutput('risk-score', r.riskScore);
  setOutput('new-findings', r.newCount);
  setOutput('new-severe', r.newSevere);
  setOutput('report-url', r.reportUrl || '');

  log(`Risk ${r.riskScore}/100. ${v.why}.`);
  if (v.fail) {
    console.error(`::error::Threat Modeler: ${v.why}. See the job summary.`);
    process.exit(1);
  }
}

main().catch((err) => die(`Unexpected error: ${err.message}`));
