// Suggested code fixes. These are safe EXAMPLE patterns for each kind of finding, written for the language of the file.
// They are a starting point to adapt, not a patch that can be applied blindly. Plain JavaScript, no dependencies,
// so the report page and the PDF both use it.

const langOf = (file = "") => {
  const ext = file.split(".").pop().toLowerCase();
  if (["js", "jsx", "mjs", "cjs", "ts", "tsx", "vue", "svelte"].includes(ext))
    return "js";
  if (ext === "py") return "py";
  if (ext === "php") return "php";
  return "other";
};

// Each entry: test (on title, category or cwe) -> per-language { bad, good } plus a short note.
const FIXES = [
  {
    test: /Workflow runs untrusted pull request code|Workflow script built from untrusted/i,
    note: "Treat anything an outsider can type (titles, branch names, pull request code) as data, never as part of a script.",
    any: {
      bad: '- run: echo "${{ github.event.issue.title }}"\n\n# or, with pull_request_target:\n- uses: actions/checkout@v4\n  with:\n    ref: ${{ github.event.pull_request.head.sha }}',
      good: '- run: echo "$TITLE"\n  env:\n    TITLE: ${{ github.event.issue.title }}\n\n# use the plain pull_request trigger for code from forks',
    },
  },
  {
    test: /Workflow token has write access|Third-party action follows a moving branch/i,
    note: "Give the pipeline the least power it needs, and pin actions to a commit so they cannot change under you.",
    any: {
      bad: "permissions: write-all\n...\n- uses: some-org/some-action@main",
      good: "permissions:\n  contents: read\n...\n- uses: some-org/some-action@0123456789abcdef0123456789abcdef01234567  # v1.2.3",
    },
  },
  {
    test: /Script downloaded from the internet|Files made writable by everyone|Dockerfile downloads a file with ADD/i,
    note: "Download, check the checksum, then run. Give files only the access they need.",
    any: {
      bad: "RUN curl -sSL https://example.com/install.sh | sh\nRUN chmod -R 777 /app",
      good: 'RUN curl -fsSLo /tmp/install.sh https://example.com/install.sh \\\n && echo "<sha256>  /tmp/install.sh" | sha256sum -c - \\\n && sh /tmp/install.sh\nRUN chmod -R 755 /app',
    },
  },
  {
    test: /Container runs as root|Kubernetes container allowed to run as root/i,
    note: "Run the app as a normal user so a break-in does not start with full control.",
    any: {
      bad: 'FROM node:20-alpine\nCOPY . .\nCMD ["node", "server.js"]',
      good: 'FROM node:20-alpine\nCOPY . .\nRUN adduser -D app\nUSER app\nCMD ["node", "server.js"]\n\n# Kubernetes\nsecurityContext:\n  runAsNonRoot: true\n  allowPrivilegeEscalation: false',
    },
  },
  {
    test: /Base image has no fixed version|Kubernetes image has no fixed version/i,
    note: "Pin a version (or digest) so the same code gets built and run every time.",
    any: {
      bad: "FROM node\nimage: myapp:latest",
      good: "FROM node:20.11-alpine\nimage: myapp:1.4.2",
    },
  },
  {
    test: /Secret baked into the Docker image|\.env file copied into the Docker image|Password or key written in Terraform|Password or token written into a Kubernetes/i,
    note: "Rotate the secret first. Then keep it out of files and pass it in when the app starts.",
    any: {
      bad: 'ENV DB_PASSWORD=hunter2hunter2\nCOPY .env /app/.env\n\npassword = "hunter2hunter2"      # Terraform',
      good: '# set at run time, not in the image\ndocker run -e DB_PASSWORD="$DB_PASSWORD" myapp\n\n# .dockerignore\n.env\n\nvariable "db_password" {\n  type      = string\n  sensitive = true\n}',
    },
  },
  {
    test: /Firewall rule open to the whole internet|Database reachable from the internet/i,
    note: "Open only what must be public, and keep databases inside the private network.",
    any: {
      bad: 'ingress {\n  from_port   = 22\n  to_port     = 22\n  cidr_blocks = ["0.0.0.0/0"]\n}\npublicly_accessible = true',
      good: 'ingress {\n  from_port   = 22\n  to_port     = 22\n  cidr_blocks = ["203.0.113.10/32"]   # your own address\n}\npublicly_accessible = false',
    },
  },
  {
    test: /Storage bucket is public|Storage encryption turned off|Permission policy allows every action/i,
    note: "Private and encrypted by default, with the smallest set of permissions.",
    any: {
      bad: 'acl = "public-read"\nencrypted = false\nactions = ["*"]',
      good: 'acl = "private"\nencrypted = true\nactions = ["s3:GetObject"]',
    },
  },
  {
    test: /Kubernetes container runs privileged|Kubernetes pod shares the host|Pod mounts the Docker socket/i,
    note: "Keep containers away from the machine they run on.",
    any: {
      bad: "securityContext:\n  privileged: true\nhostNetwork: true\nvolumes:\n  - hostPath:\n      path: /var/run/docker.sock",
      good: 'securityContext:\n  privileged: false\n  allowPrivilegeEscalation: false\n  capabilities:\n    drop: ["ALL"]',
    },
  },
  {
    test: /\.env file|Secret stored in a \.env/i,
    note: "Never upload or commit .env files. Rotate every value that was inside it.",
    any: {
      bad: "DATABASE_URL=mongodb+srv://user:realpassword@cluster...   # committed to the project",
      good: "# .gitignore\n.env\n.env.*\n!.env.example\n\n# .env.example (safe to commit, no real values)\nDATABASE_URL=put-your-connection-string-here",
    },
  },
  {
    test: /key in source|token in source|Private key|Hardcoded credential|Hardcoded fallback|Hardcoded cryptographic key/i,
    note: "Rotate the exposed secret first. Then load it from the environment and fail loudly if it is missing.",
    js: {
      bad: "const secret = process.env.JWT_SECRET || 'dev-secret';",
      good: "const secret = process.env.JWT_SECRET;\nif (!secret || secret.length < 32) {\n  throw new Error('JWT_SECRET must be set (32+ characters)');\n}",
    },
    py: {
      bad: "SECRET = os.environ.get('SECRET', 'dev-secret')",
      good: "SECRET = os.environ['SECRET']  # raises KeyError if it is not set",
    },
    php: {
      bad: "$key = 'sk_live_abc123';",
      good: "$key = getenv('PAYMENT_SECRET_KEY');\nif (!$key) { throw new RuntimeException('PAYMENT_SECRET_KEY is not set'); }",
    },
    any: {
      bad: 'API_KEY = "abc123..."',
      good: 'API_KEY = read_from_environment("API_KEY")',
    },
  },
  {
    test: /SQL injection/i,
    note: "Pass user input as parameters. Never join it into the query text.",
    js: {
      bad: "db.query(`SELECT * FROM users WHERE email = '${email}'`);",
      good: "db.query('SELECT * FROM users WHERE email = $1', [email]);   // or ? placeholders for MySQL",
    },
    py: {
      bad: "cursor.execute(f\"SELECT * FROM users WHERE email = '{email}'\")",
      good: 'cursor.execute("SELECT * FROM users WHERE email = %s", (email,))',
    },
    php: {
      bad: "$db->query(\"SELECT * FROM users WHERE email = '$email'\");",
      good: '$stmt = $db->prepare("SELECT * FROM users WHERE email = ?");\n$stmt->execute([$email]);',
    },
  },
  {
    test: /Dynamic code execution/i,
    note: "Avoid running text as code. Use a lookup table of allowed actions, or JSON.parse for data.",
    js: {
      bad: "const result = eval(userInput);",
      good: "const actions = { add: (a, b) => a + b, sub: (a, b) => a - b };\nconst fn = actions[name];\nif (!fn) throw new Error('Unknown action');\nconst result = fn(a, b);   // data? use JSON.parse(text)",
    },
    py: {
      bad: "exec(user_code)",
      good: 'ACTIONS = {"add": add, "sub": sub}\nfn = ACTIONS.get(name)\nif fn is None:\n    raise ValueError("Unknown action")\nresult = fn(a, b)   # data? use json.loads(text) or ast.literal_eval(text)',
    },
  },
  {
    test: /command injection/i,
    note: "Do not build shell text from input. Pass the program and its arguments separately, without a shell.",
    js: {
      bad: "exec(`convert ${file} out.png`);",
      good: "import { execFile } from 'node:child_process';\nexecFile('convert', [file, 'out.png'], (err, stdout) => { /* ... */ });\n// also check that `file` is one of the files you expect",
    },
    py: {
      bad: 'os.system("convert " + filename + " out.png")',
      good: 'subprocess.run(["convert", filename, "out.png"], check=True)   # no shell=True',
    },
    php: {
      bad: 'system("convert " . $_GET["f"]);',
      good: '$f = escapeshellarg($file);   // better: avoid the shell, use a PHP library\nexec("convert $f out.png");',
    },
  },
  {
    test: /deserialization|YAML/i,
    note: "Only load data formats that cannot run code.",
    py: {
      bad: "data = pickle.loads(blob)   # or yaml.load(text)",
      good: "data = json.loads(text)\n# YAML: data = yaml.safe_load(text)",
    },
    php: {
      bad: "$data = unserialize($input);",
      good: "$data = json_decode($input, true);",
    },
    any: {
      bad: "obj = deserialize(untrusted_bytes)",
      good: "data = parse_json(untrusted_text)   # plain data only",
    },
  },
  {
    test: /Weak hash/i,
    note: "MD5 and SHA-1 are broken. Use a password hasher for passwords and SHA-256 or better for everything else.",
    js: {
      bad: "crypto.createHash('md5').update(password).digest('hex');",
      good: "import bcrypt from 'bcryptjs';\nconst hash = await bcrypt.hash(password, 12);     // passwords\n// other data: crypto.createHash('sha256').update(data).digest('hex')",
    },
    py: {
      bad: "hashlib.md5(password.encode()).hexdigest()",
      good: "import bcrypt\nhash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(12))   # passwords\n# other data: hashlib.sha256(data).hexdigest()",
    },
    php: {
      bad: "md5($password)",
      good: "$hash = password_hash($password, PASSWORD_DEFAULT);\n// check with password_verify($password, $hash)",
    },
  },
  {
    test: /Predictable random/i,
    note: "Use the cryptographic random generator for tokens, codes and passwords.",
    js: {
      bad: "const token = Math.random().toString(36).slice(2);",
      good: "import { randomBytes } from 'node:crypto';\nconst token = randomBytes(32).toString('hex');",
    },
    py: {
      bad: "token = str(random.randint(0, 999999))",
      good: "import secrets\ntoken = secrets.token_urlsafe(32)",
    },
    php: {
      bad: "$token = rand();",
      good: "$token = bin2hex(random_bytes(32));",
    },
  },
  {
    test: /TLS certificate/i,
    note: "Keep certificate checks on. If you use a private certificate, trust that certificate instead.",
    js: {
      bad: "process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';\n// or: new https.Agent({ rejectUnauthorized: false })",
      good: "// remove both lines. For a private CA:\n// new https.Agent({ ca: fs.readFileSync('my-ca.pem') })",
    },
    py: {
      bad: "requests.get(url, verify=False)",
      good: 'requests.get(url)   # private CA: verify="/path/to/my-ca.pem"',
    },
  },
  {
    test: /CORS/i,
    note: "Allow only your own site addresses.",
    js: {
      bad: "app.use(cors({ origin: '*', credentials: true }));",
      good: "const allowed = ['https://your-app.vercel.app'];\napp.use(cors({ origin: allowed, credentials: true }));",
    },
    any: {
      bad: "Access-Control-Allow-Origin: *",
      good: "Access-Control-Allow-Origin: https://your-app.vercel.app",
    },
  },
  {
    test: /JWT "none"/i,
    note: "Always name the algorithms you accept.",
    js: {
      bad: 'jwt.verify(token, secret, { algorithms: ["none", "HS256"] });',
      good: "jwt.verify(token, secret, { algorithms: ['HS256'] });",
    },
    py: {
      bad: 'jwt.decode(token, options={"verify_signature": False})',
      good: 'jwt.decode(token, SECRET, algorithms=["HS256"])',
    },
  },
  {
    test: /cross-site scripting|XSS/i,
    note: "Show user text as text. Only insert HTML you have cleaned.",
    js: {
      bad: "el.innerHTML = comment;\n// React: <div dangerouslySetInnerHTML={{ __html: comment }} />",
      good: "el.textContent = comment;\n// React: <div>{comment}</div>\n// HTML really needed? import DOMPurify from 'dompurify'; el.innerHTML = DOMPurify.sanitize(comment);",
    },
    py: {
      bad: 'return "<p>" + name + "</p>"',
      good: 'from markupsafe import escape\nreturn "<p>" + str(escape(name)) + "</p>"',
    },
    php: {
      bad: 'echo $_GET["name"];',
      good: 'echo htmlspecialchars($_GET["name"], ENT_QUOTES, "UTF-8");',
    },
  },
  {
    test: /path traversal|file inclusion/i,
    note: "Resolve the final path and confirm it is still inside the folder you meant to allow.",
    js: {
      bad: "res.sendFile(path.join(UPLOAD_DIR, req.query.name));",
      good: "const target = path.resolve(UPLOAD_DIR, req.query.name);\nif (!target.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) {\n  return res.status(400).send('Bad file name');\n}\nres.sendFile(target);",
    },
    py: {
      bad: 'open(os.path.join(BASE, request.args["name"]))',
      good: 'target = os.path.realpath(os.path.join(BASE, request.args["name"]))\nif not target.startswith(os.path.realpath(BASE) + os.sep):\n    abort(400)\nopen(target)',
    },
    php: {
      bad: 'include $_GET["page"] . ".php";',
      good: '$pages = ["home", "about", "contact"];\n$page = in_array($_GET["page"], $pages, true) ? $_GET["page"] : "home";\ninclude __DIR__ . "/pages/$page.php";',
    },
  },
  {
    test: /Open redirect/i,
    note: "Only redirect to addresses you allow, or to paths on your own site.",
    js: {
      bad: "res.redirect(req.query.next);",
      good: "const next = String(req.query.next || '/');\nconst safe = next.startsWith('/') && !next.startsWith('//');\nres.redirect(safe ? next : '/');",
    },
    py: {
      bad: 'return redirect(request.args["next"])',
      good: 'nxt = request.args.get("next", "/")\nreturn redirect(nxt if nxt.startswith("/") and not nxt.startswith("//") else "/")',
    },
  },
  {
    test: /server-side request forgery/i,
    note: "Only fetch addresses on an allow-list, and never addresses on your private network.",
    js: {
      bad: "const r = await fetch(req.body.url);",
      good: "const url = new URL(req.body.url);\nconst ALLOWED = new Set(['api.example.com']);\nif (url.protocol !== 'https:' || !ALLOWED.has(url.hostname)) {\n  return res.status(400).json({ message: 'Address not allowed' });\n}\nconst r = await fetch(url, { redirect: 'error' });",
    },
    py: {
      bad: 'requests.get(request.json["url"])',
      good: 'u = urlparse(request.json["url"])\nif u.scheme != "https" or u.hostname not in {"api.example.com"}:\n    abort(400)\nrequests.get(u.geturl(), allow_redirects=False, timeout=10)',
    },
  },
  {
    test: /NoSQL injection/i,
    note: "Make sure input is a plain string or number before it goes into a query.",
    js: {
      bad: "User.findOne({ email: req.body.email, password: req.body.password });",
      good: "const email = String(req.body.email || '');\nconst user = await User.findOne({ email });   // then compare the password hash yourself",
    },
  },
  {
    test: /mass assignment/i,
    note: "Copy only the fields people are allowed to set.",
    js: {
      bad: "const user = await User.create(req.body);",
      good: "const { name, email, password } = req.body;\nconst user = await User.create({ name, email, password });   // never role, isAdmin, ...",
    },
    py: {
      bad: "User(**request.json)",
      good: 'data = request.json\nUser(name=data["name"], email=data["email"])',
    },
  },
  {
    test: /Debug mode/i,
    note: "Switch debug off in production, using an environment value.",
    py: {
      bad: "app.run(debug=True)",
      good: 'app.run(debug=os.environ.get("FLASK_DEBUG") == "1")   # off unless you turn it on',
    },
    js: {
      bad: "DEBUG = true",
      good: "const DEBUG = process.env.NODE_ENV !== 'production';",
    },
    any: {
      bad: "DEBUG = True",
      good: "DEBUG = False   # in production settings",
    },
  },
  {
    test: /Stack trace/i,
    note: "Log the details on the server and send the person a short message.",
    js: {
      bad: "res.status(500).json({ error: err.stack });",
      good: "console.error(err);   // full detail stays in your logs\nres.status(500).json({ message: 'Something went wrong' });",
    },
    py: {
      bad: "return traceback.format_exc(), 500",
      good: 'app.logger.exception("request failed")\nreturn {"message": "Something went wrong"}, 500',
    },
  },
  {
    test: /Cookie security flag|Cookie set without/i,
    note: "Turn the protective cookie flags on.",
    js: {
      bad: "res.cookie('token', t, { httpOnly: false, secure: false });",
      good: "res.cookie('token', t, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 });",
    },
    py: {
      bad: 'resp.set_cookie("token", t)',
      good: 'resp.set_cookie("token", t, httponly=True, secure=True, samesite="Lax")',
    },
    php: {
      bad: 'setcookie("token", $t);',
      good: 'setcookie("token", $t, ["httponly" => true, "secure" => true, "samesite" => "Lax"]);',
    },
  },
  {
    test: /Uploaded file saved/i,
    note: "Check what the file really is, choose the file name yourself, and keep uploads out of folders the web server runs.",
    js: {
      bad: "app.post('/upload', upload.single('f'), (req, res) => { /* saved with the name the user chose */ });",
      good: "const ALLOWED = new Set(['image/png', 'image/jpeg']);\nif (!ALLOWED.has(req.file.mimetype) || req.file.size > 2_000_000) return res.sendStatus(400);\nconst name = crypto.randomUUID() + '.png';   // your own name, never the user's\n// store outside the public folder",
    },
    php: {
      bad: 'move_uploaded_file($_FILES["f"]["tmp_name"], "uploads/" . $_FILES["f"]["name"]);',
      good: '$info = getimagesize($_FILES["f"]["tmp_name"]);\nif ($info === false || !in_array($info["mime"], ["image/png", "image/jpeg"], true)) { http_response_code(400); exit; }\n$name = bin2hex(random_bytes(16)) . ".png";   // your own name\nmove_uploaded_file($_FILES["f"]["tmp_name"], "/var/uploads/" . $name);   // outside the web root',
    },
    any: {
      bad: "save(upload, upload.filename)",
      good: "check the real type and size, generate your own file name, store outside the web root",
    },
  },
  {
    test: /ReDoS|can hang the server/i,
    note: "Avoid a repeat inside a repeat, and limit how much text you test.",
    js: {
      bad: 'const re = /([0-9]+)+#/;   // "1111111111111111x" can take minutes',
      good: "const re = /^[0-9]+#/;\nif (input.length > 64 || !re.test(input)) throw new Error('Invalid value');",
    },
    any: {
      bad: "(a+)+",
      good: "a+   # one repeat only, and cap the input length first",
    },
  },
  {
    test: /Directory listing/i,
    note: "Serve only the files that are meant to be public.",
    js: {
      bad: "app.use('/files', serveIndex('files'), express.static('files'));",
      good: "app.use('/files', express.static('public-files', { index: false }));   // only a folder that is safe to share",
    },
    any: { bad: "Options +Indexes", good: "Options -Indexes" },
  },
  {
    test: /XML external entities/i,
    note: "Turn entity loading off and refuse documents that declare their own entities.",
    js: {
      bad: "libxmljs.parseXmlString(xml, { noent: true });",
      good: "libxmljs.parseXmlString(xml, { noent: false, nonet: true });   // no entity expansion, no network",
    },
    py: {
      bad: "parser = etree.XMLParser(resolve_entities=True)",
      good: "parser = etree.XMLParser(resolve_entities=False, no_network=True)",
    },
    any: {
      bad: "parser.setFeature(external-general-entities, true)",
      good: "parser.setFeature(external-general-entities, false)",
    },
  },
  {
    test: /JWT signature not checked/i,
    note: "Always check the signature, with the algorithm fixed by you, not by the token.",
    py: {
      bad: "claims = jwt.decode(token, verify=False)",
      good: 'claims = jwt.decode(token, SECRET, algorithms=["HS256"])   # raises if the signature is wrong',
    },
    any: {
      bad: "decode(token, verify=false)",
      good: 'verify(token, secret, { algorithms: ["HS256"] })',
    },
  },
  {
    test: /template injection/i,
    note: "Keep the template text fixed and pass user values in as variables.",
    py: {
      bad: 'return render_template_string("<h3>%s</h3>" % request.url)',
      good: 'return render_template("error.html", url=request.url)   # the template file escapes {{ url }}',
    },
    any: {
      bad: "render(template_text_built_from_input)",
      good: 'render("fixed-template", { value: input })',
    },
  },
  {
    test: /prototype pollution/i,
    note: "Never copy the keys __proto__, constructor or prototype from outside data.",
    js: {
      bad: 'for (const k of Object.keys(src)) target[k] = src[k];   // src may contain "__proto__"',
      good: "const BLOCKED = new Set(['__proto__', 'constructor', 'prototype']);\nfor (const k of Object.keys(src)) {\n  if (BLOCKED.has(k)) continue;\n  target[k] = src[k];\n}",
    },
    any: {
      bad: "merge(target, untrusted)",
      good: 'merge(target, pick(untrusted, ["name", "email"]))   # copy only fields you expect',
    },
  },
  {
    test: /localStorage/i,
    note: "Scripts can read localStorage, so a single XSS bug leaks the token. An httpOnly cookie set by the server cannot be read by scripts.",
    js: {
      bad: "localStorage.setItem('token', token);",
      good: "// server: res.cookie('token', t, { httpOnly: true, secure: true, sameSite: 'lax' })\n// browser: fetch(url, { credentials: 'include' })",
    },
  },
];

function pick(entry, lang) {
  return entry[lang] || entry.any || entry.js || entry.py || entry.php || null;
}

/** Returns { language, bad, good, note } for a finding, or null when there is no ready-made example. */
export function suggestFix(finding) {
  if (!finding) return null;
  const lang = langOf(finding.file);

  if (
    finding.source === "osv" ||
    finding.category === "Vulnerable Dependency"
  ) {
    const m = /Upgrade\s+(\S+)\s+to\s+(\S+?)\s+or later/i.exec(
      finding.recommendation || "",
    );
    const pkgName =
      /^([^@\s]+(?:\/[^@\s]+)?)@/.exec(finding.title || "")?.[1] || m?.[1];
    if (!m || !pkgName) return null;
    return {
      language: "shell",
      bad: null,
      good: `npm install ${pkgName}@${m[2].replace(/[.,;]$/, "")}\nnpm audit\nnpm test`,
      note: "Upgrade, then run your tests. If other packages block it, run npm ls to see which one needs the old version.",
    };
  }

  const haystack = `${finding.title || ""} ${finding.category || ""}`;
  const entry = FIXES.find((f) => f.test.test(haystack));
  if (!entry) return null;
  const chosen = pick(entry, lang);
  if (!chosen) return null;
  return {
    language: lang === "other" ? "" : lang,
    bad: chosen.bad,
    good: chosen.good,
    note: entry.note,
  };
}
