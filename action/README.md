# Threat Modeler GitHub Action

Scans your project on every push and pull request. The build fails when a change adds a **new** critical or high
problem, compared with your main branch. Problems that were already there do not block anyone.

## Set up (5 minutes)

1. In the Threat Modeler app, open **CI and API tokens**, create a token and copy it (it is shown once).
2. In your GitHub repository: Settings, Secrets and variables, Actions, **New repository secret**. Name it
   `THREAT_MODELER_TOKEN` and paste the token.
3. Add `.github/workflows/threat-modeler.yml`:

```yaml
name: Threat Modeler
on:
  push:
    branches: [main]        # scans of main become the baseline
  pull_request:

permissions:
  contents: read
  pull-requests: write      # lets the action comment on pull requests

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: YOUR-GITHUB-NAME/YOUR-REPO-NAME/action@main
        with:
          token: ${{ secrets.THREAT_MODELER_TOKEN }}
          api-url: https://threat-modeler-bz87.onrender.com
```

Replace `YOUR-GITHUB-NAME/YOUR-REPO-NAME` with the repository that holds this `action` folder.

The first run on `main` has nothing to compare with, so it passes and becomes the baseline.

## Options

| Input | Default | What it does |
|---|---|---|
| `token` | required | API token (use a secret) |
| `api-url` | required | Your server address |
| `comment` | `true` | Post the result as one comment on each pull request, edited on every push. Needs `pull-requests: write`. Comments are not posted for pull requests from forks, where GitHub gives the workflow a read-only token (the scan still runs) |
| `fail-on` | `new-severe` | `new-severe`: new critical or high problems. `new-any`: any new problem. `severe`: any critical or high problem at all. `never`: report only |
| `path` | `.` | Folder to scan |
| `project` | `owner/repo` | Project name used to match scans |
| `baseline` | `auto` | `true` or `false` to force a scan to count as (or not count as) the baseline |
| `timeout` | `600` | Seconds to wait for the scan |

Outputs: `risk-score`, `new-findings`, `new-severe`, `report-url`.

## Good to know

- The code is zipped and uploaded to **your** Threat Modeler server, scanned there, and deleted afterwards (unless you changed `DELETE_UPLOADS_AFTER_SCAN`).
- Free hosting sleeps when idle: the first scan after a quiet period can take a minute longer. The action keeps retrying until `timeout`.
- Pull requests from forks do not get access to repository secrets, so they cannot run the scan.
- Limit: 30 CI scans per hour per account.
