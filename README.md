# Threat Modeler

An agentic threat-modeling micro-SaaS that visually maps vulnerabilities and generates secure, AI-driven code patches.

Built for the Firebase #BuildHybridAI 2026 Hackathon.

## Live Links

- **Live Application:** [dynatech-threatmodeler.vercel.app](https://dynatech-threatmodeler.vercel.app)
- **1-Minute Cinematic Demo:** [Watch on YouTube](https://youtu.be/maKUyWnDgCI)
- **GitHub Repository:** [dynatechdesigns-coder/threat-modeler](https://github.com/dynatechdesigns-coder/threat-modeler)
- **Devpost Submission:** Firebase #BuildHybridAI *(TODO: paste your Devpost project URL)*

## The Problem

Standard security reports are massive, overwhelming walls of text that leave developers paralyzed. When an automated audit flags 75 vulnerabilities, security teams waste hours trying to map out which entry points actually connect to critical infrastructure, and how to safely patch them without breaking the application.

## The Solution

Threat Modeler transforms static security audits into dynamic, visual, and actionable intelligence. Instead of handing developers a 100-page PDF, we instantly map the exact blast radius of a vulnerability and generate secure, context-aware code patches on the fly.

## Key Features

- **Real-Time Analytics Dashboard:** Tracks active scans, total vulnerabilities, and critical findings, featuring a "Risk over time" graph to monitor a project's security posture across multiple audits.
- **Automated Codebase Auditing:** Users authenticate and submit a GitHub repository URL to execute a deep architectural analysis of the application's attack surface.
- **Attack Path Tracer:** A custom, interactive UI that visually maps the blast radius of vulnerabilities, tracing exactly what an attacker can compromise downstream.
- **AI-Driven Remediation ("Fix with AI"):** With a single click, the system leverages Gemini to generate a secure, context-aware code patch for the specific vulnerability, allowing developers to copy and paste production-ready fixes.
- **Compare Scans & Watched Repos:** Allows teams to continuously monitor specific repositories and compare audit results over time to catch regressions.
- **DevSecOps Tooling:** Includes a built-in Link Checker, Security Headers analyzer, and a Code Vault for managing patched snippets.
- **CI & API Token Management:** Secure credential management for seamless integration into existing CI/CD deployment pipelines.

## Architecture & Tech Stack

### Frontend (Client)

- React.js with Tailwind CSS for a responsive, mobile-first UI.
- RTK Query for efficient state management and data fetching.
- Vercel for lightning-fast global hosting.

### Backend (Server)

- Node.js & Express.js providing a robust REST API.
- MongoDB Atlas for secure, scalable cloud database storage.
- In-Process Asynchronous Scanning managed via Node.js async/await execution pipelines to analyze codebase structures smoothly without external queue overhead.

### Firebase AI Logic & Security (Hackathon Core)

This application heavily leverages Firebase to deliver secure, hybrid AI inference at runtime:

- **Firebase AI Logic (Vertex AI SDK):** Powers the core "Fix with AI" generative remediation engine, feeding vulnerable code snippets to the Gemini models to return structured code patches.
- **Firebase App Check & reCAPTCHA Enterprise:** Exposing generative models to the client creates a massive vector for quota drain and bot abuse. We secured our Firebase AI Logic endpoints with App Check (Fraud Defense). This guarantees that every AI generation request is securely authenticated and originates only from our verified Vercel frontend, establishing a zero-trust architecture.

## Local Setup & Installation

To run this project locally for testing or judging purposes, follow these steps:

### 1. Clone the Repository

```bash
git clone https://github.com/dynatechdesigns-coder/threat-modeler.git
cd threat-modeler
```

### 2. Install Dependencies

You will need to install the dependencies for both the client and the server.

```bash
# Install Server dependencies
cd server
npm install

# Install Client dependencies
cd ../client
npm install
```

### 3. Environment Variables

Create a `.env` file in both the server and client directories. You will need to add your own MongoDB URI and Firebase configuration keys for local testing.

Server `.env` example:

```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
```

Client `.env` example:

```env
VITE_API_URL=http://localhost:5000/api
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
VITE_FIREBASE_PROJECT_ID=your_firebase_project_id
VITE_RECAPTCHA_SITE_KEY=your_recaptcha_enterprise_key
```

### 4. Run the Application

Start both the development server and the React client.

```bash
# In the server directory
npm run dev

# In a new terminal, in the client directory
npm run dev
```

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

---

## Scanner Accuracy Benchmark

How well do the scanner's built-in rules find bugs that are *already known*? This folder measures that.

### Run it

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

### How it is scored

- `truth.json` lists known bugs: the file and a pattern for the vulnerable line. The script fails loudly if a pattern is not found in the code, so the list cannot drift from the real code.
- A bug counts as **caught** only if a finding of the right *kind* sits within 2 lines of it. A wrong-kind finding next to the bug does not count.
- `triage.json` holds my hand-labels for findings that are not on the known list: **real** (a true problem), **risky** (a risky pattern, not clearly exploitable as written) or **noise** (wrong). Anything not listed counts as real. These labels are my own judgment.

### Results

| Stage | Result |
|---|---|
| Original rules | 11 of 37 known bugs on NodeGoat, DVWA and Juice Shop. This already includes the file-order fix below; before it, Juice Shop's server code was not scanned at all |
| After tuning on those three apps | 33 of 37 (89%). These apps were used to tune, so this number is optimistic |
| **First try on DVNA, never seen** | **3 of 9** |
| **First try on Vulnerable-Flask-App, never seen** | **4 of 9** |
| **First try on Vulnerable-Node's seed files, never seen** | **5 of 12**, 0 false alarms on the 2 clean decoys |
| After fixing what those three exposed | 51 of 55 on the five apps (93%), 11 of 12 on the seeds, 4% noise |

The honest summary: **on code the rules had never seen, the first pass found about 4 in 10 known bugs (12 of 30).** Each round of fixes closed the gap for the kinds of bug it exposed, but the last round of numbers is no longer a fair test for those apps. The fair test is always the *next* app.

### What changed because of this

1. **Big projects were cut off in alphabetical order.** Juice Shop hit the 400-file limit on front-end and sample-data folders and never reached `routes/` or `lib/`. Files are now scanned in priority order: server code, then everything else, then browser code, then sample data and assets.
2. **Bundled and minified files** (vendor libraries) are skipped. They produced 7 false alarms on Vulnerable-Flask-App.
3. **A light "did this come from the request?" check.** A variable is marked when it is assigned from request data and unmarked when it is overwritten, cleaned (`intval`, `htmlspecialchars`, ...) or checked (`startsWith`, an allow-list). Rules for SQL in PHP, XSS, SSRF, redirects and file paths use it, so they stay quiet about values that never touch user input.
4. **New rules**: PHP SQL injection, XSS, file inclusion, uploads and redirects; MongoDB `$where`; SSRF through a variable or helper; ReDoS; cookies without flags; hardcoded signing keys; directory listing; Angular sanitizer bypass; XXE; unsafe deserialization in Node; weak hashes used for tokens; JWT signature skipped; template injection; unescaped EJS/Handlebars output; prototype pollution.
5. **False alarms removed**: fixed-text `innerHTML`, `eval("fixed")`, example code inside documentation `<pre>` blocks, translation keys that looked like passwords, PHP variable names that looked like secrets.

### What it still misses (and why)

The 4 misses are all bugs you only see by understanding the logic across several lines or files:

- CSRF: no token on a state-changing request (DVWA)
- Stored XSS where the unsafe output is in a different file than the save (DVWA)
- A redirect allow-list that can be bypassed, and a missing ownership check (Juice Shop)
- MongoDB queries built from a function parameter that came from the request in another file (Vulnerable-Node)

These are what the optional AI review layer is for. This benchmark does **not** measure the AI layer, and it does not measure the dependency check (OSV), which needs internet.

### Known limits of the benchmark

- Six apps, 64 known bugs. Small. A different set of apps will give a different number.
- I wrote the known-bug list and the triage labels myself, and tuned the rules while looking at the first three apps.
- Vulnerable teaching apps are denser in bugs than real projects. On real code the rules will find less, and the share of noise matters more than the catch rate.
