# Accuracy benchmark

How well do the scanner's built-in rules find bugs that are *already known*? This folder measures that.

## Run it

```bash
mkdir bench-apps && cd bench-apps
git clone --depth 1 https://github.com/OWASP/NodeGoat
git clone --depth 1 https://github.com/juice-shop/juice-shop
git clone --depth 1 https://github.com/digininja/DVWA
git clone --depth 1 https://github.com/appsecco/dvna
git clone --depth 1 https://github.com/we45/Vulnerable-Flask-App vflask
git clone --depth 1 https://github.com/cr0hn/vulnerable-node vnode
cd ../server
BENCH_DIR=../bench-apps node bench/score.mjs -v     # five apps, with every extra finding listed
BENCH_DIR=../bench-apps node bench/seeds.mjs        # Vulnerable-Node's own labelled files
```

Only the rules run (no AI, no internet), so the result is the same every time.

## How it is scored

- `truth.json` lists known bugs: the file and a pattern for the vulnerable line. The script fails loudly if a pattern is not found in the code, so the list cannot drift from the real code.
- A bug counts as **caught** only if a finding of the right *kind* sits within 2 lines of it. A wrong-kind finding next to the bug does not count.
- `triage.json` holds my hand-labels for findings that are not on the known list: **real** (a true problem), **risky** (a risky pattern, not clearly exploitable as written) or **noise** (wrong). Anything not listed counts as real. These labels are my own judgment.

## Results

| Stage | Result |
|---|---|
| Original rules | 11 of 37 known bugs on NodeGoat, DVWA and Juice Shop. This already includes the file-order fix below; before it, Juice Shop's server code was not scanned at all |
| After tuning on those three apps | 33 of 37 (89%). These apps were used to tune, so this number is optimistic |
| **First try on DVNA, never seen** | **3 of 9** |
| **First try on Vulnerable-Flask-App, never seen** | **4 of 9** |
| **First try on Vulnerable-Node's seed files, never seen** | **5 of 12**, 0 false alarms on the 2 clean decoys |
| After fixing what those three exposed | 51 of 55 on the five apps (93%), 11 of 12 on the seeds, 4% noise |

The honest summary: **on code the rules had never seen, the first pass found about 4 in 10 known bugs (12 of 30).** Each round of fixes closed the gap for the kinds of bug it exposed, but the last round of numbers is no longer a fair test for those apps. The fair test is always the *next* app.

## What changed because of this

1. **Big projects were cut off in alphabetical order.** Juice Shop hit the 400-file limit on front-end and sample-data folders and never reached `routes/` or `lib/`. Files are now scanned in priority order: server code, then everything else, then browser code, then sample data and assets.
2. **Bundled and minified files** (vendor libraries) are skipped. They produced 7 false alarms on Vulnerable-Flask-App.
3. **A light "did this come from the request?" check.** A variable is marked when it is assigned from request data and unmarked when it is overwritten, cleaned (`intval`, `htmlspecialchars`, ...) or checked (`startsWith`, an allow-list). Rules for SQL in PHP, XSS, SSRF, redirects and file paths use it, so they stay quiet about values that never touch user input.
4. **New rules**: PHP SQL injection, XSS, file inclusion, uploads and redirects; MongoDB `$where`; SSRF through a variable or helper; ReDoS; cookies without flags; hardcoded signing keys; directory listing; Angular sanitizer bypass; XXE; unsafe deserialization in Node; weak hashes used for tokens; JWT signature skipped; template injection; unescaped EJS/Handlebars output; prototype pollution.
5. **False alarms removed**: fixed-text `innerHTML`, `eval("fixed")`, example code inside documentation `<pre>` blocks, translation keys that looked like passwords, PHP variable names that looked like secrets.

## What it still misses (and why)

The 4 misses are all bugs you only see by understanding the logic across several lines or files:

- CSRF: no token on a state-changing request (DVWA)
- Stored XSS where the unsafe output is in a different file than the save (DVWA)
- A redirect allow-list that can be bypassed, and a missing ownership check (Juice Shop)
- MongoDB queries built from a function parameter that came from the request in another file (Vulnerable-Node)

These are what the optional AI review layer is for. This benchmark does **not** measure the AI layer, and it does not measure the dependency check (OSV), which needs internet.

## Known limits of the benchmark

- Six apps, 64 known bugs. Small. A different set of apps will give a different number.
- I wrote the known-bug list and the triage labels myself, and tuned the rules while looking at the first three apps.
- Vulnerable teaching apps are denser in bugs than real projects. On real code the rules will find less, and the share of noise matters more than the catch rate.
