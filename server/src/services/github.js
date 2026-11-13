// Fetches a PUBLIC GitHub repository as a zip so it can be scanned like an uploaded project.
// Safety rules:
//  - the address is parsed strictly, and only codeload.github.com is ever contacted (no SSRF),
//  - redirects are followed by hand and must stay on codeload.github.com,
//  - the download is capped in size and time,
//  - for private repositories a read-only token is used for ONE request and then forgotten. It is never stored or logged,
//    and it is never sent anywhere except api.github.com,
//  - nothing from the repository is executed. It is only read as text by the scanner.

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
const BRANCH = /^[A-Za-z0-9._/-]{1,100}$/;
const HOST = 'codeload.github.com';
const API_HOST = 'api.github.com';

// GitHub personal access tokens: fine-grained (github_pat_...) or classic (ghp_...). Checked only for shape.
const TOKEN = /^(?:github_pat_[A-Za-z0-9_]{20,255}|gh[pousr]_[A-Za-z0-9]{20,255})$/;
export const isGithubToken = (t) => typeof t === 'string' && TOKEN.test(t.trim());

export class GithubError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Accepts https://github.com/owner/repo, .../repo.git and .../repo/tree/branch. Returns { owner, repo, branch }. */
export function parseGithubUrl(input) {
  const raw = String(input || '').trim();
  if (!raw || raw.length > 300) throw new GithubError('Paste a GitHub repository link, like https://github.com/owner/repo');

  let url;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new GithubError('That does not look like a web address');
  }
  if (!['github.com', 'www.github.com'].includes(url.hostname.toLowerCase()) || url.username || url.password || url.port) {
    throw new GithubError('Only github.com repository links are supported');
  }

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) throw new GithubError('The link must point to a repository, like https://github.com/owner/repo');

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, '');
  if (!OWNER.test(owner) || !REPO.test(repo) || repo === '.' || repo === '..') {
    throw new GithubError('That repository name is not valid');
  }

  let branch = '';
  if (parts[2] === 'tree' && parts.length > 3) {
    branch = parts.slice(3).join('/');
    if (!BRANCH.test(branch) || branch.includes('..') || branch.startsWith('/') || branch.endsWith('/')) {
      throw new GithubError('That branch name is not valid');
    }
  }
  return { owner, repo, branch };
}

export async function downloadRepoZip({
  owner,
  repo,
  branch = '',
  sha = '',
  token = '',
  maxBytes = 25 * 1024 * 1024,
  timeoutMs = 60000,
  fetchImpl = globalThis.fetch,
}) {
  const authed = Boolean(token);
  if (authed && !isGithubToken(token)) throw new GithubError('That does not look like a GitHub token');
  if (sha && !/^[0-9a-f]{7,40}$/i.test(sha)) throw new GithubError('That commit id is not valid');

  const ref = sha || (branch ? `refs/heads/${branch}` : '');
  let url = authed
    ? `https://${API_HOST}/repos/${owner}/${repo}/zipball${ref ? `/${sha || branch}` : ''}`
    : `https://${HOST}/${owner}/${repo}/zip/${ref || 'HEAD'}`;
  const signal = AbortSignal.timeout(timeoutMs);

  let res;
  for (let hops = 0; ; hops++) {
    try {
      // The token goes only on the first request, to api.github.com. The redirect target carries its own signed address.
      const headers = { 'user-agent': 'threat-modeler' };
      if (authed && hops === 0) {
        headers.authorization = `Bearer ${token.trim()}`;
        headers.accept = 'application/vnd.github+json';
        headers['x-github-api-version'] = '2022-11-28';
      }
      res = await fetchImpl(url, { redirect: 'manual', signal, headers });
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw new GithubError('GitHub took too long to send the repository. Try again, or upload a zip instead', 504);
      }
      throw new GithubError('Could not reach GitHub. Try again in a moment', 502);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      if (hops >= 3) throw new GithubError('GitHub redirected too many times', 502);
      const next = new URL(res.headers.get('location'), url);
      if (next.protocol !== 'https:' || next.hostname !== HOST) throw new GithubError('GitHub sent us somewhere unexpected', 502);
      url = next.toString();
      continue;
    }
    break;
  }

  if (authed && [401, 403, 404].includes(res.status)) {
    throw new GithubError(
      'GitHub would not give us this repository. Check that the token has not expired, can read this repository, and has "Contents: read" permission',
      res.status === 401 ? 401 : 403
    );
  }
  if (res.status === 404) {
    throw new GithubError(
      branch
        ? 'Repository or branch not found. Only public repositories can be scanned'
        : 'Repository not found. It may be private. Only public repositories can be scanned',
      404
    );
  }
  if (res.status === 429 || res.status === 403) throw new GithubError('GitHub is limiting requests right now. Try again later', 503);
  if (!res.ok) throw new GithubError(`GitHub answered with an error (${res.status})`, 502);

  const declared = Number(res.headers.get('content-length') || 0);
  const tooBig = () => new GithubError(`That repository is larger than ${Math.round(maxBytes / 1024 / 1024)}MB. Upload only the folders you want scanned`, 413);
  if (declared > maxBytes) throw tooBig();

  const chunks = [];
  let total = 0;
  try {
    for await (const chunk of res.body) {
      total += chunk.length;
      if (total > maxBytes) throw tooBig();
      chunks.push(Buffer.from(chunk));
    }
  } catch (err) {
    if (err instanceof GithubError) throw err;
    throw new GithubError('The download from GitHub was interrupted. Try again', 502);
  }
  return { buffer: Buffer.concat(chunks), owner, repo, branch };
}
