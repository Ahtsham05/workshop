const https = require('https');
const httpStatus = require('http-status');
const config = require('../config/config');
const ApiError = require('../utils/ApiError');
const { createGeminiApiError, callGeminiWithFallback } = require('../utils/geminiVisionHelpers');
const { parseJsonFromLlmContent } = require('../utils/jsonFromLlm');
const { matchSupplier, matchProduct } = require('../utils/fuzzyEntityMatch');

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com';

const SYSTEM_PROMPT = `You are an OCR assistant for Pakistani wholesale/retail purchase invoices (handwritten or printed, Urdu and/or English).

Return ONLY valid JSON (no markdown, no comments):
{"supplier":{"name":"","nameUrdu":"","phone":"","address":""},"invoiceNumber":"","date":"","paymentType":"","notes":"","items":[{"name":"","nameUrdu":"","barcode":"","quantity":1,"purchasePrice":0,"sellingPrice":0}]}

Rules:
- Read the shop/vendor heading at the top (e.g. "Sultan Traders", "یونائیٹیک") into supplier.name / supplier.nameUrdu
- items: every product line with quantity and unit rate from the bill
- purchasePrice: per-unit cost/rate (قیمت / rate), NOT line total unless only total is shown (then divide by quantity)
- sellingPrice: retail price if printed, else 0
- quantity: from qty column; default 1 if unclear
- barcode: SKU/code if visible
- date: YYYY-MM-DD if visible, else ""
- paymentType: Cash, Credit, Card, Cheque, Bank if mentioned, else ""
- name: English/Latin when possible; nameUrdu: exact Urdu script from the image
- For handwritten Urdu bills, transcribe carefully — do not skip rows
- Strip Rs, commas from numbers
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
  try {
    return parseJsonFromLlmContent(content);
  } catch (err) {
    throw new ApiError(
      httpStatus.BAD_GATEWAY,
      'Could not parse purchase invoice data from image. Try a clearer photo with good lighting.',
    );
  }
}

function parseNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(String(value).replace(/,/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeItem(raw) {
  const name = String(raw?.name || '').trim();
  const nameUrdu = String(raw?.nameUrdu || '').trim();
  const barcode = String(raw?.barcode || '').trim();
  const qty = Number(raw?.quantity);
  const quantity = Number.isFinite(qty) && qty > 0 ? qty : 1;
  const purchasePrice = parseNumber(raw?.purchasePrice, 0);
  const sellingPrice = parseNumber(raw?.sellingPrice, 0);
  if (!name && !nameUrdu && !barcode) return null;
  return { name, nameUrdu, barcode, quantity, purchasePrice, sellingPrice };
}

function normalizeInvoice(raw) {
  const supplier = {
    name: String(raw?.supplier?.name || raw?.vendor?.name || '').trim(),
    nameUrdu: String(raw?.supplier?.nameUrdu || raw?.vendor?.nameUrdu || '').trim(),
    phone: String(raw?.supplier?.phone || raw?.vendor?.phone || '').trim(),
    address: String(raw?.supplier?.address || raw?.vendor?.address || '').trim(),
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

function enrichWithCatalogMatches(invoice, catalog = {}) {
  const suppliers = Array.isArray(catalog.suppliers) ? catalog.suppliers : [];
  const products = Array.isArray(catalog.products) ? catalog.products : [];

  const supplierMatch = matchSupplier(invoice.supplier, suppliers);
  const enrichedSupplier = {
    ...invoice.supplier,
    matchedSupplierId: supplierMatch?.entity?.id || null,
    matchScore: supplierMatch?.score ?? 0,
    matchMethod: supplierMatch?.method || null,
  };

  const enrichedItems = invoice.items.map((item) => {
    const productMatch = matchProduct(item, products);
    const catalogProduct = productMatch?.entity;
    let sellingPrice = item.sellingPrice;
    if (catalogProduct && sellingPrice <= 0) {
      sellingPrice = Number(catalogProduct.price) || Number(catalogProduct.cost) || 0;
    }
    return {
      ...item,
      sellingPrice,
      matchedProductId: catalogProduct?.id || null,
      matchScore: productMatch?.score ?? 0,
      matchMethod: productMatch?.method || null,
      catalogSalePrice: catalogProduct ? Number(catalogProduct.price) || 0 : null,
      catalogCost: catalogProduct ? Number(catalogProduct.cost) || 0 : null,
    };
  });

  return {
    ...invoice,
    supplier: enrichedSupplier,
    items: enrichedItems,
  };
}

/**
 * @param {Buffer} imageBuffer
 * @param {string} [mimeType]
 * @param {{ suppliers?: object[], products?: object[] }} [catalog]
 */
async function extractPurchaseFromImage(imageBuffer, mimeType = 'image/jpeg', catalog = {}) {
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

  const rawText = extractGeminiText(response);
  if (!rawText.trim()) {
    throw new ApiError(
      httpStatus.UNPROCESSABLE_ENTITY,
      'AI could not read text from this image. Try a clearer, well-lit photo.',
    );
  }

  let parsed;
  try {
    parsed = normalizeInvoice(parseJsonFromContent(rawText));
  } catch (firstErr) {
    try {
      const retry = await callGeminiWithFallback({
        models: models.slice(0, 2),
        callModel: (model) => callGeminiModel(apiKey, model, base64, safeMime),
        attemptsPerModel: 1,
      });
      parsed = normalizeInvoice(parseJsonFromContent(extractGeminiText(retry.response)));
    } catch {
      throw firstErr;
    }
  }

  const enriched = enrichWithCatalogMatches(parsed, catalog);

  if (enriched.items.length === 0) {
    throw new ApiError(
      httpStatus.UNPROCESSABLE_ENTITY,
      'No product lines could be read from this invoice. Try a clearer photo or crop to the item table.',
    );
  }

  return { ...enriched, modelUsed };
}

module.exports = {
  extractPurchaseFromImage,
};
