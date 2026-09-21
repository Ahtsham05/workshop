const httpStatus = require('http-status');
const config = require('../config/config');
const ApiError = require('../utils/ApiError');
const { callGeminiWithFallback } = require('../utils/geminiVisionHelpers');
const { geminiRequest, extractGeminiText, resolveModelsToTry } = require('./productVision.service');

/**
 * Gets the TEXT out of an uploaded price list (a PDF, or a photo/screenshot of one) so it can go
 * through the same parser as a pasted WhatsApp message. Deliberately returns text, not rows: the
 * user sees exactly what was read, can fix a bad line in the box, and re-analyze.
 *
 *   PDF with a text layer  → pdf.js, rows rebuilt from glyph positions (no AI, free, exact)
 *   scanned PDF / image    → Gemini vision, when GEMINI_API_KEY is configured
 */

const MAX_PDF_PAGES = 80;
const MAX_TEXT_CHARS = 400000;

// ─── PDF text layer ──────────────────────────────────────────────────────────

let pdfjsPromise = null;
const loadPdfjs = () => {
  // Loaded lazily (and once): pdf.js is ESM-only and ~1MB to parse, needed by a fraction of requests.
  if (!pdfjsPromise) pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsPromise;
};

/**
 * Rebuilds visual lines from pdf.js text items. A PDF stores loose positioned fragments, not
 * lines or table cells: rows are recovered by clustering on the y coordinate, ordered by x, and
 * a wide horizontal gap becomes a TAB — the cell separator the price-list parser reads as a
 * column break ("iPhone 15 <tab> 280000 <tab> 310000").
 *
 * @param {Array<{ str: string, transform: number[], width: number, height: number }>} items
 * @returns {string[]}
 */
const itemsToLines = (items) => {
  const cells = items
    .filter((it) => typeof it.str === 'string' && it.str.trim() !== '')
    .map((it) => ({
      text: it.str,
      x: it.transform[4],
      y: it.transform[5],
      width: it.width || 0,
      size: Math.abs(it.transform[3]) || it.height || 10,
    }));
  if (!cells.length) return [];

  // Top of the page first (PDF y grows upward), then cluster into rows.
  cells.sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  cells.forEach((cell) => {
    const row = rows[rows.length - 1];
    const tolerance = Math.max(2, cell.size * 0.45);
    if (row && Math.abs(row.y - cell.y) <= tolerance) row.cells.push(cell);
    else rows.push({ y: cell.y, cells: [cell] });
  });

  return rows
    .map((row) => {
      row.cells.sort((a, b) => a.x - b.x);
      let line = '';
      let prevEnd = null;
      row.cells.forEach((cell) => {
        if (prevEnd !== null) {
          const gap = cell.x - prevEnd;
          if (gap > cell.size * 1.6) line += ' \t ';
          else if (gap > cell.size * 0.12 || /^\s/.test(cell.text)) line += ' ';
        }
        line += cell.text.trim();
        prevEnd = cell.x + cell.width;
      });
      return line.trim();
    })
    .filter(Boolean);
};

/**
 * Is there a real price list in this text? A price list has numbers; a scan's leftover "text
 * layer" is page numbers and watermarks ("Scanned with CamScanner" has plenty of letters and no
 * prices). Two or more 3+ digit numbers is the bar — low enough for a tiny list, and it can
 * never be met by a watermark.
 */
const hasUsableText = (text) => (String(text || '').match(/\d[\d,.]{2,}/g) || []).length >= 2;

/** @returns {Promise<{ text: string, pages: number }>} */
const extractPdfText = async (buffer) => {
  const pdfjs = await loadPdfjs();
  let doc;
  try {
    doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: false,
      disableFontFace: true,
      isEvalSupported: false,
      verbosity: 0,
    }).promise;
  } catch (err) {
    if (err && err.name === 'PasswordException') {
      throw new ApiError(httpStatus.UNPROCESSABLE_ENTITY, 'This PDF is password protected. Remove the password and upload it again.');
    }
    throw new ApiError(httpStatus.UNPROCESSABLE_ENTITY, 'Could not read this PDF. It may be damaged — try exporting it again.');
  }

  try {
    const pages = Math.min(doc.numPages, MAX_PDF_PAGES);
    const lines = [];
    for (let n = 1; n <= pages; n += 1) {
      // eslint-disable-next-line no-await-in-loop
      const page = await doc.getPage(n);
      // eslint-disable-next-line no-await-in-loop
      const content = await page.getTextContent();
      lines.push(...itemsToLines(content.items));
      page.cleanup();
    }
    return { text: lines.join('\n'), pages: doc.numPages };
  } finally {
    await doc.destroy();
  }
};

// ─── AI transcription (scans, photos, screenshots) ───────────────────────────

const TRANSCRIBE_PROMPT = `You transcribe supplier price lists (a PDF, a photo, or a screenshot of a WhatsApp message) into plain text for a retail shop's software.

Output ONLY the transcription, no commentary and no markdown fences. Rules:
- One product per line: the product name, then each price separated by " | ", for example:
  Samsung Galaxy A15 4/128 | 35000 | 38500
- If the table has column headings, output them first as one line, for example:
  Product | Dealer Price | Retail Price
- Put section or brand headings on their own line, without prices.
- Keep model numbers, RAM/ROM (4/128), sizes and every word of the product name exactly as printed.
- Write numbers without currency symbols; keep them exactly as printed otherwise (do not add or remove digits).
- Skip anything that is not a product row (addresses, phone numbers, dates, greetings) — except headings.
- If a price is unreadable, leave that product's price out rather than guessing.
- Do not invent products or prices.`;

const aiConfigured = () => Boolean(config.gemini && String(config.gemini.apiKey || '').trim());

const stripFences = (text) => String(text || '').replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '').trim();

const transcribeWithAi = async (buffer, mimeType) => {
  if (!aiConfigured()) {
    throw new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      'AI reading is not set up on this server. Paste the text, or upload an Excel/CSV or a text-based PDF instead.',
    );
  }
  const apiKey = config.gemini.apiKey;
  const models = await resolveModelsToTry(apiKey);
  if (!models.length) {
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'No AI model is available for this server\'s API key.');
  }
  const base64 = buffer.toString('base64');

  const { response, modelUsed } = await callGeminiWithFallback({
    models,
    callModel: (model) =>
      geminiRequest('POST', `/v1/models/${encodeURIComponent(model)}:generateContent`, apiKey, {
        contents: [{ parts: [{ text: TRANSCRIBE_PROMPT }, { inline_data: { mime_type: mimeType, data: base64 } }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 16384 },
      }),
  });

  const text = stripFences(extractGeminiText(response));
  if (!hasUsableText(text)) {
    throw new ApiError(
      httpStatus.UNPROCESSABLE_ENTITY,
      'Could not read any prices from this file. Try a sharper photo, or paste the text instead.',
    );
  }
  return { text, model: modelUsed };
};

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @returns {Promise<{ text: string, method: 'pdf-text'|'ai', pages?: number, model?: string, truncated: boolean, notice?: string }>}
 */
const extractText = async (buffer, mimeType, deps = {}) => {
  // `deps.extractPdfText` is a test seam: Jest's CommonJS sandbox cannot dynamic-import pdf.js's
  // ES module, so tests drive the real reader in a child process and mock it for orchestration.
  const readPdf = deps.extractPdfText || extractPdfText;
  if (!buffer || !buffer.length) throw new ApiError(httpStatus.BAD_REQUEST, 'The file is empty');
  const finish = (result) => {
    const truncated = result.text.length > MAX_TEXT_CHARS;
    return { ...result, text: truncated ? result.text.slice(0, MAX_TEXT_CHARS) : result.text, truncated };
  };

  if (mimeType === 'application/pdf') {
    const { text, pages } = await readPdf(buffer);
    if (hasUsableText(text)) return finish({ text, method: 'pdf-text', pages });

    // No usable text layer: a scan. Read it with AI if we can, otherwise say so plainly.
    if (!aiConfigured()) {
      throw new ApiError(
        httpStatus.UNPROCESSABLE_ENTITY,
        'This PDF is a scan (a picture of a page), so there is no text to read. Upload an Excel/CSV, paste the text, or ask your admin to enable AI reading.',
      );
    }
    const ai = await transcribeWithAi(buffer, 'application/pdf');
    return finish({ text: ai.text, method: 'ai', pages, model: ai.model, notice: 'Scanned PDF read with AI — check the numbers before applying.' });
  }

  if (typeof mimeType === 'string' && mimeType.startsWith('image/')) {
    const ai = await transcribeWithAi(buffer, mimeType);
    return finish({ text: ai.text, method: 'ai', model: ai.model, notice: 'Photo read with AI — check the numbers before applying.' });
  }

  throw new ApiError(httpStatus.BAD_REQUEST, 'Upload a PDF or an image. Excel/CSV files are read in the browser.');
};

module.exports = { extractText, extractPdfText, itemsToLines, aiConfigured };
