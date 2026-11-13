import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useGetScanQuery } from '../features/scans/scansApi.js';
import { selectToken } from '../features/auth/authSlice.js';
import { getErrorMessage } from '../lib/errors.js';
import Terminal from '../components/scan/Terminal.jsx';

import { aiLogic, appCheck } from '../lib/firebase.js';
import { getToken } from 'firebase/app-check';
import { getGenerativeModel, InferenceMode, InferenceSource } from 'firebase/ai';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function saveScanResult({ scanId, token, body }) {
  const res = await fetch(`${API_BASE}/scans/${scanId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `Save failed (HTTP ${res.status})`;
    try {
      const data = await res.json();
      if (data?.message) message = data.message;
    } catch {
      // Ignore
    }
    throw new Error(message);
  }
  return res.json();
}

function buildThreatPrompt(report) {
  const files = (report.files || [])
    .map((f) => `- ${f.originalName} (${f.size ?? 0} bytes)`)
    .join('\n');
  return [
    'Act as a cybersecurity expert. Generate a threat matrix for the architecture below.',
    `Architecture: ${report.name}`,
    'Uploaded files:',
    files || '- (no file inventory available)',
    'You MUST return ONLY a valid, raw JSON array. Do NOT wrap the output in markdown blockticks.',
    'Each object in the array must strictly have these exact keys: "id", "threat", "severity", and "mitigation".',
    'The "severity" value MUST be entirely lowercase: exactly "critical", "high", "medium", or "low".'
  ].join('\n');
}

const PHASE_LABEL = {
  verifying: 'Verifying device…',
  generating: 'Generating locally…',
  saving: 'Saving matrix…',
};

export default function ActiveScan() {
  const { id } = useParams();
  const navigate = useNavigate();
  const token = useSelector(selectToken);

  const { data: report, error: queryError, refetch } = useGetScanQuery(id, {
    pollingInterval: 2000
  });

  const [aiLogs, setAiLogs] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [executionSource, setExecutionSource] = useState(null);
  const [saveError, setSaveError] = useState('');
  const status = report?.status;

  useEffect(() => {
    if (status !== 'completed') return undefined;
    navigate(`/reports/${id}`, { replace: true });
  }, [status, id, navigate]);

  const startHybridScan = async () => {
    if (isScanning || !report) return;
    if (!token) {
      setSaveError('You are signed out. Sign in again to save the scan.');
      return;
    }
    const log = (line) => setAiLogs((prev) => [...prev, line]);
    try {
      setIsScanning(true);
      setSaveError('');
      setExecutionSource(null);
      log(`$ threat-agent scan --target "${report.name}"`);

      setPhase('verifying');
      log('Initializing Firebase App Check…');
      try {
        if (!appCheck) throw new Error('App Check is not initialized in this environment');
        await getToken(appCheck, false);
        log('App Check verified. Token acquired.');
      } catch (appCheckErr) {
        log(`[WARN] App Check unavailable (${appCheckErr.message}). Continuing; cloud fallback may be rejected.`);
      }

      setPhase('generating');
      log('Attempting local on-device inference via Gemini Nano…');
      
      // FIX: Upgraded to gemini-3.8-flash here
      const model = getGenerativeModel(aiLogic, {
        mode: InferenceMode.PREFER_ON_DEVICE,
        inCloudParams: { model: 'gemini-3.8-flash', generationConfig: { temperature: 0.2 } },
      });
      
      const inferenceResult = await model.generateContent(buildThreatPrompt(report));
      const matrixText = inferenceResult.response.text();
      const source = inferenceResult.response.inferenceSource;
      setExecutionSource(source === InferenceSource.ON_DEVICE ? 'local' : 'cloud');
      log(
        source === InferenceSource.ON_DEVICE
          ? 'Success: threat model generated locally.'
          : 'Local Nano inference unavailable. Cloud fallback successful.'
      );

      setPhase('saving');
      log('Saving threat matrix…');
      await saveScanResult({ scanId: id, token, body: { resultData: matrixText, status: 'completed' } });
      log('[DONE] Threat matrix saved.');
      
      navigate(`/reports/${id}`, { replace: true });
      
    } catch (err) {
      const message = getErrorMessage(err);
      log(`[ERROR] Scan failed: ${message}`);
      setSaveError(message);
      try {
        await saveScanResult({ scanId: id, token, body: { status: 'failed' } });
        refetch();
      } catch {
        // Ignore
      }
    } finally {
      setPhase('idle');
      setIsScanning(false);
    }
  };

  const error = getErrorMessage(queryError) || saveError;
  if (!report) {
    return error ? <p className="text-sm text-red-400">{error}</p> : <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />;
  }

  const lines = aiLogs.length > 0 ? aiLogs : (report.logs || []);
  const displayScanning = isScanning || status === 'running';

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white">Active Scan</h1>
      <p className="mt-1 mb-6 text-sm text-slate-400">{report.name}</p>
      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {status === 'uploaded' && (
        <div className="card p-6">
          <p className="mb-4 text-sm text-slate-300">This architecture has not been analyzed yet.</p>
          <button className="btn-primary" onClick={startHybridScan} disabled={isScanning}>
            {isScanning ? (PHASE_LABEL[phase] || 'Scanning…') : 'Start Hybrid AI Scan'}
          </button>
        </div>
      )}

      {status === 'failed' && (
        <div className="card mb-4 border-red-500/30 p-6">
          <p className="text-sm font-medium text-red-400">Analysis failed</p>
          <p className="mt-1 text-sm text-slate-400">{report.error || saveError || 'Unknown AI routing error'}</p>
          <div className="mt-4 flex gap-3">
            <button className="btn-primary" onClick={startHybridScan} disabled={isScanning}>
              {isScanning ? (PHASE_LABEL[phase] || 'Scanning…') : 'Retry'}
            </button>
            <Link to="/vault" className="btn-ghost">Back to vault</Link>
          </div>
        </div>
      )}

      {(displayScanning || status === 'completed' || (status === 'failed' && lines.length > 0)) && (
        <>
          {status !== 'failed' && (
            <div className="mb-4">
              <div className="mb-1 flex justify-between text-xs text-slate-400">
                <span>
                  {status === 'completed' ? 'Complete, redirecting…' : (PHASE_LABEL[phase] || 'Analyzing architecture…')}
                </span>
                <span>{lines.length} log line{lines.length === 1 ? '' : 's'}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div className={`h-full w-full rounded-full bg-cyan-500 ${displayScanning ? 'animate-pulse opacity-70' : ''}`} />
              </div>
            </div>
          )}
          <Terminal lines={lines} title={`threat-agent: ${report.name}`} running={displayScanning} />
        </>
      )}
    </div>
  );
}