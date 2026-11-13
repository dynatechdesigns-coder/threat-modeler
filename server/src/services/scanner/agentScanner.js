import { env } from '../../config/env.js';
import { createAgentScanner } from './agent/index.js';

/**
 * The AI scanning agent. The engine lives in ./agent/ (loader, rules, dependency check, AI review).
 * Enable it with SCANNER_PROVIDER=agent. Add an Anthropic, OpenAI or Gemini API key for the AI review layer.
 */
export const agentScanner = createAgentScanner({
  config: {
    provider: env.ai.provider,
    apiKey: env.ai.apiKey,
    model: env.ai.model,
    baseUrl: env.ai.baseUrl,
    maxChars: env.ai.maxChars,
    maxBatches: env.ai.maxBatches,
    timeoutSeconds: env.ai.timeoutSeconds,
    osvEnabled: env.osvEnabled,
    includeTests: env.scanIncludeTests,
  },
});
