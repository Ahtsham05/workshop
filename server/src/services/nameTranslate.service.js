/**
 * English ↔ Urdu name translation with provider cascade.
 *
 * MyMemory free tier is ~5k chars/day per IP; production servers share one IP and
 * hit quota quickly. Google (unofficial) and Lingva proxies are tried first.
 */

const LINGVA_INSTANCES = [
  'https://lingva.ml',
  'https://lingva.lunar.icu',
  'https://translate.plausibility.cloud',
  'https://lingva.thedaviddelta.com',
];

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

async function fetchFromGoogle(text, source, target) {
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${source}&tl=${target}` +
    `&dt=t&q=${encodeURIComponent(text)}`;
  const response = await fetchWithTimeout(url);
  if (!response) return null;
  try {
    const data = await response.json();
    const segments = data?.[0]?.map((seg) => seg?.[0]).filter(Boolean);
    const translated = segments?.join('')?.trim() ?? '';
    if (!translated || translated === text) return null;
    return translated;
  } catch {
    return null;
  }
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
  )}&langpair=${source}|${target}`;
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

async function translateEnglishToUrdu(text) {
  const trimmed = String(text ?? '')
    .trim()
    .slice(0, 500);
  if (!trimmed) return '';
  if (!latinLetters.test(trimmed) && arabicScript.test(trimmed)) {
    return trimmed;
  }
  if (!latinLetters.test(trimmed)) return '';

  const translated = await translateBetween(trimmed, 'en', 'ur');
  if (!translated) return '';
  if (translated.toLowerCase() === trimmed.toLowerCase()) return '';
  return translated;
}

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
  translateEnglishToUrdu,
  translateUrduToEnglish,
};
