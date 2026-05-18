const https = require('https');
const httpStatus = require('http-status');
const config = require('../config/config');
const ApiError = require('../utils/ApiError');
const { createGeminiApiError, callGeminiWithFallback } = require('../utils/geminiVisionHelpers');
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com';

const SYSTEM_PROMPT = `You are an OCR assistant for a business purchase invoice / stock purchase bill (Urdu or English).

Return ONLY valid JSON (no markdown):
{"supplier":{"name":"","nameUrdu":"","phone":"","address":""},"invoiceNumber":"","date":"","paymentType":"","notes":"","items":[{"name":"","nameUrdu":"","barcode":"","quantity":1,"purchasePrice":0,"sellingPrice":0}]}

Rules:
- supplier: vendor/shop name and phone from invoice header
- items: every product line with quantity and rates from the invoice
- purchasePrice: unit cost / purchase rate / "rate" / "قیمت" per unit (not line total unless only total is shown, then divide by qty)
- sellingPrice: retail/sale price if printed on invoice, else 0
- barcode: product code if visible
- date: YYYY-MM-DD if visible, else ""
- paymentType: Cash, Credit, Card, etc. if mentioned, else ""
- name: English/Latin transliteration when Urdu is shown; nameUrdu: exact Urdu script
- Do not invent rows not on the invoice`;

const PREFERRED_VISION_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
];

let cachedAvailableModels = null;
let cacheExpiresAt = 0;
const MODEL_CACHE_MS = 60 * 60 * 1000;

function geminiRequest(method, path, apiKey, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, GEMINI_API_BASE);
    const payload = body ? JSON.stringify(body) : null;

    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          let parsed;
          try {
            parsed = data ? JSON.parse(data) : {};
          } catch {
            reject(new ApiError(httpStatus.BAD_GATEWAY, 'Invalid response from Gemini API'));
            return;
          }
          if (res.statusCode !== 200) {
            const message = parsed.error?.message || `Gemini API returned ${res.statusCode}`;
            reject(createGeminiApiError(message, res.statusCode));
            return;
          }
          resolve(parsed);
        });
      },
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function fetchAvailableModels(apiKey) {
  const now = Date.now();
  if (cachedAvailableModels && now < cacheExpiresAt) {
    return cachedAvailableModels;
  }
  const response = await geminiRequest('GET', '/v1/models', apiKey);
  const models = new Set(
    (response.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => String(m.name || '').replace(/^models\//, ''))
      .filter(Boolean),
  );
  cachedAvailableModels = models;
  cacheExpiresAt = now + MODEL_CACHE_MS;
  return models;
}

async function resolveModelsToTry(apiKey) {
  const available = await fetchAvailableModels(apiKey);
  const fromEnv = [
    (config.gemini.model || '').trim(),
    ...(config.gemini.fallbackModels || '')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean),
    ...PREFERRED_VISION_MODELS,
  ];
  const ordered = [...new Set(fromEnv.filter(Boolean))];
  const supported = ordered.filter((m) => available.has(m));
  if (supported.length > 0) return supported;
  return PREFERRED_VISION_MODELS.filter((m) => available.has(m));
}

function parseJsonFromContent(content) {
  const trimmed = String(content || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new ApiError(httpStatus.BAD_GATEWAY, 'Could not parse purchase invoice data from image');
  }
}

function normalizeItem(raw) {
  const name = String(raw?.name || '').trim();
  const nameUrdu = String(raw?.nameUrdu || '').trim();
  const barcode = String(raw?.barcode || '').trim();
  const qty = Number(raw?.quantity);
  const quantity = Number.isFinite(qty) && qty > 0 ? qty : 1;
  let purchasePrice = Number(String(raw?.purchasePrice ?? '').replace(/,/g, ''));
  if (!Number.isFinite(purchasePrice)) purchasePrice = 0;
  let sellingPrice = Number(String(raw?.sellingPrice ?? '').replace(/,/g, ''));
  if (!Number.isFinite(sellingPrice)) sellingPrice = 0;
  if (!name && !nameUrdu && !barcode) return null;
  return { name, nameUrdu, barcode, quantity, purchasePrice, sellingPrice };
}

function normalizeInvoice(raw) {
  const supplier = {
    name: String(raw?.supplier?.name || '').trim(),
    nameUrdu: String(raw?.supplier?.nameUrdu || '').trim(),
    phone: String(raw?.supplier?.phone || '').trim(),
    address: String(raw?.supplier?.address || '').trim(),
  };
  const urduScript = /[\u0600-\u06FF\u0750-\u077F]/;
  if (!supplier.nameUrdu && supplier.name && urduScript.test(supplier.name)) {
    supplier.nameUrdu = supplier.name;
    supplier.name = '';
  }
  const items = (Array.isArray(raw?.items) ? raw.items : []).map(normalizeItem).filter(Boolean);
  return {
    supplier,
    invoiceNumber: String(raw?.invoiceNumber || '').trim(),
    date: String(raw?.date || '').trim(),
    paymentType: String(raw?.paymentType || '').trim(),
    notes: String(raw?.notes || '').trim(),
    items,
  };
}

function extractGeminiText(response) {
  const parts = response?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.map((p) => p.text || '').join('');
}

async function callGeminiModel(apiKey, model, base64, safeMime) {
  const path = `/v1/models/${encodeURIComponent(model)}:generateContent`;
  return geminiRequest('POST', path, apiKey, {
    contents: [
      {
        parts: [
          {
            text: `${SYSTEM_PROMPT}\n\nExtract this purchase invoice. Return JSON only.`,
          },
          {
            inline_data: {
              mime_type: safeMime,
              data: base64,
            },
          },
        ],
      },
    ],
    generationConfig: { temperature: 0.1 },
  });
}

async function extractPurchaseFromImage(imageBuffer, mimeType = 'image/jpeg') {
  const apiKey = config.gemini?.apiKey;
  if (!apiKey || !String(apiKey).trim()) {
    throw new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      'AI scan is not configured. Add GEMINI_API_KEY to the server .env file.',
    );
  }
  if (!imageBuffer || !imageBuffer.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No image data provided');
  }

  const base64 = imageBuffer.toString('base64');
  const safeMime = mimeType.startsWith('image/') ? mimeType : 'image/jpeg';
  const models = await resolveModelsToTry(apiKey);
  if (models.length === 0) {
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'No Gemini vision models available for your API key.');
  }

  const { response, modelUsed } = await callGeminiWithFallback({
    models,
    callModel: (model) => callGeminiModel(apiKey, model, base64, safeMime),
  });

  const parsed = normalizeInvoice(parseJsonFromContent(extractGeminiText(response)));

  if (parsed.items.length === 0) {
    throw new ApiError(
      httpStatus.UNPROCESSABLE_ENTITY,
      'No product lines could be read from this invoice. Try a clearer photo.',
    );
  }

  return { ...parsed, modelUsed };
}

module.exports = {
  extractPurchaseFromImage,
};
