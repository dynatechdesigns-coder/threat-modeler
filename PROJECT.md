# PROJECT.md: read this first

Threat Modeler is a security scanner: upload code or a GitHub repo, get a ranked list of problems with plain-language
fixes. Built by Daniel (Dynatech Labs, Abuja). Daniel is a graphic designer and web developer learning cybersecurity and
is a beginner with terminals. Explain things simply, give exact steps, and never assume he knows a command.

## Live
- App (Vercel): https://dynatech-threatmodeler.vercel.app
- API (Render, free plan, sleeps when idle): https://threat-modeler-bz87.onrender.com (health: /api/health, pinged by UptimeRobot)
- Database MongoDB Atlas. Files Cloudflare R2. Email Brevo. Payments Paystack.
- Repo owner on GitHub: dynatechdesigns-coder. Local copy: C:\Users\user\Documents\threat-modeler-complete\threat-modeler

## Stack
React 18, Vite, Tailwind, Framer Motion, RTK Query on the client. Node, Express, Mongoose on the server. Plain JavaScript
(no TypeScript). See README.md "Structure" for the map.

## Rules this project follows (please keep them)
1. **Always give the git commands with every code update**: `git add -A`, `git status`, `git commit -m "..."`, `git push`
   (Windows PowerShell, `cd` to the folder above first). Tell him to stop if `.env` shows up in `git status`.
2. **Never ask for or paste secrets** (API keys, tokens, Paystack secret key, database strings) in chat. They go only into
   Render or Vercel environment settings. If one leaks, tell him to rotate it.
3. **Be honest in claims.** Say what was tested and what was not. Current honest limits: the scanner caught 12 of 30 known
   bugs on apps it had never seen (51 of 55 on apps it was tuned on, so report both); the Docker/Terraform/Kubernetes/GitHub
   Actions rules were tested only on written examples; the GitHub Action and PR comments were tested against mock servers,
   not real GitHub; Paystack was tested in test mode only.
4. **Shared pure modules must be identical on server and client** (links/*, compare.js). Tests enforce it.
5. **Every scanner rule needs a suggested fix**: a rule `title:` in staticRules.js or infraRules.js needs a matching entry
   in client/src/lib/fixes.js (test: fixes.test.mjs).
6. **Plan limits live in two places that must match**: server/src/services/plans.js (enforced) and client/src/lib/pricing.js
   (displayed). Limits are enforced on the server only.
7. **Billing is OFF by default** (`BILLING_ENABLED` unset: everyone gets Team limits). Turn it on only with real Paystack
   keys. Never leave test keys on while the site is public, because the Paystack test card number is public.
8. Security habits already in place, keep them: tokens stored hashed, webhooks signature-checked over raw bytes, text from
   scans cleaned before it goes into comments, SSRF checks on anything that fetches a URL, rate limits per user.
9. When giving Claude Code prompts, say which Claude model to use for each prompt.

## How to run the tests (no database, no network needed)
```
cd server
node --test "test/*.test.mjs"
```
The client has no tests; check it builds with `npm run build` in `client` when dependencies are installed.

## Environment variables (server, set in Render)
Required in production: `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET`, `CLIENT_ORIGIN`. Common: `PUBLIC_API_URL`,
`APP_URL`, `ADMIN_EMAILS`, `BREVO_API_KEY`, `EMAIL_FROM`, an AI key (`GEMINI_API_KEY` or `ANTHROPIC_API_KEY` or
`OPENAI_API_KEY`), R2 keys. Billing: `BILLING_ENABLED`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_PLAN_PRO_MONTHLY`,
`PAYSTACK_PLAN_PRO_ANNUAL`, `PAYSTACK_PLAN_TEAM_MONTHLY`, `PAYSTACK_PLAN_TEAM_ANNUAL`. Full list with comments:
server/.env.example. Client: `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID` (optional).

## Plans (US dollars)
Free $0 (5 scans a month, 1 watched repo, no AI review). Pro $5 a month or $48 a year (50 scans, AI review, 5 repos, badge,
5 CI tokens). Team $15 a month or $144 a year (300 scans, 25 repos, 20 tokens). Paystack plans are created by hand in the
Paystack dashboard and their `PLN_` codes go into the environment. Test mode and live mode have separate plans and keys.
Open question: confirm the Zenith USD payout account really is a domiciliary account before going live.

## What is built
Scanner (rules, dependency check via OSV, optional AI review, deployment-file checks), scan again and compare, watched repos
with push scanning, README badge, share links, header checker, link checker, PDF report, admin page and waitlist alerts,
Google sign-in, email (verify, reset, alerts), API tokens, GitHub Action with pull request comments, accuracy benchmark,
Free/Pro/Team plans with Paystack checkout, cancel, webhooks, monthly scan quota.

## Not built yet (ideas, in rough order)
Test the deployment-file rules on real repos and report numbers; "set a password" for Google-only accounts; scheduled
re-scans; Slack/Discord alerts; SARIF export for GitHub's Security tab; Jira or GitHub Issues export; naira plans if dollar
cards fail for Nigerian users; a case-study write-up for the portfolio.

## Marketing
Daniel is posting a "build in public" series on X (@Dynatechdesign) and LinkedIn: one honest idea per post, a branded 16:9
image, captions that match what is actually built. Keep captions truthful.
