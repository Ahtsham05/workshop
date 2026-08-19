const config = require('../../config/config');
const logger = require('../../config/logger');
const { createGeminiApiError } = require('../../utils/geminiVisionHelpers');
const { buildToolset } = require('./tools');

// Bumped from 4: entity lookups (search_customer etc.) often need one round to find the
// record and a second to act on it, so multi-step questions ("what does Ali owe, and is
// he in the low-stock list too?") need more headroom than a single-tool question.
const MAX_TOOL_ROUNDS = 6;

// Each Gemini model has its own separate free-tier daily quota, so falling
// back to a different model (not just retrying the same one) is what
// actually recovers from a `RESOURCE_EXHAUSTED` / 429 on the configured model.
// gemini-2.0-flash(-lite) were retired by Google ("no longer available") — dropped in
// favor of gemini-3.1-flash-lite, matching the fallback list the vision services
// (purchaseVision/customerVision/productVision/supplierVision) already settled on.
const PREFERRED_CHAT_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-3.1-flash-lite'];

function resolveModelsToTry() {
  const fromEnv = [
    (config.gemini.chatModel || '').trim(),
    ...(config.gemini.fallbackModels || '').split(',').map((m) => m.trim()).filter(Boolean),
    ...PREFERRED_CHAT_MODELS,
  ];
  return [...new Set(fromEnv.filter(Boolean))];
}

const SYSTEM_INSTRUCTION = `You are the AI Business Assistant inside an ERP system. You answer the business owner's
questions about their own data (sales, profit, customers, suppliers, inventory, purchases, expenses, cash & bank,
installments, repairs, salesman commissions — whatever tools are available to you below) by calling the provided
tools — never guess numbers, always call a tool to fetch real data before answering.

Rules:
- Always reply in the same language and script the user wrote in (English, Urdu, Roman Urdu, etc.).
- Keep replies short, conversational and to the point — like a knowledgeable accountant, not a report generator.
- All money amounts from the tools are in the business's own currency (see "currency" in the business context below) — always prefix amounts with that currency (e.g. "Rs 5,000"), never $ or USD or any other currency.
- If a tool returns no data, say so plainly instead of making something up.
- When a question names a SPECIFIC person or product ("what does Ali owe", "how many iPhone 13 left"), use the matching search_* tool instead of a list tool. If it returns more than one match, list the names briefly and ask which one they mean — never guess which one.
- Some tools may not be available to you for this user or this business — if none of your tools can answer a question, say you're not able to help with that rather than trying to improvise an answer.
- If the question is unrelated to this business's data, politely say you can only help with business data questions.
- create_invoice only PREPARES an invoice for review — it never saves anything. After calling it, briefly describe what you found (customer, product, quantity, total) so the user can double check it; the app itself shows Confirm/Cancel buttons for it, so never ask the user to reply "yes" or "confirm" in words. If it returns needs_clarification, ask the user for exactly what's missing (which customer/product they meant) before calling it again.`;

function toGeminiHistory(messages) {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
}

async function callGeminiModel(model, contents, businessContext, toolDeclarations) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.gemini.apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: `${SYSTEM_INSTRUCTION}\n\nBusiness context: ${JSON.stringify(businessContext)}` }],
      },
      contents,
      tools: [{ functionDeclarations: toolDeclarations }],
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
async function callGenerateContent(contents, businessContext, toolDeclarations) {
  const models = resolveModelsToTry();
  let lastError;
  for (const model of models) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await callGeminiModel(model, contents, businessContext, toolDeclarations);
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

// Human-friendly status shown while a tool call is in flight — never expose the raw
// function name/args to the user (see business-response.tsx's "never show function_call" rule).
const TOOL_STATUS_LABELS = {
  get_profit_summary: 'Calculating your profit…',
  get_top_products: 'Finding your top products…',
  get_top_customers: 'Finding your top customers…',
  get_unpaid_customers: 'Checking unpaid customers…',
  get_payables_to_suppliers: 'Checking supplier payables…',
  get_dead_stock: 'Checking dead stock…',
  get_low_stock: 'Checking low stock items…',
  get_stock_movements: 'Checking stock movements…',
  get_purchase_summary: 'Checking your purchases…',
  get_expense_summary: 'Checking your expenses…',
  get_cash_and_bank_summary: 'Checking cash & bank balances…',
  get_installments_summary: 'Checking installments…',
  get_repair_jobs_summary: 'Checking repair jobs…',
  get_salesman_commissions_summary: 'Checking salesman commissions…',
  search_customer: 'Looking up the customer…',
  search_supplier: 'Looking up the supplier…',
  search_product: 'Looking up the product…',
  search_imei: 'Looking up that IMEI…',
};
const friendlyToolStatus = (name) => TOOL_STATUS_LABELS[name] || 'Checking your business data…';

/**
 * Same request as callGeminiModel but against the `streamGenerateContent` endpoint, parsing
 * the SSE frames Google sends (`data: {...}\n\n`, same wire shape this app already uses for
 * whatsappInbox.controller.js's live-events stream) as they arrive. Text parts are incremental
 * deltas — each is forwarded to `onText` the moment it's parsed. functionCall parts arrive whole
 * (never split across chunks), so they're just collected and returned once the round ends.
 */
async function callGeminiModelStream(model, contents, businessContext, toolDeclarations, onText, signal) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${config.gemini.apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: `${SYSTEM_INSTRUCTION}\n\nBusiness context: ${JSON.stringify(businessContext)}` }],
      },
      contents,
      tools: [{ functionDeclarations: toolDeclarations }],
    }),
    signal,
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

  const functionCallParts = [];
  let accumulatedText = '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    // Google's SSE frames are CRLF-terminated (`\r\n\r\n`) even though this app's own SSE
    // writer (controllers/aiAssistant.controller.js, whatsappInbox.controller.js) emits plain
    // `\n\n` — normalize here so the same `\n\n` boundary search below works for either.
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

  const parts = accumulatedText ? [{ text: accumulatedText }, ...functionCallParts] : functionCallParts;
  return parts;
}

/** Streaming counterpart to callGenerateContent — same per-model fallback behavior. */
async function streamGenerateContent(contents, businessContext, toolDeclarations, onText, signal) {
  const models = resolveModelsToTry();
  let lastError;
  for (const model of models) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await callGeminiModelStream(model, contents, businessContext, toolDeclarations, onText, signal);
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      lastError = err;
      if (!err.isRetryable) throw err;
      logger.warn(`AI assistant (stream): model "${model}" unavailable (${err.message}) — trying next fallback model`);
    }
  }
  throw lastError;
}

/**
 * Streaming counterpart to runConversation. Same tool-calling loop and same rules (never
 * invent data, always call a tool), but text parts are pushed to `onEvent` as they arrive
 * from Gemini instead of being returned only once the whole turn is done, and a human-friendly
 * `status` event is emitted right before each tool call executes (see TOOL_STATUS_LABELS).
 *
 * @param {(event: {type: 'delta'|'status', text: string}) => void} onEvent
 * @param {AbortSignal} [signal]
 */
async function runConversationStream(history, ctx, businessContext = {}, onEvent, signal) {
  if (!config.gemini.apiKey) {
    const text = 'The AI assistant is not configured yet. Please contact your administrator.';
    onEvent({ type: 'delta', text });
    return { text, toolCalls: [] };
  }

  const { TOOL_DECLARATIONS, TOOL_HANDLERS } = buildToolset(ctx, businessContext);
  if (TOOL_DECLARATIONS.length === 0) {
    const text = "You don't have permission to view any business data through the assistant yet — ask an admin to grant you access to the relevant sections.";
    onEvent({ type: 'delta', text });
    return { text, toolCalls: [] };
  }

  const contents = toGeminiHistory(history);
  const toolCalls = [];
  let fullText = '';

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    let modelParts;
    try {
      // eslint-disable-next-line no-await-in-loop
      modelParts = await streamGenerateContent(contents, businessContext, TOOL_DECLARATIONS, (chunk) => {
        fullText += chunk;
        onEvent({ type: 'delta', text: chunk });
      }, signal);
    } catch (err) {
      if (err.name === 'AbortError') {
        // Client (or server, on disconnect) cancelled generation — preserve whatever streamed
        // so far rather than throwing, so the caller can still persist a partial message. Needs
        // a non-empty fallback: AiMessage.content is `required`, and Mongoose's required check
        // on a String rejects '' the same as undefined, so an instant Stop (before any text
        // streamed) would otherwise fail AiMessage.create and silently drop the whole turn.
        return { text: fullText.trim() || 'Stopped before finishing a response.', toolCalls, interrupted: true };
      }
      logger.error('AI assistant Gemini call failed:', err.message);
      const errorText = err.isQuotaError
        ? "The AI assistant has hit its usage limit for now. Please try again in a little while."
        : "Sorry, I couldn't reach the AI service. Please try again in a moment.";
      onEvent({ type: 'delta', text: errorText });
      // Persist whatever text had already streamed too, so the saved message matches what the
      // user actually saw live instead of silently dropping it in favor of just the error.
      return { text: (fullText ? `${fullText}\n\n${errorText}` : errorText).trim(), toolCalls };
    }

    const functionCalls = modelParts.filter((p) => p.functionCall);
    if (functionCalls.length === 0) {
      return { text: fullText.trim() || "Sorry, I couldn't find an answer to that.", toolCalls };
    }

    contents.push({ role: 'model', parts: modelParts });

    const functionResponseParts = [];
    for (const part of functionCalls) {
      const { name, args = {} } = part.functionCall;
      onEvent({ type: 'status', text: friendlyToolStatus(name) });
      let result;
      try {
        // eslint-disable-next-line no-await-in-loop
        result = TOOL_HANDLERS[name] ? await TOOL_HANDLERS[name](args, ctx) : { error: `Unknown tool: ${name}` };
      } catch (err) {
        logger.error(`AI assistant tool "${name}" failed:`, err.message);
        result = { error: 'Failed to fetch this data.' };
      }
      toolCalls.push({ name, args, result });
      functionResponseParts.push({ functionResponse: { name, response: result } });
    }

    contents.push({ role: 'user', parts: functionResponseParts });
  }

  const fallbackText = "Sorry, that question needs more steps than I can take right now — try asking it more directly.";
  onEvent({ type: 'delta', text: fallbackText });
  return { text: (fullText ? `${fullText}\n\n${fallbackText}` : fallbackText).trim(), toolCalls };
}

/**
 * Runs the Gemini tool-calling loop: sends history, executes any requested
 * functionCalls against TOOL_HANDLERS scoped to `ctx`, feeds the results back,
 * and repeats until Gemini returns plain text (or MAX_TOOL_ROUNDS is hit).
 *
 * @param {Array<{role: 'user'|'assistant', content: string}>} history
 * @param {{organizationId: string, branchId?: string, permissions?: Record<string, boolean>, isSystemAdmin?: boolean}} ctx
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

  const { TOOL_DECLARATIONS, TOOL_HANDLERS } = buildToolset(ctx, businessContext);
  if (TOOL_DECLARATIONS.length === 0) {
    return {
      text: "You don't have permission to view any business data through the assistant yet — ask an admin to grant you access to the relevant sections.",
      toolCalls: [],
    };
  }

  const contents = toGeminiHistory(history);
  const toolCalls = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    let body;
    try {
      // eslint-disable-next-line no-await-in-loop
      body = await callGenerateContent(contents, businessContext, TOOL_DECLARATIONS);
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

module.exports = { runConversation, runConversationStream };
