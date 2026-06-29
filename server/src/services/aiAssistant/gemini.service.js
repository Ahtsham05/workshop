const config = require('../../config/config');
const logger = require('../../config/logger');
const { createGeminiApiError } = require('../../utils/geminiVisionHelpers');
const { TOOL_DECLARATIONS, TOOL_HANDLERS } = require('./tools');

const MAX_TOOL_ROUNDS = 4;

// Each Gemini model has its own separate free-tier daily quota, so falling
// back to a different model (not just retrying the same one) is what
// actually recovers from a `RESOURCE_EXHAUSTED` / 429 on the configured model.
const PREFERRED_CHAT_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash-lite', 'gemini-2.0-flash'];

function resolveModelsToTry() {
  const fromEnv = [
    (config.gemini.chatModel || '').trim(),
    ...(config.gemini.fallbackModels || '').split(',').map((m) => m.trim()).filter(Boolean),
    ...PREFERRED_CHAT_MODELS,
  ];
  return [...new Set(fromEnv.filter(Boolean))];
}

const SYSTEM_INSTRUCTION = `You are the AI Business Assistant inside an ERP system. You answer the business owner's
questions about their own data (sales, profit, customers, suppliers, inventory, expenses) by calling the
provided tools — never guess numbers, always call a tool to fetch real data before answering.

Rules:
- Always reply in the same language and script the user wrote in (English, Urdu, Roman Urdu, etc.).
- Keep replies short, conversational and to the point — like a knowledgeable accountant, not a report generator.
- All money amounts from the tools are in the business's own currency (see "currency" in the business context below) — always prefix amounts with that currency (e.g. "Rs 5,000"), never $ or USD or any other currency.
- If a tool returns no data, say so plainly instead of making something up.
- If the question is unrelated to this business's data, politely say you can only help with business data questions.`;

function toGeminiHistory(messages) {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
}

async function callGeminiModel(model, contents, businessContext) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.gemini.apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: `${SYSTEM_INSTRUCTION}\n\nBusiness context: ${JSON.stringify(businessContext)}` }],
      },
      contents,
      tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = `Gemini request failed (${res.status})`;
    try {
      message = JSON.parse(text)?.error?.message || message;
    } catch {
      // keep default message
    }
    throw createGeminiApiError(message, res.status);
  }
  return res.json();
}

/** Tries each model in `resolveModelsToTry()` order, moving on immediately on quota/availability errors. */
async function callGenerateContent(contents, businessContext) {
  const models = resolveModelsToTry();
  let lastError;
  for (const model of models) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await callGeminiModel(model, contents, businessContext);
    } catch (err) {
      lastError = err;
      if (!err.isRetryable) throw err;
      logger.warn(`AI assistant: model "${model}" unavailable (${err.message}) — trying next fallback model`);
    }
  }
  throw lastError;
}

function extractParts(body) {
  return body?.candidates?.[0]?.content?.parts || [];
}

/**
 * Runs the Gemini tool-calling loop: sends history, executes any requested
 * functionCalls against TOOL_HANDLERS scoped to `ctx`, feeds the results back,
 * and repeats until Gemini returns plain text (or MAX_TOOL_ROUNDS is hit).
 *
 * @param {Array<{role: 'user'|'assistant', content: string}>} history
 * @param {{organizationId: string, branchId?: string}} ctx
 * @param {{businessName?: string, businessType?: string, currency?: string}} businessContext
 * @returns {Promise<{ text: string, toolCalls: Array<{name, args, result}> }>}
 */
async function runConversation(history, ctx, businessContext = {}) {
  if (!config.gemini.apiKey) {
    return {
      text: 'The AI assistant is not configured yet. Please contact your administrator.',
      toolCalls: [],
    };
  }

  const contents = toGeminiHistory(history);
  const toolCalls = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    let body;
    try {
      // eslint-disable-next-line no-await-in-loop
      body = await callGenerateContent(contents, businessContext);
    } catch (err) {
      logger.error('AI assistant Gemini call failed:', err.message);
      const text = err.isQuotaError
        ? "The AI assistant has hit its usage limit for now. Please try again in a little while."
        : "Sorry, I couldn't reach the AI service. Please try again in a moment.";
      return { text, toolCalls };
    }

    const parts = extractParts(body);
    const functionCalls = parts.filter((p) => p.functionCall);

    if (functionCalls.length === 0) {
      const text = parts.map((p) => p.text).filter(Boolean).join('\n').trim();
      return { text: text || "Sorry, I couldn't find an answer to that.", toolCalls };
    }

    contents.push({ role: 'model', parts });

    const functionResponseParts = [];
    for (const part of functionCalls) {
      const { name, args = {} } = part.functionCall;
      const handler = TOOL_HANDLERS[name];
      let result;
      try {
        // eslint-disable-next-line no-await-in-loop
        result = handler ? await handler(args, ctx) : { error: `Unknown tool: ${name}` };
      } catch (err) {
        logger.error(`AI assistant tool "${name}" failed:`, err.message);
        result = { error: 'Failed to fetch this data.' };
      }
      toolCalls.push({ name, args, result });
      functionResponseParts.push({ functionResponse: { name, response: result } });
    }

    contents.push({ role: 'user', parts: functionResponseParts });
  }

  return { text: "Sorry, that question needs more steps than I can take right now — try asking it more directly.", toolCalls };
}

module.exports = { runConversation };
