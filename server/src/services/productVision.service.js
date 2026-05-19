const https = require('https');
const httpStatus = require('http-status');
const config = require('../config/config');
const ApiError = require('../utils/ApiError');
const {
  createGeminiApiError,
  callGeminiWithFallback,
} = require('../utils/geminiVisionHelpers');

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com';

const SYSTEM_PROMPT = `You are an OCR assistant for a business management app. Extract product/inventory records from images of handwritten or printed product lists, stock registers, price lists, warehouse sheets, or catalog pages.

Return ONLY valid JSON with this exact shape (no markdown, no explanation):
{"products":[{"name":"","nameUrdu":"","barcode":"","price":0,"cost":0,"stockQuantity":0,"unit":"","category":"","description":""}]}

Rules:
- Extract every distinct product row you can read
- At least one of name or nameUrdu is required; skip rows with neither
- name: Roman/Latin English (e.g. "Jacquard 72 Hook China"). Required when nameUrdu is set.
- nameUrdu: exact Urdu/Arabic script from the image when shown
- If only Urdu is visible, copy to nameUrdu AND provide standard English product name in name
- price: sale/retail price column; 0 if not shown
- cost: purchase/cost price column; use price if only one price column exists; 0 if not shown
- stockQuantity: stock/qty/quantity column; 0 if not shown
- barcode: product code / SKU / barcode if visible; empty string if not
- unit: pcs, meter, kg, box, etc.; default "pcs" if unclear
- category: category/type column if visible
- description: extra notes if visible
- Strip currency symbols and commas from numbers
- Do not invent data not visible in the image`;

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

  if (supported.length > 0) {
    return supported;
  }

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
    throw new ApiError(httpStatus.BAD_GATEWAY, 'Could not parse product data from image');
  }
}

function parseNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(String(value).replace(/,/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeProduct(raw) {
  let name = String(raw?.name || '').trim();
  let nameUrdu = String(raw?.nameUrdu || '').trim();
  const urduScript = /[\u0600-\u06FF\u0750-\u077F]/;

  if (!nameUrdu && name && urduScript.test(name)) {
    nameUrdu = name;
    name = '';
  }
  if (!name && !nameUrdu) return null;

  const price = parseNumber(raw?.price, 0);
  let cost = parseNumber(raw?.cost, 0);
  if (cost === 0 && price > 0) {
    cost = price;
  }

  return {
    name,
    nameUrdu,
    barcode: String(raw?.barcode || '').trim(),
    price,
    cost,
    stockQuantity: parseNumber(raw?.stockQuantity, 0),
    unit: String(raw?.unit || '').trim() || 'pcs',
    category: String(raw?.category || '').trim(),
    description: String(raw?.description || '').trim(),
  };
}

function extractGeminiText(response) {
  const parts = response?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.map((p) => p.text || '').join('');
}

async function fillEnglishNamesFromUrdu(apiKey, products) {
  const pending = products
    .map((p, index) => ({ index, nameUrdu: p.nameUrdu }))
    .filter((item) => item.nameUrdu && !products[item.index].name);

  if (pending.length === 0) {
    return products;
  }

  const model =
    (config.gemini.model && String(config.gemini.model).trim()) || 'gemini-2.5-flash-lite';
  const lines = pending.map((p, i) => `${i + 1}. ${p.nameUrdu}`).join('\n');

  const prompt = `Transliterate these Urdu product names into Latin English for an inventory database.
Return ONLY JSON: {"names":["Name1","Name2",...]}
Same count and order. Keep product terms (Jacquard, Hook, China, etc.).

${lines}`;

  try {
    const response = await geminiRequest('POST', `/v1/models/${encodeURIComponent(model)}:generateContent`, apiKey, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1 },
    });
    const parsed = parseJsonFromContent(extractGeminiText(response));
    const names = Array.isArray(parsed?.names) ? parsed.names : [];
    pending.forEach((item, i) => {
      const english = String(names[i] || '').trim();
      if (english && /[A-Za-z]/.test(english)) {
        products[item.index].name = english;
      }
    });
  } catch {
    // fall through to MyMemory per row
  }

  await Promise.all(
    pending.map(async (item) => {
      if (products[item.index].name) return;
      const english = await transliterateUrduToEnglish(item.nameUrdu);
      if (english) {
        products[item.index].name = english;
      }
    }),
  );

  return products;
}

async function transliterateUrduToEnglish(nameUrdu) {
  const text = String(nameUrdu || '').trim().slice(0, 500);
  if (!text || !/[\u0600-\u06FF\u0750-\u077F]/.test(text)) return '';

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=ur|en`;
    const response = await fetch(url);
    if (!response.ok) return '';
    const data = await response.json();
    const translated = String(data.responseData?.translatedText ?? '').trim();
    if (translated && /[A-Za-z]/.test(translated)) {
      return translated;
    }
  } catch {
    return '';
  }
  return '';
}

async function callGeminiModel(apiKey, model, base64, safeMime) {
  const path = `/v1/models/${encodeURIComponent(model)}:generateContent`;

  return geminiRequest('POST', path, apiKey, {
    contents: [
      {
        parts: [
          {
            text: `${SYSTEM_PROMPT}\n\nExtract all products from this image. Return JSON only.`,
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
    generationConfig: {
      temperature: 0.1,
    },
  });
}

/**
 * Extract product rows from an image buffer using Google Gemini vision.
 */
async function extractProductsFromImage(imageBuffer, mimeType = 'image/jpeg') {
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
    throw new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      'No Gemini vision models are available for your API key. Create a new key at https://aistudio.google.com/apikey',
    );
  }

  const { response, modelUsed } = await callGeminiWithFallback({
    models,
    callModel: (model) => callGeminiModel(apiKey, model, base64, safeMime),
  });

  const content = extractGeminiText(response);
  const parsed = parseJsonFromContent(content);
  const list = Array.isArray(parsed?.products) ? parsed.products : Array.isArray(parsed) ? parsed : [];

  let products = list.map(normalizeProduct).filter(Boolean);

  if (products.length === 0) {
    throw new ApiError(
      httpStatus.UNPROCESSABLE_ENTITY,
      'No products could be read from this image. Try a clearer photo with visible product names and prices.',
    );
  }

  products = await fillEnglishNamesFromUrdu(apiKey, products);

  return { products, modelUsed };
}

module.exports = {
  extractProductsFromImage,
  resolveModelsToTry,
  fetchAvailableModels,
};
