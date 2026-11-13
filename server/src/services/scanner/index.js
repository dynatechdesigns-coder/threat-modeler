import { loadSources } from './agent/fileLoader.js';
import { runStaticRules } from './agent/staticRules.js';
import { scanDependencies } from './agent/osv.js';
import { reviewWithAI } from './agent/llmAnalyzer.js';
import { buildSummary } from './agent/aiSummary.js';
import { env } from '../../config/env.js';
import { agentScanner } from './agentScanner.js';
import { mockScanner } from './mockScanner.js';

const ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const MAX_FINDINGS = 200;

/**
 * The real scanning agent. Layers, from cheapest to most expensive:
 *   1. Static rules   (deterministic pattern checks, no network)
 *   2. Dependencies   (OSV.dev advisory database, no API key)
 *   3. AI review      (Anthropic, OpenAI or Gemini; optional, needs an API key)
 * Uploaded code is only ever read as text. It is never executed.
 */
export function createAgentScanner({ config = {}, fetchImpl = globalThis.fetch } = {}) {
  const provider = config.provider || 'anthropic';
  const cfg = {
    apiKey: '',
    maxChars: 150000,
    maxBatches: 4,
    timeoutSeconds: 30,
    osvEnabled: true,
    includeTests: false,
    baseUrl: '',
    ...config,
    provider,
    // Anthropic has a known default model. For OpenAI and Gemini the model name must be set explicitly.
    model: config.model || (provider === 'anthropic' ? 'claude-sonnet-5-5' : ''),
  };

  return {
    name: 'agent',

    async scan({ files, readFile, onLog, ai = true }) {
      const logs = [];
      const log = (line) => {
        logs.push(line);
        try {
          onLog?.(line);
        } catch {
          /* logging must never break a scan */
        }
      };

      log(`$ threat-agent scan (${files.length} upload${files.length === 1 ? '' : 's'})`);
      log('Reading uploaded files...');
      const { sources, manifests, stats, smartError } = await loadSources({ files, readFile, log, includeTests: cfg.includeTests });

      if (sources.length === 0 && manifests.length === 0) {
        throw new Error(smartError || 'No scannable source files found. Upload code files or a .zip of your project.');
      }
      log(`Loaded ${sources.length} source file(s); skipped ${stats.ignored} non-code, ${stats.tooLarge} oversized`);
      if (stats.tests) log(`Skipped ${stats.tests} test/fixture file(s) (set SCAN_INCLUDE_TESTS=true to include them)`);

      // 1. static rules
      log('Running security rules...');
      const staticFindings = runStaticRules(sources);
      log(`Rules complete: ${staticFindings.length} finding(s)`);

      // 2. dependencies
      let depFindings = [];
      if (cfg.osvEnabled && manifests.length) {
        try {
          depFindings = await scanDependencies(manifests, { fetchImpl, log });
          log(`Dependency check complete: ${depFindings.length} advisory finding(s)`);
        } catch (err) {
          log(`[WARN] Dependency check skipped: ${err.message}`);
        }
      }

      // 3. AI review
      let aiFindings = [];
      if (ai === false) {
        log('AI review is part of the Pro plan. This scan used the security rules and the dependency check');
      } else if (!cfg.apiKey) {
        log('[WARN] AI review skipped: add an API key (ANTHROPIC_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY) for deeper analysis');
      } else if (!cfg.model) {
        log(`[WARN] AI review skipped: set AI_MODEL to a model name for the ${cfg.provider} provider`);
      } else if (sources.length) {
        try {
          aiFindings = await reviewWithAI({
            sources,
            knownFindings: [...staticFindings, ...depFindings],
            config: cfg,
            fetchImpl,
            log,
          });
        } catch (err) {
          log(`[WARN] AI review failed: ${err.message}`);
        }
      }

      const findings = [...staticFindings, ...depFindings, ...aiFindings]
        .sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.file.localeCompare(b.file) || a.line - b.line)
        .slice(0, MAX_FINDINGS);

      for (const f of findings.filter((x) => x.severity === 'critical' || x.severity === 'high').slice(0, 12)) {
        log(`[${f.severity.toUpperCase()}] ${f.title} (${f.file}:${f.line})`);
      }

      // If the AI review just failed, the AI service is probably down or slow, so do not wait on a second call.
      const aiDown = aiFindings.failed === true;
      if (aiDown) log('AI summary skipped: the AI service did not respond, using an automatic summary');
      const aiSummary = await buildSummary({ findings, config: aiDown || ai === false ? { ...cfg, apiKey: '' } : cfg, fetchImpl, log });

      const count = (s) => findings.filter((f) => f.severity === s).length;
      log(
        `[DONE] ${findings.length} finding(s): ${count('critical')} critical, ${count('high')} high, ${count('medium')} medium, ${count('low')} low`
      );

      return { findings, logs, aiSummary };
    },
  };
}

/**
 * Provider switch used by the scan runner. SCANNER_PROVIDER=mock selects the
 * sample-data scanner for UI work; anything else selects the real agent.
 */
export function getScanner() {
  return env.scannerProvider === 'mock' ? mockScanner : agentScanner;
}
