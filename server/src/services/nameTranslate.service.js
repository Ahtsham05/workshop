/**
 * English ↔ native-language name translation with provider cascade (Urdu for Pakistan,
 * Arabic for the UAE, … — see config/nativeLanguages.js).
 *
 * MyMemory free tier is ~5k chars/day per IP; production servers share one IP and
 * hit quota quickly. Google (unofficial) and Lingva proxies are tried first.
 */

const https = require('https');

const LINGVA_INSTANCES = [
  'https://lingva.ml',
  'https://lingva.lunar.icu',
  'https://translate.plausibility.cloud',
  'https://lingva.thedaviddelta.com',
];

const { NATIVE_LANGUAGES, SCRIPT_BY_LANGUAGE } = require('../config/nativeLanguages');

// Google and MyMemory want a region for Chinese; Lingva takes the bare code.
const PROVIDER_CODES = { zh: 'zh-CN' };
const providerCode = (lang) => PROVIDER_CODES[lang] || lang;

const CACHE = new Map();
const CACHE_MAX = 2000;

const latinLetters = /[A-Za-z]/;
const arabicScript =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

async function fetchWithTimeout(url, ms = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'LogixPlus/1.0',
        Accept: 'application/json',
      },
    });
    clearTimeout(timer);
    return response.ok ? response : null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

function isMyMemoryFailure(translated) {
  const upper = String(translated).toUpperCase();
  return (
    upper.startsWith('PLEASE SELECT TWO DISTINCT LANGUAGES') ||
    upper.startsWith('MYMEMORY WARNING') ||
    upper.includes('QUOTA EXCEEDED') ||
    upper.includes('QUOTA FINISHED')
  );
}

function cacheGet(key) {
  return CACHE.get(key);
}

function cacheSet(key, value) {
  if (CACHE.size >= CACHE_MAX) {
    CACHE.clear();
  }
  CACHE.set(key, value);
}

// Plain GET through Node's https module: Google answers Node's built-in fetch (undici) with
// 429 "Sorry…" on every request while the same URL over https.get returns 200, which left
// every name falling through to the lower-quality MyMemory fallback.
function httpsGetJson(url, ms = 8000) {
  return new Promise((resolve) => {
    const req = https.get(url, { family: 4, headers: { Accept: 'application/json' } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        resolve(null);
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(null);
        }
      });
    });
    req.setTimeout(ms, () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

async function fetchFromGoogle(text, source, target) {
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${providerCode(source)}&tl=${providerCode(target)}` +
    `&dt=t&q=${encodeURIComponent(text)}`;
  const data = await httpsGetJson(url);
  const segments = data?.[0]?.map((seg) => seg?.[0]).filter(Boolean);
  const translated = segments?.join('')?.trim() ?? '';
  if (!translated || translated === text) return null;
  return translated;
}

async function fetchFromLingva(text, source, target) {
  for (const base of LINGVA_INSTANCES) {
    const url = `${base}/api/v1/${source}/${target}/${encodeURIComponent(text)}`;
    const response = await fetchWithTimeout(url, 6000);
    if (!response) continue;
    try {
      const data = await response.json();
      const translated = String(data?.translation ?? '').trim();
      if (translated && translated !== text) return translated;
    } catch {
      // try next instance
    }
  }
  return null;
}

async function fetchFromMyMemory(text, source, target) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
    text,
  )}&langpair=${providerCode(source)}|${providerCode(target)}`;
  const response = await fetchWithTimeout(url);
  if (!response) return null;
  try {
    const data = await response.json();
    if (data?.quotaFinished === true) return null;
    const translated = String(data.responseData?.translatedText ?? '').trim();
    if (!translated || isMyMemoryFailure(translated) || translated === text) {
      return null;
    }
    return translated;
  } catch {
    return null;
  }
}

async function translateBetween(text, source, target) {
  const key = `${source}|${target}|${text}`;
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  const translated =
    (await fetchFromGoogle(text, source, target)) ??
    (await fetchFromLingva(text, source, target)) ??
    (await fetchFromMyMemory(text, source, target)) ??
    '';

  cacheSet(key, translated);
  return translated;
}

const isNativeLanguage = (lang) => NATIVE_LANGUAGES.includes(lang);

/** English name → the business's native language. '' when nothing useful came back. */
async function translateEnglishToNative(text, lang = 'ur') {
  if (!isNativeLanguage(lang)) return '';
  const trimmed = String(text ?? '')
    .trim()
    .slice(0, 500);
  if (!trimmed) return '';
  const script = SCRIPT_BY_LANGUAGE[lang];
  // Already typed in the target script (non-Latin languages only) — keep it as is.
  if (script && !latinLetters.test(trimmed) && script.test(trimmed)) {
    return trimmed;
  }
  if (!latinLetters.test(trimmed)) return '';

  const translated = await translateBetween(trimmed, 'en', lang);
  if (!translated) return '';
  if (translated.toLowerCase() === trimmed.toLowerCase()) return '';
  return translated;
}

/** Native-language name → English (romanized for non-Latin scripts). */
async function translateNativeToEnglish(text, lang = 'ur') {
  if (!isNativeLanguage(lang)) return '';
  const trimmed = String(text ?? '')
    .trim()
    .slice(0, 500);
  if (!trimmed) return '';
  const script = SCRIPT_BY_LANGUAGE[lang];
  if (script) {
    if (latinLetters.test(trimmed) && !script.test(trimmed)) return trimmed;
    if (!script.test(trimmed)) return '';
  }

  const translated = await translateBetween(trimmed, lang, 'en');
  if (!translated || !latinLetters.test(translated)) return '';
  if (translated.toLowerCase() === trimmed.toLowerCase()) return '';
  return translated;
}

const translateEnglishToUrdu = (text) => translateEnglishToNative(text, 'ur');

async function translateUrduToEnglish(text) {
  const trimmed = String(text ?? '')
    .trim()
    .slice(0, 500);
  if (!trimmed) return '';
  if (latinLetters.test(trimmed) && !arabicScript.test(trimmed)) {
    return trimmed;
  }
  if (!arabicScript.test(trimmed)) return '';

  const translated = await translateBetween(trimmed, 'ur', 'en');
  if (!translated || !latinLetters.test(translated)) return '';
  return translated;
}

module.exports = {
  translateEnglishToNative,
  translateNativeToEnglish,
  translateEnglishToUrdu,
  translateUrduToEnglish,
};
