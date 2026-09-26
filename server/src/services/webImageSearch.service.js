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

// Some search engines fingerprint the TLS handshake, not the headers: Node's default
// cipher order is recognisably "a script", and Yandex answers it with a captcha redirect
// on every request whatever the User-Agent says. The same request offering ciphers in
// the order a browser does is served normally (verified 4/4 each way, 2026-09-26).
const BROWSER_CIPHERS = [
  'TLS_AES_128_GCM_SHA256',
  'TLS_AES_256_GCM_SHA384',
  'TLS_CHACHA20_POLY1305_SHA256',
  'ECDHE-ECDSA-AES128-GCM-SHA256',
  'ECDHE-RSA-AES128-GCM-SHA256',
  'ECDHE-ECDSA-AES256-GCM-SHA384',
  'ECDHE-RSA-AES256-GCM-SHA384',
  'ECDHE-ECDSA-CHACHA20-POLY1305',
  'ECDHE-RSA-CHACHA20-POLY1305',
  'ECDHE-RSA-AES128-SHA',
  'ECDHE-RSA-AES256-SHA',
  'AES128-GCM-SHA256',
  'AES256-GCM-SHA384',
  'AES128-SHA',
  'AES256-SHA',
].join(':');
const browserTlsAgent = new https.Agent({ keepAlive: true, maxSockets: 8, ciphers: BROWSER_CIPHERS });

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

const httpGetRaw = (
  urlString,
  { headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = 2 * 1024 * 1024, depth = 0, browserTls = false } = {},
) =>
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
      {
        headers: { 'User-Agent': BROWSER_UA, Accept: '*/*', ...headers },
        ...(browserTls && lib === https ? { agent: browserTlsAgent } : {}),
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const next = new URL(res.headers.location, urlString).href;
          httpGetRaw(next, { headers, timeoutMs, maxBytes, depth: depth + 1, browserTls }).then(resolve, reject);
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

const IMPORT_MAX_EDGE = 1600;
const RACE_STAGGER_MS = 2500;

/**
 * Downloads the first candidate that yields a real image, "happy eyeballs" style: the
 * first `initial` start at once (CDN copy + original — neither is reliably faster: the
 * CDN costs a steady ~0.4s, an origin anywhere from 0.1s to 28s), and each further one
 * starts when a running one fails or all have been silent for RACE_STAGGER_MS. So a slow
 * origin can no longer hold the dialog for 15s per mirror in sequence, and the mirrors
 * are only touched when both front-runners are in trouble.
 */
const raceDownloads = (candidates, initial = 2) =>
  new Promise((resolve, reject) => {
    let next = 0;
    let running = 0;
    let settled = false;
    let lastError = null;
    let timer = null;

    const launch = () => {
      clearTimeout(timer);
      if (settled || next >= candidates.length) {
        if (!settled && running === 0) {
          settled = true;
          reject(lastError || new ApiError(httpStatus.BAD_GATEWAY, 'Could not download image.'));
        }
        return;
      }
      const candidate = candidates[next];
      next += 1;
      running += 1;
      downloadImage(candidate)
        .then(({ buffer }) => {
          if (!sniffImageFormat(buffer)) throw new ApiError(httpStatus.BAD_REQUEST, 'That link is not an image file.');
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(buffer);
          }
        })
        .catch((e) => {
          lastError = e;
        })
        .finally(() => {
          running -= 1;
          if (!settled) launch();
        });
      timer = setTimeout(launch, RACE_STAGGER_MS);
    };
    for (let i = 0; i < Math.max(1, initial); i += 1) launch();
  });

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

/**
 * A resized copy of a remote image through a caching image CDN (wsrv.nl by default).
 *
 * Why: web originals live on whatever host the shop used — a 70KB photo on a far-away
 * WordPress box measured 7–28s to arrive, while the same image via the CDN took
 * 0.6–2s cold and ~0.65s warm, at a third of the bytes (2026-09-26). The CDN fetches
 * from its own well-connected network, so the SSRF concern stays with them, not us.
 * `we` = never enlarge; no `output` keeps the source format (PNG transparency survives).
 * Returns '' when disabled (WEB_IMAGE_PROXY=off) so callers fall back to the original.
 */
const proxiedImageUrl = (url, size, extra = '') => {
  const base = clean(config.webImageProxy).replace(/\/+$/, '');
  if (!base || !/^https?:\/\//i.test(clean(url))) return '';
  return `${base}/?url=${encodeURIComponent(clean(url))}&w=${size}&h=${size}&fit=inside&we${extra}`;
};

const makeResult = ({ provider, url, thumbUrl, width, height, title, sourceUrl, author, exactMatch = false, mirrors = [] }) => {
  const full = clean(url);
  if (!full || !/^https?:\/\//i.test(full)) return null;
  // Other copies of the *same* image on other hosts. Web originals are often
  // hotlink-protected or gone by the time the user presses Add, so the import walks
  // these in order before giving up. Each is signed like the main URL.
  const mirrorList = [...new Set(mirrors.map(clean))]
    .filter((m) => m !== full && /^https?:\/\//i.test(m))
    .slice(0, 4)
    .map((m) => ({ url: m, token: signUrl(m) }));
  const thumb = clean(thumbUrl);
  return {
    id: crypto.createHash('sha1').update(full).digest('hex').slice(0, 16),
    provider,
    url: full,
    // A provider that has no thumbnail would otherwise make the grid download the
    // full-size original for a 200px tile.
    thumbUrl: thumb && thumb !== full ? thumb : proxiedImageUrl(full, 400, '&output=webp&q=80') || full,
    // What the full-size viewer shows first: big enough to judge the photo, small and
    // CDN-served so it appears in about a second instead of however long the origin takes.
    previewUrl: proxiedImageUrl(full, 1200, '&output=webp&q=85'),
    width: Number(width) || null,
    height: Number(height) || null,
    title: clean(title).slice(0, 160),
    sourceUrl: clean(sourceUrl),
    author: clean(author).slice(0, 80),
    exactMatch,
    token: signUrl(full),
    mirrors: mirrorList,
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

/** Decodes the HTML entities a JSON blob picks up when it is embedded in an attribute. */
const decodeEntities = (text) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|quot|amp|lt|gt|apos|nbsp);/gi, (match, entity) => {
    const lower = entity.toLowerCase();
    if (lower[0] === '#') {
      const code = lower[1] === 'x' ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", nbsp: ' ' }[lower];
  });

const absoluteUrl = (value) => {
  const v = clean(value);
  return v.startsWith('//') ? `https:${v}` : v;
};

/**
 * Pulls the result list out of a Yandex Images page. The page ships its whole state as
 * JSON in a `data-state` attribute; `serpList.items` holds one entity per image with the
 * original URL, its real size, the page it came from, and `dups` — the same picture
 * found on other hosts, which is what makes a hotlink-blocked original still importable.
 */
const parseYandexImages = (html) => {
  const blocks = html.match(/data-state="[^"]*serpList[^"]*"/g) || [];
  for (const block of blocks) {
    let state;
    try {
      state = JSON.parse(decodeEntities(block.slice('data-state="'.length, -1)));
    } catch (e) {
      continue; // eslint-disable-line no-continue
    }
    const items = state?.initialState?.serpList?.items;
    const entities = items?.entities;
    if (entities && typeof entities === 'object') {
      const order = Array.isArray(items.keys) && items.keys.length ? items.keys : Object.keys(entities);
      return order.map((key) => entities[key]).filter(Boolean);
    }
  }
  return null;
};

/**
 * Yandex Images — the keyless *web* image search that actually answers a server.
 * Measured 2026-09-26 from this machine: Google serves "browser not supported" to any
 * non-JS client, Bing's async endpoint returns random decoy images (garden hoses for a
 * car charger), DuckDuckGo's i.js answers 403, Brave/Qwant/Startpage/Mojeek captcha.
 * Yandex returned the manufacturer's own product shot as result #1, which is the whole
 * point of "Find from web" for a shop catalog. Undocumented page, so any change in its
 * shape surfaces as "provider unavailable", never a broken dialog.
 */
const searchYandex = async ({ query, page }) => {
  if (!query) return [];
  const url =
    `https://yandex.com/images/search?text=${encodeURIComponent(query)}` +
    `&p=${Math.max(0, page - 1)}`;
  const res = await httpGetRaw(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    maxBytes: 6 * 1024 * 1024,
    timeoutMs: 10000,
    browserTls: true,
  });
  if (res.statusCode !== 200) throw new Error(`HTTP ${res.statusCode}`);
  const html = res.body.toString('utf8');
  const entities = parseYandexImages(html);
  if (!entities) {
    throw new Error(/captcha/i.test(html) ? 'Yandex asked for a captcha' : 'Unrecognised Yandex results page');
  }

  return entities
    .filter((item) => item && !item.censored && item.origUrl)
    .map((item) => {
      const viewer = item.viewerData || {};
      const snippet = item.snippet || viewer.snippet || {};
      // Biggest copies first: a mirror is only useful if it is at least as good.
      const mirrors = [...(viewer.dups || []), ...(viewer.preview || [])]
        .filter((d) => d && d.url && (!d.fileSizeInBytes || d.fileSizeInBytes <= DOWNLOAD_MAX_BYTES))
        .sort((a, b) => (b.w || 0) * (b.h || 0) - (a.w || 0) * (a.h || 0))
        .map((d) => d.url);
      return makeResult({
        provider: 'yandex',
        url: item.origUrl,
        // Yandex's own thumbnail always loads; the original host may refuse hotlinks.
        thumbUrl: absoluteUrl(item.image || viewer.thumb?.url) || item.origUrl,
        width: item.origWidth || item.width,
        height: item.origHeight || item.height,
        title: clean(snippet.title || item.alt).replace(/<[^>]+>/g, ''),
        sourceUrl: snippet.url,
        author: snippet.domain,
        mirrors,
      });
    })
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

// How much a provider's hit is worth before relevance is considered: a barcode hit is
// the real product, a web hit is usually a photo of the product someone is selling,
// an open-licence/stock photo is at best a stand-in.
const PROVIDER_TIER = {
  openfoodfacts: 120,
  upcitemdb: 110,
  google: 90,
  yandex: 80,
  duckduckgo: 80,
  wikimedia: 20,
  openverse: 10,
  pexels: 0,
};

// Stock/open-licence libraries match keywords against photo captions, so "car charger"
// returns an electric car at a charging station. They must clear a much higher
// relevance bar than a web engine, whose results are already about the query.
const LOOSE_PROVIDERS = new Set(['openverse', 'wikimedia', 'pexels']);
const MIN_RELEVANCE_WEB = 0.25;
const MIN_RELEVANCE_LOOSE = 0.5;

const PROVIDER_LABELS = {
  openfoodfacts: 'Barcode match',
  upcitemdb: 'Barcode match',
  google: 'Google',
  yandex: 'Web',
  duckduckgo: 'DuckDuckGo',
  wikimedia: 'Wikimedia',
  openverse: 'Open licence',
  pexels: 'Stock photo',
};

const PROVIDER_DEFS = [
  { key: 'openfoodfacts', run: searchOpenFoodFacts, needs: 'barcode', configured: () => true },
  { key: 'upcitemdb', run: searchUpcItemDb, needs: 'barcode', configured: () => true },
  { key: 'google', run: searchGoogleCse, needs: 'query', configured: () => Boolean(config.googleCse?.apiKey && config.googleCse?.cx) },
  { key: 'yandex', run: searchYandex, needs: 'query', configured: () => true },
  { key: 'duckduckgo', run: searchDuckDuckGo, needs: 'query', configured: () => true },
  { key: 'openverse', run: searchOpenverse, needs: 'query', configured: () => true },
  { key: 'wikimedia', run: searchWikimedia, needs: 'query', configured: () => true },
  { key: 'pexels', run: searchPexels, needs: 'query', configured: () => Boolean(clean(config.pexels?.apiKey)) },
];

/* ------------------------------------------------------------------ *
 * Relevance
 * ------------------------------------------------------------------ */

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'with', 'of', 'in', 'on', 'to', 'by', 'from',
  'new', 'original', 'genuine', 'pcs', 'pc', 'pack', 'piece', 'set', 'buy', 'best', 'price',
]);

const words = (text) => String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

// A number followed by a unit is a spec shared by many products ("128gb", "40w",
// "950g"), not a model code, however much it looks like one.
const SPEC_TERM = /^\d+(gb|tb|mb|kb|w|kw|mah|ah|v|a|ml|l|ltr|kg|g|gm|mg|mm|cm|m|hz|khz|mhz|ghz|in|inch|mp|pcs|pc|x|p|k)$/;

/**
 * Splits a query into weighted terms. A model code ("A2724", "A15", "SM-A155F" →
 * "a155f") is what tells one product from its siblings, so it outweighs everything; a
 * spec or bare number ("40w", "128gb", "15") comes next; plain words ("car",
 * "charger") are the weakest evidence because every neighbouring product shares them.
 */
const queryTerms = (query) =>
  [...new Set(words(query))]
    .filter((w) => !STOPWORDS.has(w) && (w.length >= 2 || /\d/.test(w)))
    .map((term) => {
      const hasDigit = /\d/.test(term);
      const hasLetter = /[a-z]/.test(term);
      let weight = 1;
      if (hasDigit && hasLetter && !SPEC_TERM.test(term)) weight = 8;
      else if (hasDigit) weight = 2;
      return { term, weight };
    });

const safeDecode = (value) => {
  try {
    return decodeURIComponent(value);
  } catch (e) {
    return value;
  }
};

/**
 * 0..1 — the weighted share of query terms found in what we know about a candidate:
 * its title, the page it came from, and the image file name (manufacturers name files
 * after the SKU, e.g. A2724013_ND01.png). Matching is on whole words, plus a squashed
 * form for longer terms so "USB-C" satisfies "usbc" and "A2724013" satisfies "a2724".
 */
const relevanceOf = (result, terms) => {
  if (!terms.length) return 1;
  const haystack = [result.title, safeDecode(result.sourceUrl), safeDecode(result.url), result.author].join(' ');
  const wordSet = new Set(words(haystack));
  const squashed = words(haystack).join('');
  let total = 0;
  let matched = 0;
  terms.forEach(({ term, weight }) => {
    total += weight;
    // Squashed matching only for long or numeric terms: "car" must not match "cardigan".
    if (wordSet.has(term) || ((term.length >= 4 || /\d/.test(term)) && squashed.includes(term))) {
      matched += weight;
    }
  });
  return total ? matched / total : 1;
};

/**
 * Ranks a candidate. Deliberately simple and explainable — a barcode hit first, then
 * how well it matches what was typed, then the provider tier, then "is this shaped like
 * a product shot" (roughly square, decently sized), because a 1600x400 banner crop looks
 * wrong in every grid, list row and receipt this app renders a product image into.
 */
const scoreResult = (result) => {
  let score = PROVIDER_TIER[result.provider] || 0;
  if (result.exactMatch) score += 1000;
  if (typeof result.relevance === 'number') score += Math.round(result.relevance * 500);

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

  const terms = queryTerms(q);
  const seen = new Set();
  const merged = [];
  settled.forEach((entry) => {
    entry.results.forEach((result) => {
      const key = dedupeKey(result);
      if (seen.has(key)) return;
      seen.add(key);
      merged.push({
        ...result,
        providerLabel: PROVIDER_LABELS[result.provider] || result.provider,
        relevance: Math.round(relevanceOf(result, terms) * 100) / 100,
      });
    });
  });

  // Drop what is clearly about something else rather than padding the grid with it —
  // a picker full of unrelated photos is worse than a short one.
  const passes = (r) =>
    r.exactMatch || r.relevance >= (LOOSE_PROVIDERS.has(r.provider) ? MIN_RELEVANCE_LOOSE : MIN_RELEVANCE_WEB);
  let kept = merged.filter(passes);
  // Nothing matched well (unusual local product, or every web source down): show the
  // partial matches, flagged, instead of an empty grid — but never zero-overlap ones.
  const looseMatches = !kept.length && merged.some((r) => r.relevance > 0);
  if (looseMatches) kept = merged.filter((r) => r.relevance > 0);

  kept.sort((a, b) => scoreResult(b) - scoreResult(a));

  return {
    results: kept.slice(0, perPage * 2),
    looseMatches,
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

        // The same picture from several places: a CDN-resized copy of the original
        // (fast, capped at 1600px — plenty for a product photo), the original itself, then
        // mirrors on other hosts. Every candidate still goes through the SSRF guard.
        const originals = [url, ...(Array.isArray(item?.mirrors) ? item.mirrors : []).map((m) => clean(m?.url))]
          .filter(Boolean)
          .slice(0, 5);
        const candidates = [proxiedImageUrl(url, IMPORT_MAX_EDGE), ...originals].filter(Boolean);
        const buffer = await raceDownloads(candidates);
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
  queryTerms,
  relevanceOf,
  parseYandexImages,
  proxiedImageUrl,
  raceDownloads,
};
