import { useState } from "react";
import { Check, Copy, KeyRound, Loader2, Trash2 } from "lucide-react";
import {
  useCreateTokenMutation,
  useDeleteTokenMutation,
  useGetTokensQuery,
} from "../features/tokens/tokensApi.js";
import { getErrorMessage } from "../lib/errors.js";
import { formatDate } from "../lib/format.js";

const API_URL = import.meta.env.VITE_API_URL || "";

function CopyBox({ label, value, multiline = false }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* the text can still be selected by hand */
    }
  };
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase text-slate-500">
          {label}
        </p>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-300"
          onClick={copy}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}{" "}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {multiline ? (
        <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
          {value}
        </pre>
      ) : (
        <input
          className="input font-mono text-xs"
          readOnly
          value={value}
          onFocus={(e) => e.target.select()}
        />
      )}
    </div>
  );
}

const workflow = (apiUrl) => `name: Threat Modeler
on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read
  pull-requests: write

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: YOUR-GITHUB-NAME/YOUR-REPO-NAME/action@main
        with:
          token: \${{ secrets.THREAT_MODELER_TOKEN }}
          api-url: ${apiUrl}`;

export default function ApiTokens() {
  const { data: tokens = [], isLoading } = useGetTokensQuery();
  const [create, creating] = useCreateTokenMutation();
  const [remove] = useDeleteTokenMutation();
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState(null);
  const [error, setError] = useState("");

  const apiUrl =
    API_URL.replace(/\/api\/?$/, "") || "https://YOUR-SERVER-ADDRESS";

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const res = await create({ name }).unwrap();
      setFresh(res.token);
      setName("");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold text-white">CI and API tokens</h1>
      <p className="mt-1 text-sm text-slate-400">
        Let GitHub scan every push and pull request, and fail the build when a
        change adds a serious new problem.
      </p>

      <div className="card mt-6 p-5">
        <h2 className="text-sm font-semibold text-slate-200">
          1. Create a token
        </h2>
        <form onSubmit={submit} className="mt-3 flex flex-wrap gap-2">
          <input
            className="input max-w-xs"
            placeholder="Name, e.g. my-app GitHub"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
          />
          <button className="btn-primary" disabled={creating.isLoading}>
            {creating.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}{" "}
            Create token
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

        {fresh && (
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="mb-3 text-sm text-amber-200">
              Copy this now. For your safety it is shown only once. Paste it
              straight into GitHub as a secret.
            </p>
            <CopyBox label="Your token" value={fresh} />
            <button
              className="mt-3 text-xs text-slate-400 hover:text-cyan-300"
              onClick={() => setFresh(null)}
            >
              I have saved it
            </button>
          </div>
        )}

        <div className="mt-5">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
          ) : tokens.length === 0 ? (
            <p className="text-sm text-slate-500">No tokens yet.</p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {tokens.map((t) => (
                <li
                  key={t._id}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate text-slate-200">{t.name}</p>
                    <p className="font-mono text-xs text-slate-500">
                      {t.display} · made {formatDate(t.createdAt)} ·{" "}
                      {t.lastUsedAt
                        ? `used ${formatDate(t.lastUsedAt)}`
                        : "never used"}
                    </p>
                  </div>
                  <button
                    onClick={() => remove(t._id)}
                    aria-label={`Delete token ${t.name}`}
                    className="rounded-lg p-2 hover:bg-slate-800"
                  >
                    <Trash2 className="h-4 w-4 text-slate-500 hover:text-red-400" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card mt-4 p-5">
        <h2 className="text-sm font-semibold text-slate-200">
          2. Add the token to GitHub
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          In your repository open Settings, then Secrets and variables, then
          Actions, then New repository secret. Name it{" "}
          <code className="text-cyan-300">THREAT_MODELER_TOKEN</code> and paste
          the token.
        </p>
        <h2 className="mt-5 text-sm font-semibold text-slate-200">
          3. Add the workflow
        </h2>
        <p className="mt-2 mb-3 text-sm text-slate-400">
          Create{" "}
          <code className="text-cyan-300">
            .github/workflows/threat-modeler.yml
          </code>{" "}
          with this. Replace the two YOUR-... words with the GitHub name and
          repository that hold the <code className="text-cyan-300">action</code>{" "}
          folder.
        </p>
        <CopyBox label="Workflow file" value={workflow(apiUrl)} multiline />
        <p className="mt-3 text-xs text-slate-500">
          The first run on your main branch becomes the baseline. After that,
          pull requests fail only for problems they add.
        </p>
      </div>
    </div>
  );
}
