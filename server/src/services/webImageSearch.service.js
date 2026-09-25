const https = require('https');
const http = require('http');
const dns = require('dns');
const net = require('net');
const crypto = require('crypto');
const { URL } = require('url');
const httpStatus = require('http-status');
const config = require('../config/config');
const logger = require('../config/logger');
const { uploadToCloudinary } = require('../middlewares/upload');
const ApiError = require('../utils/ApiError');

/**
 * Multi-provider "Find from web" image search.
 *
 * The older imageSearch.service.js does one thing: take a name, grab the single first
 * Pexels photo, and push it straight to Cloudinary. That is fine for a category banner
 * and useless for an actual shop catalog — a mobile shop wants *this* phone, not a
 * stock photo of "a phone", and it wants to look at a few candidates before committing
 * one to storage.
 *
 * So this module splits the job in two:
 *   1. search()  — asks every configured provider in parallel, merges/ranks/dedupes the
 *                  candidates, and returns them as plain URLs. Nothing is uploaded, so
 *                  browsing costs no Cloudinary storage at all.
 *   2. importImages() — only the handful the user actually picked get downloaded,
 *                  validated and uploaded.
 *
 * Providers are tiered by how likely they are to be the *real* product:
 *   barcode lookups (exact product identity) > web image search > stock photos.
 * Every provider is best-effort: a provider that is unconfigured, rate-limited or down
 * is reported in `providers[]` and skipped, never fatal, so the dialog still works with
 * zero API keys configured.
 */

const MAX_IMPORT_PER_REQUEST = 8;
const DOWNLOAD_MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 8000;
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

// Cloudinary folder per entity the picker can be opened from. Anything unknown falls
// back to `products` rather than letting a caller write to an arbitrary folder name.
const FOLDERS = {
  product: 'products',
  category: 'categories',
  subcategory: 'sub-categories',
  brand: 'brands',
};

/* ------------------------------------------------------------------ *
 * SSRF protection
 * ------------------------------------------------------------------ */

/**
 * Blocks the private/loopback/link-local/metadata address space. The import endpoint
 * fetches URLs chosen on the client, so without this a tenant could point it at
 * 169.254.169.254 (cloud metadata), 127.0.0.1 (this server's own admin ports) or an
 * internal 10.x service and read the response back out of Cloudinary.
 */
const isBlockedAddress = (address) => {
  if (net.isIPv4(address)) {
    const parts = address.split('.').map(Number);
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  if (net.isIPv6(address)) {
    const lower = address.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('fe80')) return true; // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local
    if (lower.startsWith('ff')) return true; // multicast
    // IPv4-mapped (::ffff:10.0.0.1) — re-check the embedded v4 address.
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedAddress(mapped[1]);
    return false;
  }
  return true;
};

const resolveHost = (hostname) =>
  new Promise((resolve, reject) => {
    dns.lookup(hostname, { all: true }, (err, addresses) => {
      if (err) reject(err);
      else resolve(addresses.map((a) => a.address));
    });
  });

/** Throws unless `urlString` is an http(s) URL that resolves to a public address. */
const assertFetchableUrl = async (urlString) => {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch (e) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'That is not a valid image URL.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Only http(s) image URLs can be imported.');
  }
  // A literal IP in the URL never hits DNS, so check it directly too.
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if ((net.isIP(host) && isBlockedAddress(host)) || host === 'localhost') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'That image URL is not reachable.');
  }
  let addresses;
  try {
    addresses = await resolveHost(host);
  } catch (e) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'That image URL could not be resolved.');
  }
  if (!addresses.length || addresses.some(isBlockedAddress)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'That image URL is not reachable.');
  }
  return parsed;
};

/* ------------------------------------------------------------------ *
 * HTTP helpers
 * ------------------------------------------------------------------ */

const httpGetRaw = (urlString, { headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = 2 * 1024 * 1024, depth = 0 } = {}) =>
  new Promise((resolve, reject) => {
    if (depth > 5) {
      reject(new Error('Too many redirects'));
      return;
    }
    let parsed;
    try {
      parsed = new URL(urlString);
    } catch (e) {
      reject(new Error('Invalid URL'));
      return;
    }
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.get(
      urlString,
      { headers: { 'User-Agent': BROWSER_UA, Accept: '*/*', ...headers } },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const next = new URL(res.headers.location, urlString).href;
          httpGetRaw(next, { headers, timeoutMs, maxBytes, depth: depth + 1 }).then(resolve, reject);
          return;
        }
        const chunks = [];
        let size = 0;
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > maxBytes) {
            res.destroy();
            reject(new Error('Response too large'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () =>
          resolve({ statusCode: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }),
        );
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('Request timed out'));
    });
    req.on('error', reject);
  });

const getJson = async (urlString, headers) => {
  const res = await httpGetRaw(urlString, { headers });
  if (res.statusCode !== 200) {
    throw new Error(`HTTP ${res.statusCode}`);
  }
  return JSON.parse(res.body.toString('utf8'));
};

const getText = async (urlString, headers) => {
  const res = await httpGetRaw(urlString, { headers });
  if (res.statusCode !== 200) {
    throw new Error(`HTTP ${res.statusCode}`);
  }
  return res.body.toString('utf8');
};

/**
 * Downloads a candidate image. Unlike the search calls above this one follows redirects
 * with the SSRF guard re-applied at every hop — a public hostname is free to 302 to
 * http://127.0.0.1 otherwise.
 */
const downloadImage = async (urlString, depth = 0) => {
  if (depth > 5) throw new ApiError(httpStatus.BAD_GATEWAY, 'Too many redirects while downloading the image.');
  const parsed = await assertFetchableUrl(urlString);
  const lib = parsed.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = lib.get(
      urlString,
      { headers: { 'User-Agent': BROWSER_UA, Accept: 'image/*,*/*;q=0.8' } },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          downloadImage(new URL(res.headers.location, urlString).href, depth + 1).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new ApiError(httpStatus.BAD_GATEWAY, `Could not download image (HTTP ${res.statusCode})`));
          return;
        }
        const chunks = [];
        let size = 0;
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > DOWNLOAD_MAX_BYTES) {
            res.destroy();
            reject(new ApiError(httpStatus.BAD_REQUEST, 'That image is larger than 8MB.'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType: res.headers['content-type'] || '' }));
      },
    );
    req.setTimeout(15000, () => req.destroy(new ApiError(httpStatus.GATEWAY_TIMEOUT, 'Downloading that image timed out.')));
    req.on('error', reject);
  });
};

/**
 * Content-type headers lie (and can be omitted entirely by image CDNs), so the real
 * check is the file's own magic bytes — this is what stops an HTML error page or a
 * disguised payload being pushed into Cloudinary as if it were a product photo.
 */
const sniffImageFormat = (buffer) => {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG') return 'png';
  if (buffer.toString('ascii', 0, 3) === 'GIF') return 'gif';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buffer.toString('ascii', 4, 12) === 'ftypavif') return 'avif';
  return null;
};

/* ------------------------------------------------------------------ *
 * Result tokens
 * ------------------------------------------------------------------ */

/**
 * Every search result is handed back with a short HMAC over its URL. The import
 * endpoint accepts an untokened URL too (so a user can paste a link they found
 * themselves, which still goes through assertFetchableUrl), but a tokened one proves
 * this server produced it and skips straight past any doubt about where it came from.
 */
const signUrl = (url) =>
  crypto.createHmac('sha256', config.jwt.secret).update(`webimg:${url}`).digest('base64url').slice(0, 32);

const verifyUrlToken = (url, token) => {
  if (!token) return false;
  const expected = signUrl(url);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(token));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/* ------------------------------------------------------------------ *
 * Providers
 * ------------------------------------------------------------------ */

const clean = (value) => String(value || '').trim();

const makeResult = ({ provider, url, thumbUrl, width, height, title, sourceUrl, author, exactMatch = false }) => {
  const full = clean(url);
  if (!full || !/^https?:\/\//i.test(full)) return null;
  return {
    id: crypto.createHash('sha1').update(full).digest('hex').slice(0, 16),
    provider,
    url: full,
    thumbUrl: clean(thumbUrl) || full,
    width: Number(width) || null,
    height: Number(height) || null,
    title: clean(title).slice(0, 160),
    sourceUrl: clean(sourceUrl),
    author: clean(author).slice(0, 80),
    exactMatch,
    token: signUrl(full),
  };
};

/**
 * Open Food Facts — a free, keyless, community barcode database. Covers groceries,
 * drinks, household goods and cosmetics extremely well, which is most of what a general
 * store scans. Returns the actual packaging photo for that exact barcode.
 */
const searchOpenFoodFacts = async ({ barcode }) => {
  if (!barcode) return [];
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,brands,image_url,selected_images`;
  const json = await getJson(url, { Accept: 'application/json' });
  if (!json || json.status !== 1 || !json.product) return [];
  const product = json.product;
  const title = [clean(product.brands).split(',')[0], clean(product.product_name)].filter(Boolean).join(' ');

  const urls = [];
  const selected = product.selected_images || {};
  Object.keys(selected).forEach((kind) => {
    const display = selected[kind]?.display || {};
    const thumb = selected[kind]?.thumb || {};
    Object.keys(display).forEach((lang) => {
      urls.push({ url: display[lang], thumbUrl: thumb[lang] });
    });
  });
  if (product.image_url) urls.push({ url: product.image_url, thumbUrl: product.image_url });

  return urls
    .map((entry) =>
      makeResult({
        provider: 'openfoodfacts',
        url: entry.url,
        thumbUrl: entry.thumbUrl,
        title: title || 'Product packaging',
        sourceUrl: `https://world.openfoodfacts.org/product/${barcode}`,
        exactMatch: true,
      }),
    )
    .filter(Boolean);
};

/**
 * UPCitemdb's keyless trial tier — general merchandise (electronics, phones,
 * accessories), where Open Food Facts has nothing. Rate limited per IP, so a 429 here
 * is routine and must stay non-fatal.
 */
const searchUpcItemDb = async ({ barcode }) => {
  if (!barcode) return [];
  const json = await getJson(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`, {
    Accept: 'application/json',
  });
  const items = Array.isArray(json?.items) ? json.items : [];
  const out = [];
  items.forEach((item) => {
    const title = [clean(item.brand), clean(item.title)].filter(Boolean).join(' ');
    (Array.isArray(item.images) ? item.images : []).forEach((imageUrl) => {
      const result = makeResult({
        provider: 'upcitemdb',
        url: imageUrl,
        title: title || clean(item.title),
        sourceUrl: `https://www.upcitemdb.com/upc/${barcode}`,
        exactMatch: true,
      });
      if (result) out.push(result);
    });
  });
  return out;
};

/**
 * Google Programmable Search (image mode) — by far the best name-based results, and the
 * one provider worth configuring a key for (100 free queries/day). Needs both
 * GOOGLE_CSE_API_KEY and GOOGLE_CSE_CX with "Image search" + "Search the entire web"
 * enabled on the engine.
 */
const searchGoogleCse = async ({ query, page, perPage }) => {
  const { apiKey, cx } = config.googleCse || {};
  if (!apiKey || !cx || !query) return [];
  // The API caps `num` at 10 and `start` at 91, so paging past result 100 is impossible
  // by design rather than by our choice.
  const num = Math.min(10, perPage);
  const start = Math.min(91, (page - 1) * num + 1);
  const url =
    `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(apiKey)}&cx=${encodeURIComponent(cx)}` +
    `&searchType=image&safe=active&num=${num}&start=${start}&q=${encodeURIComponent(query)}`;
  const json = await getJson(url, { Accept: 'application/json' });
  return (json?.items || [])
    .map((item) =>
      makeResult({
        provider: 'google',
        url: item.link,
        thumbUrl: item.image?.thumbnailLink,
        width: item.image?.width,
        height: item.image?.height,
        title: item.title,
        sourceUrl: item.image?.contextLink || item.displayLink,
      }),
    )
    .filter(Boolean);
};

/**
 * DuckDuckGo images — keyless, and therefore what actually runs for a shop that has
 * configured nothing. It is an undocumented endpoint (fetch a `vqd` token from the HTML
 * page, then call i.js with it), so treat every failure as "this provider is
 * unavailable today" and let the ranked results from the other providers stand.
 */
const searchDuckDuckGo = async ({ query, page }) => {
  if (!query) return [];
  const q = encodeURIComponent(query);
  const html = await getText(`https://duckduckgo.com/?q=${q}&iax=images&ia=images`, {
    Accept: 'text/html,application/xhtml+xml',
  });
  const vqd =
    html.match(/vqd=["']([^"']+)["']/)?.[1] ||
    html.match(/vqd=([\d-]+)&/)?.[1];
  if (!vqd) throw new Error('Could not obtain a DuckDuckGo search token');

  const offset = (page - 1) * 50;
  const json = await getJson(
    `https://duckduckgo.com/i.js?l=us-en&o=json&q=${q}&vqd=${encodeURIComponent(vqd)}&f=,,,&p=1&s=${offset}`,
    { Accept: 'application/json', Referer: `https://duckduckgo.com/?q=${q}&iax=images&ia=images` },
  );
  return (json?.results || [])
    .map((item) =>
      makeResult({
        provider: 'duckduckgo',
        url: item.image,
        thumbUrl: item.thumbnail,
        width: item.width,
        height: item.height,
        title: item.title,
        sourceUrl: item.url,
        author: item.source,
      }),
    )
    .filter(Boolean);
};

/**
 * Openverse (the WordPress Foundation's openly-licensed media search) — keyless, stable,
 * and aggregates Flickr, Wikimedia, museums and more. This is the workhorse name-based
 * provider when no Google key is configured and DuckDuckGo is refusing requests.
 */
const searchOpenverse = async ({ query, page, perPage }) => {
  if (!query) return [];
  const url =
    `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}` +
    `&page_size=${Math.min(20, perPage)}&page=${Math.min(20, page)}&mature=false`;
  const json = await getJson(url, { Accept: 'application/json' });
  return (json?.results || [])
    // Never offer something that cannot actually be imported: the download cap would
    // reject it after the user picked it, which is a worse experience than not showing it.
    .filter((item) => !item.filesize || item.filesize <= DOWNLOAD_MAX_BYTES)
    .map((item) =>
      makeResult({
        provider: 'openverse',
        url: item.url,
        thumbUrl: item.thumbnail,
        width: item.width,
        height: item.height,
        title: item.title,
        sourceUrl: item.foreign_landing_url,
        author: item.creator,
      }),
    )
    .filter(Boolean);
};

/** Wikimedia Commons — keyless, freely licensed, strong on brands and generic goods. */
const searchWikimedia = async ({ query, perPage }) => {
  if (!query) return [];
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*' +
    `&generator=search&gsrnamespace=6&gsrlimit=${Math.min(20, perPage)}&gsrsearch=${encodeURIComponent(query)}` +
    '&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=400';
  const json = await getJson(url, { Accept: 'application/json' });
  const pages = json?.query?.pages || {};
  return Object.values(pages)
    .map((entry) => {
      const info = entry.imageinfo?.[0];
      if (!info || !/\.(jpe?g|png|webp|gif)$/i.test(info.url || '')) return null;
      return makeResult({
        provider: 'wikimedia',
        url: info.url,
        thumbUrl: info.thumburl,
        width: info.width,
        height: info.height,
        title: clean(entry.title).replace(/^File:/, ''),
        sourceUrl: info.descriptionurl,
        author: info.extmetadata?.Artist?.value?.replace(/<[^>]+>/g, ''),
      });
    })
    .filter(Boolean);
};

/** Pexels — stock photography. Generic but always presentable; last in the ranking. */
const searchPexels = async ({ query, page, perPage }) => {
  const apiKey = config.pexels?.apiKey;
  if (!apiKey || !clean(apiKey) || !query) return [];
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${Math.min(30, perPage)}&page=${page}`;
  const json = await getJson(url, { Authorization: apiKey, Accept: 'application/json' });
  return (json?.photos || [])
    .map((photo) =>
      makeResult({
        provider: 'pexels',
        url: photo.src?.large2x || photo.src?.large || photo.src?.original,
        thumbUrl: photo.src?.medium || photo.src?.small,
        width: photo.width,
        height: photo.height,
        title: photo.alt,
        sourceUrl: photo.url,
        author: photo.photographer,
      }),
    )
    .filter(Boolean);
};

// Ordered worst-to-best so the score below can just read the index: a barcode hit is the
// real product, a web hit is probably the real product, a stock photo is a stand-in.
const PROVIDER_RANK = ['pexels', 'openverse', 'wikimedia', 'duckduckgo', 'upcitemdb', 'google', 'openfoodfacts'];

const PROVIDER_LABELS = {
  openfoodfacts: 'Barcode match',
  upcitemdb: 'Barcode match',
  google: 'Web',
  duckduckgo: 'Web',
  wikimedia: 'Wikimedia',
  openverse: 'Open licence',
  pexels: 'Stock photo',
};

const PROVIDER_DEFS = [
  { key: 'openfoodfacts', run: searchOpenFoodFacts, needs: 'barcode', configured: () => true },
  { key: 'upcitemdb', run: searchUpcItemDb, needs: 'barcode', configured: () => true },
  { key: 'google', run: searchGoogleCse, needs: 'query', configured: () => Boolean(config.googleCse?.apiKey && config.googleCse?.cx) },
  { key: 'duckduckgo', run: searchDuckDuckGo, needs: 'query', configured: () => true },
  { key: 'openverse', run: searchOpenverse, needs: 'query', configured: () => true },
  { key: 'wikimedia', run: searchWikimedia, needs: 'query', configured: () => true },
  { key: 'pexels', run: searchPexels, needs: 'query', configured: () => Boolean(clean(config.pexels?.apiKey)) },
];

/**
 * Ranks a candidate. Deliberately simple and explainable — provider tier dominates,
 * then "is this shaped like a product shot" (roughly square, decently sized), because a
 * 1600x400 banner crop looks wrong in every grid, list row and receipt this app renders
 * a product image into.
 */
const scoreResult = (result) => {
  let score = PROVIDER_RANK.indexOf(result.provider) * 100;
  if (result.exactMatch) score += 400;

  const { width, height } = result;
  if (width && height) {
    const pixels = width * height;
    if (pixels >= 250000) score += 40; // >= ~500x500
    else if (pixels >= 90000) score += 20;
    else if (pixels < 10000) score -= 60; // thumbnail-sized, will look blurry

    const ratio = width > height ? width / height : height / width;
    if (ratio <= 1.1) score += 30;
    else if (ratio <= 1.5) score += 15;
    else if (ratio > 2.5) score -= 40;
  }
  // A transparent-background PNG is almost always a clean catalog cut-out.
  if (/\.png(\?|$)/i.test(result.url)) score += 10;
  return score;
};

/** Same image served from two CDN paths is still one image to a human picking photos. */
const dedupeKey = (result) => {
  try {
    const parsed = new URL(result.url);
    return `${parsed.hostname}${parsed.pathname}`.toLowerCase();
  } catch (e) {
    return result.url.toLowerCase();
  }
};

/**
 * Runs every applicable provider in parallel and merges the results.
 *
 * @param {{ query?: string, barcode?: string, page?: number, perPage?: number, providers?: string[] }} params
 * @returns {Promise<{ results: object[], providers: object[], page: number, hasMore: boolean }>}
 */
const search = async ({ query, barcode, page = 1, perPage = 24, providers: only } = {}) => {
  const q = clean(query).slice(0, 200);
  // Barcodes are digits (EAN/UPC/ITF); anything else the user typed into that box is a
  // search term, not a code, and pretending otherwise just burns two provider calls.
  const code = clean(barcode).replace(/\s+/g, '');
  const isBarcode = /^[0-9]{6,20}$/.test(code);

  if (!q && !isBarcode) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Enter a product name or a barcode to search for images.');
  }

  const wanted = Array.isArray(only) && only.length ? new Set(only) : null;
  const active = PROVIDER_DEFS.filter((def) => {
    if (wanted && !wanted.has(def.key)) return false;
    if (def.needs === 'barcode' && !isBarcode) return false;
    if (def.needs === 'query' && !q) return false;
    return true;
  });

  const settled = await Promise.all(
    active.map(async (def) => {
      if (!def.configured()) {
        return { key: def.key, status: 'not_configured', count: 0, results: [] };
      }
      try {
        const results = await def.run({ query: q, barcode: code, page, perPage });
        return { key: def.key, status: 'ok', count: results.length, results };
      } catch (e) {
        logger.warn(`[webImageSearch] provider ${def.key} failed: ${e.message}`);
        return { key: def.key, status: 'failed', count: 0, results: [], error: e.message };
      }
    }),
  );

  const seen = new Set();
  const merged = [];
  settled.forEach((entry) => {
    entry.results.forEach((result) => {
      const key = dedupeKey(result);
      if (seen.has(key)) return;
      seen.add(key);
      merged.push({ ...result, providerLabel: PROVIDER_LABELS[result.provider] || result.provider });
    });
  });

  merged.sort((a, b) => scoreResult(b) - scoreResult(a));

  return {
    results: merged.slice(0, perPage * 2),
    providers: settled.map(({ key, status, count, error }) => ({
      key,
      label: PROVIDER_LABELS[key] || key,
      status,
      count,
      ...(error ? { error } : {}),
    })),
    page,
    // Barcode providers return their whole (small) answer at once; only the paged
    // name-based providers can have another page behind them.
    hasMore: merged.length >= perPage && Boolean(q),
  };
};

/**
 * Downloads and stores the images the user selected.
 *
 * Failures are per-image and reported rather than thrown: picking six photos and losing
 * the lot because one CDN 404'd is a worse outcome than saving five and saying so.
 *
 * @param {{ items: object[], context?: string, publicIdPrefix?: string }} params
 * @returns {Promise<{ images: object[], failures: object[] }>}
 */
const importImages = async ({ items, context = 'product', publicIdPrefix = 'product' }) => {
  const list = (Array.isArray(items) ? items : []).slice(0, MAX_IMPORT_PER_REQUEST);
  if (!list.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Select at least one image to add.');
  }
  const folder = FOLDERS[context] || FOLDERS.product;

  const settled = await Promise.all(
    list.map(async (item, index) => {
      const url = clean(item?.url);
      try {
        if (!url) throw new ApiError(httpStatus.BAD_REQUEST, 'Missing image URL.');
        // A token proves we produced this URL; without one the SSRF guard inside
        // downloadImage is what makes a hand-pasted link safe to fetch.
        const trusted = verifyUrlToken(url, item?.token);

        const { buffer } = await downloadImage(url);
        const format = sniffImageFormat(buffer);
        if (!format) {
          throw new ApiError(httpStatus.BAD_REQUEST, 'That link is not an image file.');
        }

        const uploaded = await uploadToCloudinary(buffer, {
          folder,
          public_id: `${publicIdPrefix}_web_${Date.now()}_${index}`,
        });

        return {
          ok: true,
          image: {
            url: uploaded.secure_url,
            publicId: uploaded.public_id,
            width: uploaded.width,
            height: uploaded.height,
            source: clean(item?.provider) || (trusted ? 'web' : 'url'),
            sourceUrl: clean(item?.sourceUrl),
          },
        };
      } catch (e) {
        logger.warn(`[webImageSearch] import failed for ${url}: ${e.message}`);
        return { ok: false, failure: { url, message: e.message || 'Could not add this image.' } };
      }
    }),
  );

  const images = settled.filter((r) => r.ok).map((r) => r.image);
  const failures = settled.filter((r) => !r.ok).map((r) => r.failure);

  if (!images.length) {
    throw new ApiError(
      httpStatus.BAD_GATEWAY,
      failures[0]?.message || 'None of the selected images could be added. Try different ones.',
    );
  }

  return { images, failures };
};

module.exports = {
  search,
  importImages,
  MAX_IMPORT_PER_REQUEST,
  // exported for tests
  isBlockedAddress,
  sniffImageFormat,
  scoreResult,
};
