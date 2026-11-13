// Provider adapters for the AI review layer. Each one turns the same request
// (system prompt + user prompt + one "report_findings" tool) into that provider's API format
// and pulls the findings array back out of the reply. Plain fetch, no SDKs.

export const PROVIDERS = ['anthropic', 'openai', 'gemini'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const adapters = {
  anthropic: {
    label: 'Anthropic',
    build: ({ apiKey, model, system, user, tool }) => ({
      url: 'https://api.anthropic.com/v1/messages',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: {
        model,
        max_tokens: 4096,
        system,
        messages: [{ role: 'user', content: user }],
        tools: [tool],
        tool_choice: { type: 'tool', name: tool.name },
      },
    }),
    parse: (data) => (data.content || []).find((b) => b.type === 'tool_use')?.input,
  },

  // Also works with OpenAI-compatible services (OpenRouter, Groq, local Ollama...) via AI_BASE_URL.
  openai: {
    label: 'OpenAI',
    build: ({ apiKey, model, system, user, tool, baseUrl }) => ({
      url: `${(baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')}/chat/completions`,
      headers: { authorization: `Bearer ${apiKey}` },
      body: {
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        tools: [{ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.input_schema } }],
        tool_choice: { type: 'function', function: { name: tool.name } },
      },
    }),
    parse: (data) => {
      const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) return undefined;
      try {
        return JSON.parse(args);
      } catch {
        return undefined;
      }
    },
  },

  gemini: {
    label: 'Gemini',
    build: ({ apiKey, model, system, user, tool }) => ({
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      headers: { 'x-goog-api-key': apiKey },
      body: {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        tools: [{ functionDeclarations: [{ name: tool.name, description: tool.description, parameters: tool.input_schema }] }],
        toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [tool.name] } },
      },
    }),
    parse: (data) => (data.candidates?.[0]?.content?.parts || []).find((p) => p.functionCall)?.functionCall?.args,
  },
};

/** Calls the chosen provider with one forced tool and returns that tool's input object. Retries rate limits and server errors. */
export async function callTool({ provider = 'anthropic', apiKey, model, baseUrl, system, user, tool, fetchImpl, timeoutSeconds = 30 }) {
  const adapter = adapters[provider];
  if (!adapter) {
    const err = new Error(`Unknown AI provider "${provider}". Use one of: ${PROVIDERS.join(', ')}`);
    err.fatal = true;
    throw err;
  }

  const req = adapter.build({ apiKey, model, system, user, tool, baseUrl });
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt++) {
    let res;
    try {
      res = await fetchImpl(req.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...req.headers },
        body: JSON.stringify(req.body),
        signal: AbortSignal.timeout(Math.max(5, timeoutSeconds) * 1000),
      });
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw new Error(`${adapter.label} did not answer within ${timeoutSeconds}s (the service may be busy)`);
      }
      throw err;
    }

    if (res.ok) {
      return adapter.parse(await res.json());
    }

    const text = String(await res.text()).slice(0, 200);
    lastError = new Error(`${adapter.label} API ${res.status}: ${text}`);
    if ([400, 401, 403, 404].includes(res.status)) {
      lastError.fatal = true; // bad key, bad model name or bad request: retrying will not help
      throw lastError;
    }
    if (attempt < 3) await sleep(2000 * attempt); // 429 / 5xx: wait and retry
  }
  throw lastError;
}

/** Calls the provider and returns the findings array. An unreadable reply gives an empty array flagged .unreadable. */
export async function callModel(opts) {
  const input = await callTool(opts);
  if (Array.isArray(input?.findings)) return input.findings;
  const empty = [];
  empty.unreadable = true; // the model replied, but not with a findings list we could read
  return empty;
}
