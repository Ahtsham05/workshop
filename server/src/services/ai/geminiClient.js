const config = require('../../config/config');
const logger = require('../../config/logger');
const { createGeminiApiError } = require('../../utils/geminiVisionHelpers');

/**
 * One low-level Gemini `generateContent` caller shared by every AI feature in this
 * app (the business assistant's tool-calling loop, Notes AI, ...) so there is exactly
 * one place that knows how to talk to the Generative Language API, retry across
 * models on quota/availability errors, and parse its SSE stream. Swapping AI
 * providers later means changing this file, not every feature that calls it.
 */

// Each Gemini model has its own separate free-tier daily quota, so falling back to a
// different model (not just retrying the same one) is what actually recovers from a
// `RESOURCE_EXHAUSTED` / 429 on the configured model. Matches the fallback list the
// vision services (purchaseVision/customerVision/productVision/supplierVision) and
// the original business-assistant caller already settled on.
const DEFAULT_FALLBACK_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-3.1-flash-lite'];

function resolveModelsToTry(preferredModel) {
  const fromEnv = [
    (preferredModel || config.gemini.chatModel || '').trim(),
    ...(config.gemini.fallbackModels || '').split(',').map((m) => m.trim()).filter(Boolean),
    ...DEFAULT_FALLBACK_MODELS,
  ];
  return [...new Set(fromEnv.filter(Boolean))];
}

function buildRequestBody({ systemInstruction, contents, tools, generationConfig }) {
  const body = { contents };
  if (systemInstruction) body.system_instruction = { parts: [{ text: systemInstruction }] };
  if (tools && tools.length) body.tools = [{ functionDeclarations: tools }];
  if (generationConfig) body.generationConfig = generationConfig;
  return body;
}

async function throwForErrorResponse(res) {
  const text = await res.text().catch(() => '');
  let message = `Gemini request failed (${res.status})`;
  try {
    message = JSON.parse(text)?.error?.message || message;
  } catch {
    // keep default message
  }
  throw createGeminiApiError(message, res.status);
}

async function callModelOnce({ model, systemInstruction, contents, tools, generationConfig }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.gemini.apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildRequestBody({ systemInstruction, contents, tools, generationConfig })),
  });
  if (!res.ok) await throwForErrorResponse(res);
  return res.json();
}

/**
 * Non-streaming call, retrying across `resolveModelsToTry()` in order on
 * quota/availability errors (never on a genuine bad-request — those surface immediately).
 */
async function generateContent({ systemInstruction, contents, tools, generationConfig, model, logLabel = 'AI' } = {}) {
  const models = resolveModelsToTry(model);
  let lastError;
  for (const candidate of models) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await callModelOnce({ model: candidate, systemInstruction, contents, tools, generationConfig });
    } catch (err) {
      lastError = err;
      if (!err.isRetryable) throw err;
      logger.warn(`${logLabel}: model "${candidate}" unavailable (${err.message}) — trying next fallback model`);
    }
  }
  throw lastError;
}

/**
 * Streaming counterpart. Google's SSE frames are CRLF-terminated (`\r\n\r\n`) even
 * though this app's own SSE writers emit plain `\n\n` — normalized below so the same
 * `\n\n` boundary search works either way. Text parts are incremental deltas, forwarded
 * to `onText` as they arrive; functionCall parts arrive whole and are just collected.
 */
async function callModelOnceStream({ model, systemInstruction, contents, tools, generationConfig, onText, signal }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${config.gemini.apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildRequestBody({ systemInstruction, contents, tools, generationConfig })),
    signal,
  });
  if (!res.ok) await throwForErrorResponse(res);

  const functionCallParts = [];
  let accumulatedText = '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf('\n\n');

      const dataLine = frame.split('\n').find((l) => l.startsWith('data:'));
      if (!dataLine) continue; // eslint-disable-line no-continue
      const jsonStr = dataLine.slice(5).trim();
      if (!jsonStr) continue; // eslint-disable-line no-continue

      let chunk;
      try {
        chunk = JSON.parse(jsonStr);
      } catch {
        continue; // eslint-disable-line no-continue
      }

      const chunkParts = chunk?.candidates?.[0]?.content?.parts || [];
      for (const part of chunkParts) {
        if (typeof part.text === 'string' && part.text) {
          accumulatedText += part.text;
          onText(part.text);
        } else if (part.functionCall) {
          functionCallParts.push(part);
        }
      }
    }
  }

  return accumulatedText ? [{ text: accumulatedText }, ...functionCallParts] : functionCallParts;
}

/** Streaming counterpart to generateContent — same per-model fallback behavior. */
async function generateContentStream({
  systemInstruction,
  contents,
  tools,
  generationConfig,
  onText,
  signal,
  model,
  logLabel = 'AI',
} = {}) {
  const models = resolveModelsToTry(model);
  let lastError;
  for (const candidate of models) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await callModelOnceStream({ model: candidate, systemInstruction, contents, tools, generationConfig, onText, signal });
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      lastError = err;
      if (!err.isRetryable) throw err;
      logger.warn(`${logLabel} (stream): model "${candidate}" unavailable (${err.message}) — trying next fallback model`);
    }
  }
  throw lastError;
}

function extractParts(body) {
  return body?.candidates?.[0]?.content?.parts || [];
}

function extractText(body) {
  return extractParts(body)
    .map((p) => p.text)
    .filter(Boolean)
    .join('\n')
    .trim();
}

module.exports = {
  resolveModelsToTry,
  generateContent,
  generateContentStream,
  extractParts,
  extractText,
};
