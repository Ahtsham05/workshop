const httpStatus = require('http-status');
const config = require('../config/config');
const ApiError = require('../utils/ApiError');
const geminiClient = require('./ai/geminiClient');
const noteService = require('./note.service');

// Bounds prompt size/cost regardless of how long a note or the library grows —
// this app has no vector DB, so retrieval below is keyword-based, not embeddings.
const MAX_NOTE_CHARS = 12000;
const MAX_EXCERPT_CHARS = 700;
const MAX_ASK_CANDIDATES = 20;

const truncate = (text, max) => {
  const value = String(text || '');
  return value.length > max ? `${value.slice(0, max)}…` : value;
};

const ensureConfigured = () => {
  if (!config.gemini.apiKey) {
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'AI features are not configured yet. Please contact your administrator.');
  }
};

const BASE_SYSTEM_INSTRUCTION = `You are the AI writing assistant built into this app's Notes feature. You help the
user with the ONE note they hand you — summarizing, improving, rewriting, extracting information from it, or
explaining/working with any code inside it.

Rules:
- Always reply in the same language/script the note itself is written in, unless a translation action explicitly says otherwise.
- Never invent facts, numbers, names or tasks that are not actually in the note.
- Keep output focused, with no preamble like "Sure, here is..." — just the result itself.
- Respond with ONLY a single valid JSON object matching the shape described for this action — no markdown code fences, no commentary outside the JSON.`;

const jsonGenerationConfig = { responseMimeType: 'application/json' };

const parseJsonResponse = (body) => {
  const text = geminiClient.extractText(body);
  try {
    return JSON.parse(text);
  } catch {
    // Gemini occasionally wraps JSON in ```json fences despite being told not to.
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // fall through to the error below
      }
    }
    throw new ApiError(httpStatus.BAD_GATEWAY, "AI couldn't process this request. Please try again.");
  }
};

const callAi = async ({ systemInstruction, prompt, logLabel }) => {
  ensureConfigured();
  let body;
  try {
    body = await geminiClient.generateContent({
      systemInstruction,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: jsonGenerationConfig,
      logLabel,
    });
  } catch (err) {
    if (err.isQuotaError) {
      throw new ApiError(httpStatus.TOO_MANY_REQUESTS, 'AI is busy right now — please try again in a little while.');
    }
    throw new ApiError(httpStatus.BAD_GATEWAY, "AI couldn't process this request. Please try again.");
  }
  return parseJsonResponse(body);
};

const noteExcerpt = (note) => truncate(note.plainText || '', MAX_NOTE_CHARS);

const LENGTH_HINTS = {
  short: 'one or two sentences',
  medium: 'a short paragraph (3-5 sentences)',
  detailed: 'several sentences covering all key points, as a short multi-paragraph summary',
};

const REWRITE_STYLES = {
  professional: 'a professional, business-appropriate tone',
  simple: 'very simple, plain language a beginner could follow',
  shorter: 'a noticeably shorter version that keeps only the essential meaning',
  detailed: 'a more detailed, expanded version that fills in reasonable context',
  friendly: 'a warm, friendly, conversational tone',
};

/**
 * One entry per AI action button in the client. `shape` decides how the raw JSON
 * is normalized before it reaches the controller — see runNoteAction below.
 */
const ACTIONS = {
  summarize: {
    shape: 'text',
    buildPrompt: (note, options = {}) => {
      const hint = LENGTH_HINTS[options.length] || LENGTH_HINTS.medium;
      return `Summarize the following note in ${hint}. Return {"result": "<summary>"}.\n\nNote title: ${note.title || 'Untitled'}\n\nNote content:\n${noteExcerpt(note)}`;
    },
  },
  improveWriting: {
    shape: 'text',
    buildPrompt: (note) =>
      `Improve the clarity, grammar and professional tone of the following note WITHOUT changing its meaning or adding new information. Return {"result": "<improved text>"}.\n\nNote content:\n${noteExcerpt(note)}`,
  },
  fixGrammar: {
    shape: 'text',
    buildPrompt: (note) =>
      `Correct only the grammar and spelling mistakes in the following note. Do not rewrite sentences that are already correct and do not change its style or length. Return {"result": "<corrected text>"}.\n\nNote content:\n${noteExcerpt(note)}`,
  },
  generateTitle: {
    shape: 'text',
    buildPrompt: (note) =>
      `Suggest one short, meaningful title (max 8 words, no surrounding quotes) for the following note based on its content. Return {"result": "<title>"}.\n\nNote content:\n${noteExcerpt(note)}`,
  },
  extractKeyPoints: {
    shape: 'list',
    buildPrompt: (note) =>
      `Extract the most important points from the following note as short bullet points. Return {"items": ["point 1", "point 2", ...]}.\n\nNote content:\n${noteExcerpt(note)}`,
  },
  generateActionItems: {
    shape: 'list',
    buildPrompt: (note) =>
      `Read the following note and detect concrete tasks or to-dos in it, implicit or explicit. Return {"items": ["task 1", "task 2", ...]} as short, actionable phrases. If there are genuinely no tasks, return {"items": []}.\n\nNote content:\n${noteExcerpt(note)}`,
  },
  generateIdeas: {
    shape: 'list',
    buildPrompt: (note) =>
      `Based on the topic and content of the following note, suggest a few related ideas the user might not have thought of yet. Return {"items": ["idea 1", ...]} (3-6 ideas).\n\nNote content:\n${noteExcerpt(note)}`,
  },
  translate: {
    shape: 'text',
    buildPrompt: (note, options = {}) => {
      const target = truncate(options.targetLanguage || 'English', 40);
      return `Translate the following note into ${target}. Preserve meaning and tone; do not summarize or add commentary. Return {"result": "<translated text>"}.\n\nNote content:\n${noteExcerpt(note)}`;
    },
  },
  explain: {
    shape: 'text',
    buildPrompt: (note) =>
      `Explain the content of the following note in simple, easy-to-understand language, as if to someone unfamiliar with the topic. Return {"result": "<explanation>"}.\n\nNote content:\n${noteExcerpt(note)}`,
  },
  rewrite: {
    shape: 'text',
    buildPrompt: (note, options = {}) => {
      const style = REWRITE_STYLES[options.style] || REWRITE_STYLES.professional;
      return `Rewrite the following note in ${style}, preserving its actual meaning and facts. Return {"result": "<rewritten text>"}.\n\nNote content:\n${noteExcerpt(note)}`;
    },
  },
  // Code actions — the client only surfaces these when the note has a code block.
  explainCode: {
    shape: 'text',
    buildPrompt: (note) =>
      `Explain what the code in the following note does, in plain language. Return {"result": "<explanation>"}.\n\nNote content:\n${noteExcerpt(note)}`,
  },
  findBugs: {
    shape: 'list',
    buildPrompt: (note) =>
      `Review the code in the following note and list any bugs, edge cases or correctness issues, each as one short sentence naming the concrete problem. Return {"items": ["issue 1", ...]}. If you find none, return {"items": []}.\n\nNote content:\n${noteExcerpt(note)}`,
  },
  improveCode: {
    shape: 'text',
    buildPrompt: (note) =>
      `Improve the readability and correctness of the code in the following note without changing its behavior. Return {"result": "<improved code>"} — code only, no explanation.\n\nNote content:\n${noteExcerpt(note)}`,
  },
  optimizeCode: {
    shape: 'text',
    buildPrompt: (note) =>
      `Optimize the code in the following note for performance while keeping its behavior identical. Return {"result": "<optimized code>"} — code only, no explanation.\n\nNote content:\n${noteExcerpt(note)}`,
  },
  generateDocumentation: {
    shape: 'text',
    buildPrompt: (note) =>
      `Write clear documentation (docstrings/comments, as appropriate for the language) for the code in the following note. Return {"result": "<documented code>"}.\n\nNote content:\n${noteExcerpt(note)}`,
  },
  convertCode: {
    shape: 'text',
    buildPrompt: (note, options = {}) => {
      const target = truncate(options.targetLanguage || 'Python', 40);
      return `Convert the code in the following note to ${target}, preserving its behavior. Return {"result": "<converted code>"} — code only, no explanation.\n\nNote content:\n${noteExcerpt(note)}`;
    },
  },
  generateTests: {
    shape: 'text',
    buildPrompt: (note) =>
      `Write unit tests for the code in the following note, using whatever test framework is conventional for its language. Return {"result": "<test code>"}.\n\nNote content:\n${noteExcerpt(note)}`,
  },
  // Meeting actions — the client only surfaces these for noteType 'meeting'.
  meetingSummary: {
    shape: 'meeting',
    buildPrompt: (note) =>
      `The following note is from a meeting. Produce a structured meeting summary. Return {"summary": "<2-4 sentence overview>", "decisions": ["decision 1", ...], "actionItems": ["task 1", ...], "followUp": "<a short follow-up message draft, or empty string if not applicable>"}. Use only information actually present in the note — if a section has nothing, return an empty array or empty string for it.\n\nNote content:\n${noteExcerpt(note)}`,
  },
  extractDecisions: {
    shape: 'list',
    buildPrompt: (note) =>
      `List the decisions that were made in the following meeting note. Return {"items": ["decision 1", ...]}. If none, return {"items": []}.\n\nNote content:\n${noteExcerpt(note)}`,
  },
  identifyParticipants: {
    shape: 'list',
    buildPrompt: (note) =>
      `List the names of people mentioned as participants/attendees in the following meeting note. Return {"items": ["name 1", ...]}. If none are named, return {"items": []}.\n\nNote content:\n${noteExcerpt(note)}`,
  },
  generateFollowUp: {
    shape: 'text',
    buildPrompt: (note) =>
      `Write a short, professional follow-up message (email/chat style) summarizing the following meeting note for the people who attended. Return {"result": "<follow-up message>"}.\n\nNote content:\n${noteExcerpt(note)}`,
  },
  // The AI panel's free-text box — a custom question scoped to just this one note
  // (no retrieval needed, the whole note is already the context).
  answerQuestion: {
    shape: 'text',
    buildPrompt: (note, options = {}) => {
      const question = truncate(options.question || 'What is this note about?', 300);
      return `Answer the user's question using ONLY the following note as context. If the note does not contain the answer, say so plainly instead of guessing. Question: ${question}\nReturn {"result": "<answer>"}.\n\nNote content:\n${noteExcerpt(note)}`;
    },
  },
};

const normalizeStringList = (value) =>
  Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()) : [];

/** Runs one AI action against one note the caller can at least read (read-only actions work on shared notes too). */
const runNoteAction = async ({ actionKey, noteId, options, scope }) => {
  const action = ACTIONS[actionKey];
  if (!action) throw new ApiError(httpStatus.BAD_REQUEST, `Unknown AI action: ${actionKey}`);

  const note = await noteService.getNote(noteId, scope);
  if (!note.plainText || !note.plainText.trim()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This note is empty — write something first.');
  }

  const prompt = action.buildPrompt(note, options || {});
  const data = await callAi({ systemInstruction: BASE_SYSTEM_INSTRUCTION, prompt, logLabel: `Notes AI (${actionKey})` });

  let result;
  if (action.shape === 'list') {
    result = { items: normalizeStringList(data.items) };
  } else if (action.shape === 'meeting') {
    result = {
      summary: typeof data.summary === 'string' ? data.summary.trim() : '',
      decisions: normalizeStringList(data.decisions),
      actionItems: normalizeStringList(data.actionItems),
      followUp: typeof data.followUp === 'string' ? data.followUp.trim() : '',
    };
  } else {
    result = { result: typeof data.result === 'string' ? data.result.trim() : '' };
  }

  // Cache the summary on the note itself (owner-only — silently skipped for shared,
  // read-only notes) so reopening it doesn't need a fresh Gemini call to show it again.
  if (actionKey === 'summarize' && result.result) {
    await noteService.cacheAiSummary(noteId, result.result, scope);
  }

  return { action: actionKey, ...result };
};

/** Suggests title/category/tags — never applied automatically, only returned for the user to confirm. */
const organizeNote = async ({ noteId, scope }) => {
  const note = await noteService.getNote(noteId, scope);
  if (!note.plainText || !note.plainText.trim()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This note is empty — write something first.');
  }

  const prompt = `Analyze the following note and suggest how to organize it. Return {"title": "<suggested title, or an empty string if the current title is already good>", "category": "<one short category, e.g. Work, Personal, Finance>", "tags": ["tag1", "tag2", ...]} — 2 to 5 short, lowercase tags, without a "#" symbol.\n\nCurrent title: ${note.title || 'Untitled'}\nCurrent tags: ${(note.tags || []).join(', ') || 'none'}\n\nNote content:\n${noteExcerpt(note)}`;

  const data = await callAi({ systemInstruction: BASE_SYSTEM_INSTRUCTION, prompt, logLabel: 'Notes AI (organize)' });

  return {
    title: typeof data.title === 'string' ? data.title.trim() : '',
    category: typeof data.category === 'string' ? data.category.trim() : '',
    tags: [...new Set(normalizeStringList(data.tags).map((tag) => tag.toLowerCase()))].slice(0, 6),
  };
};

const ASK_NOTES_SYSTEM_INSTRUCTION = `You are the "Ask Your Notes" assistant. You are given a numbered list of the
user's own notes (title + excerpt) and a question. Answer STRICTLY using only the information in those notes.
- If the notes contain the answer, answer it clearly and concisely, and list the numbers of the notes you actually used.
- If the notes do NOT contain enough information to answer, say so plainly instead of guessing or inventing anything — never use outside knowledge.
- Never refer to a note that was not given to you.
Respond with ONLY: {"found": <true|false>, "answer": "<answer, or a short explanation that it wasn't found>", "sourceNumbers": [<numbers of the notes you actually used, empty array if none>]}`;

/** Retrieval-augmented Q&A over the user's own notes — grounded, with server-validated sources. */
const askNotes = async ({ question, scope }) => {
  const trimmed = String(question || '').trim();
  if (!trimmed) throw new ApiError(httpStatus.BAD_REQUEST, 'Ask a question first.');

  const hasNotes = await noteService.hasAnyReadableNotes(scope);
  if (!hasNotes) {
    return { found: false, answer: "You don't have any notes yet — write one first and I can search it for you.", sources: [] };
  }

  const candidates = await noteService.searchCandidatesForAi(trimmed, scope, MAX_ASK_CANDIDATES);
  const numbered = candidates.map((note, index) => ({ index: index + 1, note }));
  const prompt = `Question: ${trimmed}\n\nNotes:\n${numbered
    .map(({ index, note }) => `[${index}] Title: ${note.title || 'Untitled'}\n${truncate(note.plainText, MAX_EXCERPT_CHARS)}`)
    .join('\n\n')}`;

  const data = await callAi({ systemInstruction: ASK_NOTES_SYSTEM_INSTRUCTION, prompt, logLabel: 'Notes AI (ask)' });

  // Never trust the model's cited numbers blindly — filter to ones actually offered to
  // it, so a hallucinated or out-of-range number can't leak a fabricated "source".
  const validIndexes = new Set(numbered.map((entry) => entry.index));
  const sourceNumbers = Array.isArray(data.sourceNumbers)
    ? data.sourceNumbers.filter((n) => typeof n === 'number' && validIndexes.has(n))
    : [];
  const sources = sourceNumbers.map((n) => {
    const entry = numbered.find((item) => item.index === n);
    return { id: String(entry.note._id), title: entry.note.title || 'Untitled' };
  });

  return {
    found: Boolean(data.found),
    answer:
      typeof data.answer === 'string' && data.answer.trim()
        ? data.answer.trim()
        : "I couldn't find enough information in your notes to answer that.",
    sources,
  };
};

module.exports = {
  ACTIONS,
  runNoteAction,
  organizeNote,
  askNotes,
};
