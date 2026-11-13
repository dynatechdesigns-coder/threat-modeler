import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGithubUrl, downloadRepoZip, GithubError } from '../src/services/github.js';

test('parses normal repository links', () => {
  assert.deepEqual(parseGithubUrl('https://github.com/dynatechdesigns-coder/threat-modeler'), { owner: 'dynatechdesigns-coder', repo: 'threat-modeler', branch: '' });
  assert.equal(parseGithubUrl('github.com/a/b.git').repo, 'b');
  assert.equal(parseGithubUrl('https://github.com/a/b/tree/feature/x').branch, 'feature/x');
  assert.equal(parseGithubUrl('https://github.com/a/b/issues/3').branch, '');
});

test('rejects other hosts, tricks and junk', () => {
  for (const bad of [
    '', 'https://evil.com/a/b', 'https://github.com.evil.com/a/b', 'https://user:pw@github.com/a/b',
    'https://github.com/a', 'https://github.com/a/..', 'https://github.com/-bad/b', 'https://github.com:8080/a/b',
    'http://169.254.169.254/latest', 'ftp://github.com/a/b',
  ]) assert.throws(() => parseGithubUrl(bad), GithubError, bad);
});

const ok = (bytes, headers = {}) => async () => new Response(bytes, { status: 200, headers });

test('dot-dot paths are normalised away and can only ever name another repository', () => {
  assert.deepEqual(parseGithubUrl('https://github.com/a/b/tree/../../x'), { owner: 'a', repo: 'x', branch: '' });
});

test('downloads and returns the zip bytes, calling only codeload', async () => {
  const urls = [];
  const fetchImpl = async (u) => (urls.push(u), new Response(Buffer.from('PKzip'), { status: 200 }));
  const r = await downloadRepoZip({ owner: 'a', repo: 'b', fetchImpl });
  assert.equal(r.buffer.toString(), 'PKzip');
  assert.deepEqual(urls, ['https://codeload.github.com/a/b/zip/HEAD']);
  await downloadRepoZip({ owner: 'a', repo: 'b', branch: 'dev', fetchImpl });
  assert.equal(urls[1], 'https://codeload.github.com/a/b/zip/refs/heads/dev');
});

test('follows redirects only within codeload.github.com', async () => {
  let n = 0;
  const good = async () => (n++ ? new Response('PK', { status: 200 }) : new Response(null, { status: 302, headers: { location: 'https://codeload.github.com/x/y/zip/HEAD' } }));
  assert.equal((await downloadRepoZip({ owner: 'a', repo: 'b', fetchImpl: good })).buffer.toString(), 'PK');
  const evil = async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } });
  await assert.rejects(downloadRepoZip({ owner: 'a', repo: 'b', fetchImpl: evil }), /unexpected/);
});

test('friendly errors for 404, size and network failure', async () => {
  await assert.rejects(downloadRepoZip({ owner: 'a', repo: 'b', fetchImpl: async () => new Response('', { status: 404 }) }), (e) => e.status === 404 && /private/.test(e.message));
  await assert.rejects(downloadRepoZip({ owner: 'a', repo: 'b', maxBytes: 3, fetchImpl: ok(Buffer.from('123456')) }), (e) => e.status === 413);
  await assert.rejects(downloadRepoZip({ owner: 'a', repo: 'b', fetchImpl: async () => { throw new TypeError('fetch failed'); } }), (e) => e.status === 502);
});

const FINE = `github_pat_${'A1b2C3d4E5'.repeat(4)}`;

test('private repo: token is sent only to api.github.com, once, and never to the redirect target', async () => {
  const calls = [];
  const fetchImpl = async (u, opts) => {
    calls.push({ u, auth: opts.headers.authorization });
    return calls.length === 1
      ? new Response(null, { status: 302, headers: { location: 'https://codeload.github.com/a/b/legacy.zip/abc?token=SIGNED' } })
      : new Response('PKprivate', { status: 200 });
  };
  const r = await downloadRepoZip({ owner: 'a', repo: 'b', token: FINE, fetchImpl });
  assert.equal(r.buffer.toString(), 'PKprivate');
  assert.equal(calls[0].u, 'https://api.github.com/repos/a/b/zipball');
  assert.equal(calls[0].auth, `Bearer ${FINE}`);
  assert.equal(calls[1].auth, undefined);
  assert.ok(!JSON.stringify(r).includes(FINE));
});

test('private repo: branch and commit are used, bad tokens and shas are refused before any request', async () => {
  const urls = [];
  const fetchImpl = async (u) => (urls.push(u), new Response('PK', { status: 200 }));
  await downloadRepoZip({ owner: 'a', repo: 'b', branch: 'dev', token: FINE, fetchImpl });
  await downloadRepoZip({ owner: 'a', repo: 'b', sha: 'abc1234', fetchImpl });
  assert.deepEqual(urls, ['https://api.github.com/repos/a/b/zipball/dev', 'https://codeload.github.com/a/b/zip/abc1234']);
  await assert.rejects(downloadRepoZip({ owner: 'a', repo: 'b', token: 'not a token', fetchImpl }), /token/);
  await assert.rejects(downloadRepoZip({ owner: 'a', repo: 'b', sha: '../../x', fetchImpl }), /commit/);
  assert.equal(urls.length, 2);
});

test('private repo: rejected token gives a clear message that does not echo the token', async () => {
  for (const status of [401, 403, 404]) {
    await assert.rejects(
      downloadRepoZip({ owner: 'a', repo: 'b', token: FINE, fetchImpl: async () => new Response('', { status }) }),
      (e) => /token/.test(e.message) && !e.message.includes(FINE)
    );
  }
});
