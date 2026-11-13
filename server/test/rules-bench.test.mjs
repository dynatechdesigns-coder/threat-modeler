import test from 'node:test';
import assert from 'node:assert/strict';
import { runStaticRules } from '../src/services/scanner/agent/staticRules.js';
import { byPriority } from '../src/services/scanner/agent/fileLoader.js';

const src = (path, code) => {
  const ext = path.split('.').pop();
  return { path, ext, content: code, lines: code.split('\n') };
};
const ids = (path, code) => runStaticRules([src(path, code)]).map((f) => f.ruleId);

test('PHP SQL injection only when the variable holds request data', () => {
  assert.ok(ids('a.php', `$id = $_GET['id'];\n$q = "SELECT * FROM users WHERE id = '$id'";`).includes('sql-injection'));
  assert.ok(!ids('a.php', `$id = 5;\n$q = "SELECT * FROM users WHERE id = '$id'";`).includes('sql-injection'));
  // cleaned before use: no finding
  assert.ok(!ids('a.php', `$id = intval($_GET['id']);\n$q = "SELECT * FROM users WHERE id = '$id'";`).includes('sql-injection'));
  // overwritten with something else: no finding
  assert.ok(!ids('a.php', `$id = $_GET['id'];\n$id = md5($id);\n$q = "UPDATE users SET p = '$id'";`).includes('sql-injection'));
});

test('PHP XSS needs request data, and escaping silences it', () => {
  assert.ok(ids('a.php', `$html .= '<pre>Hello ' . $_GET['n'] . '</pre>';`).includes('xss-php'));
  assert.ok(!ids('a.php', `$html .= '<pre>Hello ' . htmlspecialchars($_GET['n']) . '</pre>';`).includes('xss-php'));
  assert.ok(!ids('a.php', `$html .= '<pre>Fixed text</pre>';`).includes('xss-php'));
  // the accumulator being tainted must not flag later fixed text
  assert.ok(!ids('a.php', `$html .= '<p>' . $_GET['n'] . '</p>';\n$html .= '<p>Static</p>';`).some((_, i, a) => a.length > 1 && false));
  const second = runStaticRules([src('a.php', `$html .= '<p>' . $_GET['n'] . '</p>';\n$html .= '<p>Static</p>';`)]).filter((f) => f.line === 2);
  assert.equal(second.length, 0);
});

test('SSRF is flagged only when the URL variable came from the request', () => {
  assert.ok(ids('a.js', `const url = req.query.u;\nawait fetch(url);`).includes('ssrf-variable'));
  assert.ok(!ids('a.js', `const url = 'https://api.example.com';\nawait fetch(url);`).includes('ssrf-variable'));
  assert.ok(ids('a.js', `const { target } = req.body;\naxios.get(target);`).includes('ssrf-variable'));
});

test('new JavaScript rules', () => {
  assert.ok(ids('a.js', "db.find({ $where: 'this.a == ' + id });").includes('nosql-where'));
  assert.ok(ids('a.js', 'db.find({ $where: `this.a == ${id}` });').includes('nosql-where'));
  assert.ok(ids('a.js', 'const re = /([0-9]+)+#/;').includes('redos'));
  assert.ok(!ids('a.js', 'const re = /^[0-9]+#$/;').includes('redos'));
  assert.ok(!ids('a.js', 'const v = /(\\d+\\.)+\\d+/;').includes('redos'));
  assert.ok(ids('a.js', "res.cookie('session', id);").includes('cookie-no-flags'));
  assert.ok(!ids('a.js', "res.cookie('session', id, { httpOnly: true });").includes('cookie-no-flags'));
  assert.ok(ids('a.js', "crypto.createHmac('sha256', 'abcdef123')").includes('hardcoded-crypto-key'));
  assert.ok(ids('a.js', "app.use('/f', serveIndex('f'));").includes('dir-listing'));
  assert.ok(ids('a.ts', 'x = this.sanitizer.bypassSecurityTrustHtml(v);').includes('angular-bypass'));
  assert.ok(ids('a.js', "const r = mathjs.eval(req.body.expr);").includes('eval-tainted'));
  assert.ok(!ids('a.js', "const r = mathjs.eval('1+1');").includes('eval-tainted'));
  assert.ok(ids('a.js', 'const o = serialize.unserialize(text);').includes('js-deserialize'));
  assert.ok(ids('a.js', "libxmljs.parseXmlString(x, {noent:true});").includes('xxe'));
  assert.ok(ids('a.js', 'if (token == md5(login)) {}').includes('weak-hash-call'));
});

test('new Python and PHP rules', () => {
  assert.ok(ids('a.py', 'claims = jwt.decode(token, verify = False)').includes('jwt-verify-off'));
  assert.ok(!ids('a.py', 'claims = jwt.decode(token, verify = False)').includes('tls-verify'));
  assert.ok(ids('a.py', 'return render_template_string(template, a=1)').includes('ssti'));
  assert.ok(!ids('a.py', "return render_template_string('<p>hi</p>')").includes('ssti'));
  assert.ok(ids('a.py', "app.secret_key = 'F12Zr47j 3yX R~X@H'").includes('secret-assign'));
  assert.ok(!ids('a.py', "app.secret_key = os.environ['KEY']").includes('secret-assign'));
  assert.ok(ids('a.php', 'move_uploaded_file($t, $p);').includes('php-upload'));
  assert.ok(ids('a.php', `$file = $_GET['page'];`).includes('php-file-from-request'));
  assert.ok(ids('a.php', `$u = $_GET['r'];\nheader("location: " . $u);`).includes('open-redirect-php'));
});

test('templates: unescaped output is flagged, includes and escaped output are not', () => {
  assert.ok(ids('v.ejs', '<p><%- name %></p>').includes('template-unescaped'));
  assert.ok(!ids('v.ejs', '<%- include("x") %>').includes('template-unescaped'));
  assert.ok(!ids('v.ejs', '<p><%= name %></p>').includes('template-unescaped'));
  assert.ok(ids('v.hbs', '<p>{{{html}}}</p>').includes('template-unescaped'));
});

test('fixed text is not reported as XSS or eval', () => {
  assert.deepEqual(ids('a.js', "el.innerHTML = '<b>Saved</b>';"), []);
  assert.deepEqual(ids('a.js', "const f = new Function('a', 'return a + 1');"), []);
  assert.ok(ids('a.js', 'el.innerHTML = userHtml;').includes('xss'));
});

test('documentation text inside <pre> is not scanned as code', () => {
  const doc = '<pre>\nconst x = eval(req.body.a);\nsecret: "s3Cur3Pass"\n</pre>';
  assert.deepEqual(ids('tutorial.html', doc), []);
});

test('big projects: server code is scanned before data, assets and browser code', () => {
  const paths = ['data/static/users.yml', 'frontend/src/a.ts', 'misc/x.js', 'routes/login.ts', 'lib/auth.ts'];
  const order = paths.map((path) => ({ path })).sort(byPriority).map((p) => p.path);
  assert.deepEqual(order.slice(0, 2).sort(), ['lib/auth.ts', 'routes/login.ts']);
  assert.equal(order.at(-1), 'data/static/users.yml');
});

test('request data in a response, redirect, file path and fetch helper (JavaScript)', () => {
  assert.ok(ids('a.js', `const name = req.query.name || 'guest';\nres.send('<h1>' + name + '</h1>');`).includes('xss-js-response'));
  assert.ok(!ids('a.js', `const name = req.query.name;\nres.send('<h1>' + escapeHtml(name) + '</h1>');`).includes('xss-js-response'));
  assert.ok(!ids('a.js', `res.send('<h1>Hello</h1>');`).includes('xss-js-response'));

  assert.ok(ids('a.js', `const next = req.query.to;\nres.redirect(next);`).includes('open-redirect-var'));
  assert.ok(ids('a.js', `res.location(req.query.to).sendStatus(302);`).includes('open-redirect-var'));
  // checked before use: no finding
  assert.ok(!ids('a.js', `const next = req.query.to;\nif (!next.startsWith('/')) return;\nres.redirect(next);`).includes('open-redirect-var'));
  assert.ok(!ids('a.js', `const next = '/home';\nres.redirect(next);`).includes('open-redirect-var'));

  assert.ok(ids('a.js', `const f = req.query.file;\nfs.readFileSync('/srv/img/' + f);`).includes('path-traversal-var'));
  assert.ok(!ids('a.js', `const f = 'logo.png';\nfs.readFileSync('/srv/img/' + f);`).includes('path-traversal-var'));

  assert.ok(ids('a.js', `await proxyFetch(req.body.url);`).includes('ssrf-helper'));
});

test('prototype pollution: key copying without a guard, not when "__proto__" is handled in code', () => {
  const bad = `function m(t, s) {\n  for (const k of Object.keys(s)) {\n    t[k] = s[k];\n  }\n}`;
  assert.ok(ids('a.js', bad).includes('prototype-pollution'));
  assert.ok(!ids('a.js', `${bad}\nconst BLOCK = ['__proto__'];`).includes('prototype-pollution'));
  // a comment that merely mentions __proto__ is not a guard
  assert.ok(ids('a.js', `${bad}\n// "__proto__" key not blocked`).includes('prototype-pollution'));
  assert.ok(ids('a.js', `_.merge(cfg, req.body);`).includes('prototype-pollution'));
});

test('minified or bundled files are skipped by the loader', async () => {
  const { loadSources } = await import('../src/services/scanner/agent/fileLoader.js');
  const minified = Buffer.from('var a=1;'.repeat(2000) + '\n' + 'eval(x);'.repeat(1000));
  const normal = Buffer.from('const x = 1;\n'.repeat(500));
  const files = [{ originalName: 'lib.js', key: 'm' }, { originalName: 'app.js', key: 'n' }];
  const { sources } = await loadSources({ files, readFile: async (k) => (k === 'm' ? minified : normal) });
  assert.deepEqual(sources.map((s) => s.path), ['app.js']);
});
