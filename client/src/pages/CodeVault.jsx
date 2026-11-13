import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileCode2, Github, Loader2, Trash2 } from 'lucide-react';
import { useScanGithubMutation, useTriggerScanMutation, useUploadFilesMutation } from '../features/scans/scansApi.js';
import { getErrorMessage } from '../lib/errors.js';
import { formatBytes } from '../lib/format.js';
import FileDropzone from '../components/scan/FileDropzone.jsx';

const MAX_FILES = 10;
const MAX_MB = 25;

export default function CodeVault() {
  const navigate = useNavigate();
  const [uploadFiles, { isLoading: uploading }] = useUploadFilesMutation();
  const [triggerScan, { isLoading: triggering }] = useTriggerScanMutation();

  const [scanGithub, { isLoading: fetchingRepo }] = useScanGithubMutation();
  const [repoUrl, setRepoUrl] = useState('');
  const [repoError, setRepoError] = useState('');
  const [repoToken, setRepoToken] = useState('');
  const [tokenOpen, setTokenOpen] = useState(false);

  const [files, setFiles] = useState([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const busy = uploading || triggering || fetchingRepo;

  const addFiles = (list) => {
    setError('');
    const incoming = Array.from(list);
    const tooBig = incoming.find((f) => f.size > MAX_MB * 1024 * 1024);
    if (tooBig) return setError(`${tooBig.name} is larger than ${MAX_MB}MB`);

    setFiles((current) => {
      const merged = [...current];
      for (const f of incoming) {
        if (!merged.some((m) => m.name === f.name && m.size === f.size)) merged.push(f);
      }
      if (merged.length > MAX_FILES) setError(`Only ${MAX_FILES} files per scan`);
      return merged.slice(0, MAX_FILES);
    });
  };

  const removeFile = (index) => setFiles((current) => current.filter((_, i) => i !== index));

  const startScan = async () => {
    setError('');
    try {
      const report = await uploadFiles({ files, name: name.trim() }).unwrap();
      await triggerScan(report._id).unwrap();
      navigate(`/scans/${report._id}`);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const startRepoScan = async (e) => {
    e.preventDefault();
    setRepoError('');
    try {
      const report = await scanGithub({ url: repoUrl.trim(), token: tokenOpen ? repoToken.trim() || undefined : undefined }).unwrap();
      setRepoToken('');
      navigate(`/scans/${report._id}`);
    } catch (err) {
      setRepoError(getErrorMessage(err));
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white">Code Vault</h1>
      <p className="mt-1 mb-8 text-sm text-slate-400">
        Upload source code for the agent to analyze. Files are stored securely and never executed.
      </p>

      <form onSubmit={startRepoScan} className="card mb-6 p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Github className="h-4 w-4 text-cyan-400" /> Scan a GitHub repository
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Paste the link of a repository. We download a copy, read it as text only, and delete it after the scan.
          For a private repository, add a read-only token below.
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <input
            className="input"
            placeholder="https://github.com/owner/repo"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            disabled={busy}
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
          />
          <button className="btn-primary shrink-0" disabled={busy || !repoUrl.trim()}>
            {fetchingRepo && <Loader2 className="h-4 w-4 animate-spin" />}
            {fetchingRepo ? 'Downloading...' : 'Scan repository'}
          </button>
        </div>

        <details
          className="mt-3 text-xs text-slate-400"
          onToggle={(e) => {
            setTokenOpen(e.currentTarget.open);
            if (!e.currentTarget.open) setRepoToken('');
          }}
        >
          <summary className="cursor-pointer text-slate-300">Private repository? Add a read-only token</summary>
          <div className="mt-2 space-y-2">
            <p>
              On GitHub: Settings, then Developer settings, Personal access tokens, Fine-grained tokens, Generate new
              token. Set it to expire in 1 day, choose &ldquo;Only select repositories&rdquo; and pick this one, then under
              Permissions set <span className="text-slate-200">Contents: Read-only</span>.
            </p>
            {/* Only drawn while this section is open, so the browser cannot autofill a saved password into it. */}
            {tokenOpen && (
              <input
                type="password"
                name="github-read-only-token"
                className="input"
                placeholder="github_pat_..."
                value={repoToken}
                onChange={(e) => setRepoToken(e.target.value)}
                disabled={busy}
                autoComplete="new-password"
                data-lpignore="true"
                data-1p-ignore="true"
                spellCheck={false}
              />
            )}
            <p className="text-slate-500">
              The token is used once to download this copy and is never saved. Delete it on GitHub afterwards.
            </p>
          </div>
        </details>
        {repoError && <p className="mt-3 text-sm text-red-400">{repoError}</p>}
      </form>

      <p className="mb-3 text-xs font-semibold uppercase text-slate-500">Or upload files</p>
      <FileDropzone onFiles={addFiles} disabled={busy} />
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {files.length > 0 && (
        <div className="card mt-6">
          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-200">
              {files.length} file{files.length > 1 ? 's' : ''} queued
            </h2>
            <button className="text-xs text-slate-400 hover:text-red-400" onClick={() => setFiles([])} disabled={busy}>
              Clear all
            </button>
          </div>
          <ul className="divide-y divide-slate-800">
            {files.map((f, i) => (
              <li key={`${f.name}-${f.size}`} className="flex items-center justify-between px-5 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <FileCode2 className="h-4 w-4 shrink-0 text-cyan-400" />
                  <span className="truncate text-sm text-slate-200">{f.name}</span>
                  <span className="shrink-0 text-xs text-slate-500">{formatBytes(f.size)}</span>
                </div>
                <button onClick={() => removeFile(i)} disabled={busy} aria-label={`Remove ${f.name}`}>
                  <Trash2 className="h-4 w-4 text-slate-500 hover:text-red-400" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-3 border-t border-slate-800 p-5 sm:flex-row">
            <input
              className="input"
              placeholder="Scan name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
            <button className="btn-primary shrink-0" onClick={startScan} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {uploading ? 'Uploading...' : triggering ? 'Starting scan...' : 'Upload and start scan'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
