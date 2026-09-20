const httpStatus = require('http-status');
const fs = require('fs');
const ApiError = require('../utils/ApiError');
const { Product, PriceCheckerSource, PriceCheckSnapshot } = require('../models');

// Same lazy-import trick as services/whatsapp/invoicePdf.service.js: puppeteer-core
// ships ESM-only (no CommonJS build) as of v25, so a top-level require() would crash
// this whole require chain on any Node version without native require(esm) support.
// Kept as its own copy here rather than a shared util — this repo has no shared code
// between similar features, see erp_architecture_patterns memory / the plan for this
// module.
let puppeteerModulePromise = null;
function getPuppeteerModule() {
  if (!puppeteerModulePromise) {
    puppeteerModulePromise = import('puppeteer-core');
  }
  return puppeteerModulePromise;
}

const CANDIDATE_PATHS = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
];

function resolveExecutablePath() {
  const found = CANDIDATE_PATHS.find((p) => p && fs.existsSync(p));
  if (!found) {
    throw new Error(
      'No Chrome/Chromium binary found for Price Checker. Set PUPPETEER_EXECUTABLE_PATH to an installed browser.',
    );
  }
  return found;
}

let sharedBrowser = null;

async function getBrowser() {
  // puppeteer-core v25 renamed Browser#isConnected() to a `connected` boolean property —
  // calling the old method throws "isConnected is not a function" on every check after
  // the browser is first launched. Caught by testing this service directly against a
  // local fixture server rather than assuming the copied invoicePdf.service.js pattern
  // was still correct for the version actually installed.
  if (!sharedBrowser || !sharedBrowser.connected) {
    const puppeteer = await getPuppeteerModule();
    sharedBrowser = await puppeteer.launch({
      headless: true,
      executablePath: resolveExecutablePath(),
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return sharedBrowser;
}

const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
// 30s, not the original 15s: a real storefront (a4tech.com.pk) measured ~19s just to reach
// domcontentloaded from this server, so 15-20s produced false "Navigation timeout" errors on
// a site that was working fine. Each competitor card loads independently (own skeleton,
// concurrency-limited, results cached 30 min), so a slow site never blocks the rest of the page.
const NAVIGATION_TIMEOUT_MS = 30000;
const SELECTOR_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 30 * 60 * 1000;

/** Turns a raw Puppeteer/network error into something a shop owner can actually make
 * sense of — "Navigation timeout of 15000 ms exceeded" or a bare "net::ERR_*" code
 * means nothing to a non-technical admin looking at a result card. */
function describeNavigationError(error) {
  const message = error?.message || '';
  if (message.includes('timeout')) return 'This site took too long to respond. Try refreshing in a moment.';
  if (message.includes('net::ERR_NAME_NOT_RESOLVED')) return "This site's address could not be found — check the Search URL.";
  if (message.includes('net::ERR_CONNECTION_REFUSED') || message.includes('net::ERR_CONNECTION_TIMED_OUT')) {
    return 'Could not connect to this site — it may be down.';
  }
  return message || 'Failed to fetch this site';
}

/**
 * Caps how many competitor pages are open in the shared headless browser at once —
 * without this, an org with a dozen configured sources would fire a dozen simultaneous
 * page.goto() calls the moment someone runs a price check. Deliberately a tiny hand-rolled
 * queue (no new dependency) shared across every request in this process.
 */
function createLimiter(concurrency) {
  let active = 0;
  const queue = [];
  const runNext = () => {
    if (active >= concurrency || queue.length === 0) return;
    active += 1;
    const { fn, resolve, reject } = queue.shift();
    fn()
      .then(resolve, reject)
      .finally(() => {
        active -= 1;
        runNext();
      });
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      runNext();
    });
}

const limitConcurrentScrapes = createLimiter(3);

/** Swaps every "{query}" placeholder in a source's search URL template for the
 * URL-encoded search term. */
const buildSearchUrl = (template, query) => template.split('{query}').join(encodeURIComponent(query));

/** Pulls the first numeric token out of scraped price text (e.g. "Rs 45,999" -> 45999).
 * Thousands separator is assumed to be a comma (PKR/USD-style formatting, matching this
 * app's target markets) and stripped rather than treated as a decimal point. */
function parsePriceText(text) {
  if (!text) return null;
  const match = String(text).match(/\d[\d,]*(?:\.\d+)?/);
  if (!match) return null;
  const value = parseFloat(match[0].replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}

const emptyResult = (status, errorMessage = null) => ({
  status,
  price: null,
  title: null,
  productUrl: null,
  imageUrl: null,
  errorMessage,
});

/**
 * Runs one live price check against a competitor site. `source` only needs
 * {searchUrlTemplate, priceSelector, titleSelector?, imageSelector?, linkSelector?} — an
 * unsaved ad-hoc object works fine, which is what testSource() below passes in. Never
 * throws: any failure (bad selector, site down, navigation timeout) is caught and mapped
 * to {status:'error'} so one broken competitor site can never fail an entire price check.
 */
async function scrapeSource(source, query) {
  const url = buildSearchUrl(source.searchUrlTemplate, query);
  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setUserAgent(DESKTOP_USER_AGENT);
    await page.setViewport({ width: 1366, height: 900 });
    // 'domcontentloaded' (not 'networkidle2') — many storefronts run a live-chat widget,
    // analytics beacons, or recommendation-engine pixels that keep at least one
    // connection open indefinitely, so 'networkidle2' can time out on a page whose
    // actual product content finished loading ages ago. The explicit waitForSelector
    // right below is the real readiness gate for what we actually need.
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });

    try {
      await page.waitForSelector(source.priceSelector, { timeout: SELECTOR_TIMEOUT_MS });
    } catch (waitError) {
      return emptyResult('not_found');
    }

    const priceText = await page.evaluate(
      (sel) => document.querySelector(sel)?.textContent || null,
      source.priceSelector,
    );
    const price = parsePriceText(priceText);
    if (price === null) {
      return emptyResult('not_found');
    }

    // Falls back — in priority order — to (1) the "card" containing the matched price
    // element, then (2) page-level document.title/og:image, when no titleSelector/
    // imageSelector is configured or the configured one doesn't match. The card-relative
    // step matters most on a search-RESULTS page (as opposed to a single product's own
    // page): document.title/og:image there describe the search page itself (e.g. "Search:
    // 1 result found for X - Site"), not the specific product whose price we matched, and
    // og:image is often just the site's generic logo — walking up from the price element
    // to its nearest product-card ancestor (an <li>/<article>, or anything holding an
    // <img>) ties the extracted title/image to the SAME result instead. Image src is
    // resolved to an absolute URL inside the page (via document.baseURI, so it also
    // respects a <base> tag) — a bare `src` attribute is often a site-relative path that
    // would 404 rendered from this app's own origin otherwise.
    const { title, imageUrl } = await page.evaluate(
      (priceSel, titleSel, imageSel) => {
        function findCardContainer(startEl) {
          let node = startEl;
          // Real themes nest a price surprisingly deep before reaching the card that
          // also holds the product image (verified against a live Shopify "Dawn/Halo"
          // theme search page: price-item -> dd -> price__regular -> dl -> price ->
          // card-price -> card-information__wrapper -> card-information -> card, where
          // "card" — 8 levels up — is the first ancestor with an image). A generous cap
          // (15) handles that; the BODY/HTML stop below is what keeps this from ever
          // matching "the whole page" as a card on a site with no such wrapper at all.
          for (let depth = 0; node && depth < 15; depth += 1) {
            if (node.tagName === 'BODY' || node.tagName === 'HTML') return null;
            if (node.tagName === 'LI' || node.tagName === 'ARTICLE' || node.querySelector('img')) return node;
            node = node.parentElement;
          }
          return null;
        }

        const priceEl = document.querySelector(priceSel);
        const card = priceEl ? findCardContainer(priceEl) : null;

        // Heading-style text wins over the image's alt attribute — alt text on a
        // storefront product image is frequently SEO-stuffed (e.g. "Brand X Product Y
        // with feature A, feature B, available in Pakistan") rather than the clean
        // product name a heading/title element usually has.
        const titleFromSelector = titleSel ? document.querySelector(titleSel)?.textContent?.trim() : null;
        const titleFromCard = card
          ? card.querySelector('h1, h2, h3, [class*="title" i], [class*="product-name" i]')?.textContent?.trim() ||
            card.querySelector('img')?.getAttribute('alt')?.trim() ||
            (card.tagName === 'A' ? card.getAttribute('title') : null)
          : null;
        const title = titleFromSelector || titleFromCard || document.title || null;

        const imageFromSelector = imageSel ? document.querySelector(imageSel)?.getAttribute('src') : null;
        const cardImg = card?.querySelector('img');
        const imageFromCard = cardImg?.getAttribute('src') || cardImg?.getAttribute('data-src') || null;
        const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
        const rawImage = imageFromSelector || imageFromCard || ogImage || null;
        let imageUrl = null;
        if (rawImage) {
          try {
            imageUrl = new URL(rawImage, document.baseURI).href;
          } catch (urlError) {
            imageUrl = null;
          }
        }

        return { title, imageUrl };
      },
      source.priceSelector,
      source.titleSelector || null,
      source.imageSelector || null,
    );

    let productUrl = page.url();
    if (source.linkSelector) {
      const href = await page.evaluate((sel) => document.querySelector(sel)?.getAttribute('href') || null, source.linkSelector);
      if (href) {
        try {
          productUrl = new URL(href, page.url()).toString();
        } catch (urlError) {
          // Keep the search-results URL if the extracted href isn't a valid/absolute URL.
        }
      }
    }

    return { status: 'ok', price, title, productUrl, imageUrl, errorMessage: null };
  } catch (error) {
    return emptyResult('error', describeNavigationError(error));
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

/**
 * Analyzes one real product page and works out CSS selectors for price/title/image on
 * its own, so an admin never has to open devtools and hand-write a CSS selector — they
 * just paste a link to any one product on the competitor's site. Runs entirely inside
 * the page via page.evaluate():
 *   1. Reads the price/name the page already publishes for Google Shopping/rich
 *      snippets (schema.org Product JSON-LD, then Open Graph product meta tags) — most
 *      real e-commerce platforms (WooCommerce, Shopify, Magento, custom stores built for
 *      SEO) already embed this, so the *value* is usually known with certainty.
 *   2. Locates the DOM element that visibly displays that value, and derives a CSS
 *      selector for it — this is what actually gets saved/re-scraped later (structured
 *      data isn't re-read at check time, only used here to bootstrap the selector).
 *   3. Falls back to a `[class*="price"]`-style heuristic scan when no structured data
 *      is found or nothing in the DOM matches it.
 *   4. Also reads the page's own header/sitewide search `<form>` (present on every page,
 *      including this product page) to derive a real searchUrlTemplate, instead of
 *      guessing at common patterns like ?s= vs ?q= vs /search/.
 * Never throws — a page with nothing detectable just returns nulls for the admin to
 * fill in by hand, same as before this feature existed.
 */
async function autoDetectSelectors(url) {
  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setUserAgent(DESKTOP_USER_AGENT);
    await page.setViewport({ width: 1366, height: 900 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: NAVIGATION_TIMEOUT_MS });

    const detected = await page.evaluate(() => {
      function buildSelector(el) {
        if (!el || !el.tagName) return null;
        if (el.id) return `#${CSS.escape(el.id)}`;
        const classes = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean) : [];
        if (!classes.length) return el.tagName.toLowerCase();

        // Try the fullest class combination on the element itself, then fewer classes,
        // stopping at the first one that uniquely identifies it on the page.
        for (let n = classes.length; n >= 1; n -= 1) {
          const sel = `.${classes.slice(0, n).map((c) => CSS.escape(c)).join('.')}`;
          try {
            if (document.querySelectorAll(sel).length === 1) return sel;
          } catch (e) {
            // Class contains characters CSS.escape can't help with as a selector — skip.
          }
        }
        // Not unique alone — qualify with up to 3 ancestor levels.
        let sel = `.${classes.map((c) => CSS.escape(c)).join('.')}`;
        let node = el.parentElement;
        for (let depth = 0; node && depth < 3; depth += 1) {
          const parentClasses = typeof node.className === 'string' ? node.className.trim().split(/\s+/).filter(Boolean) : [];
          const parentSel = node.id
            ? `#${CSS.escape(node.id)}`
            : parentClasses[0]
              ? `.${CSS.escape(parentClasses[0])}`
              : node.tagName.toLowerCase();
          sel = `${parentSel} ${sel}`;
          try {
            if (document.querySelectorAll(sel).length === 1) return sel;
          } catch (e) {
            // Same as above — fall through and keep widening.
          }
          node = node.parentElement;
        }
        return sel;
      }

      function findJsonLdProduct() {
        const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
        for (const script of scripts) {
          try {
            const data = JSON.parse(script.textContent);
            const items = Array.isArray(data) ? data : data['@graph'] || [data];
            for (const item of items) {
              const type = item && item['@type'];
              const isProduct = type === 'Product' || (Array.isArray(type) && type.includes('Product'));
              if (isProduct) {
                const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers;
                const price = offers && (offers.price ?? offers.lowPrice);
                return { name: item.name || null, price: price != null ? String(price) : null };
              }
            }
          } catch (e) {
            // Not valid/parseable JSON-LD — try the next script tag.
          }
        }
        return null;
      }

      function findMetaContent(...selectors) {
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) return el.getAttribute('content');
        }
        return null;
      }

      // Nearly every storefront has a sitewide header search box, present on the product
      // page too — reading its own <form> tells us the real search URL pattern instead of
      // guessing common ones like ?s= vs ?q= vs /search/. Only GET forms are usable here
      // (a POST search can't be expressed as a shareable URL).
      function findSearchUrlTemplate() {
        const scoreInput = (input) => {
          const name = (input.name || '').toLowerCase();
          const id = (input.id || '').toLowerCase();
          const placeholder = (input.placeholder || '').toLowerCase();
          let score = (input.type || '').toLowerCase() === 'search' ? 3 : 0;
          if (['q', 's', 'query', 'search', 'search_query', 'keyword', 'keywords'].includes(name)) score += 3;
          if (name.includes('search') || name.includes('query')) score += 1;
          if (id.includes('search')) score += 1;
          if (placeholder.includes('search')) score += 1;
          return score;
        };

        let best = null;
        const forms = Array.from(document.querySelectorAll('form'));
        for (const form of forms) {
          if ((form.method || 'get').toLowerCase() !== 'get') continue;
          const inputs = Array.from(form.querySelectorAll('input[type="text"], input[type="search"], input:not([type])'));
          for (const input of inputs) {
            if (!input.name) continue;
            const score = scoreInput(input);
            if (score > 0 && (!best || score > best.score)) {
              // form.action (the IDL property, not getAttribute) is always the browser's
              // already-resolved absolute URL, even for a relative action="" attribute.
              best = { score, action: form.action, inputName: input.name };
            }
          }
        }
        if (!best) return null;
        const separator = best.action.includes('?') ? '&' : '?';
        return `${best.action}${separator}${encodeURIComponent(best.inputName)}={query}`;
      }

      const result = {
        price: null,
        priceSelector: null,
        title: null,
        titleSelector: null,
        image: null,
        imageSelector: null,
        searchUrlTemplate: findSearchUrlTemplate(),
      };

      const jsonLd = findJsonLdProduct();
      const knownPrice =
        (jsonLd && jsonLd.price) || findMetaContent('meta[property="product:price:amount"]', 'meta[property="og:price:amount"]');

      let priceEl = null;
      if (knownPrice) {
        const normalized = String(knownPrice).replace(/[,\s]/g, '');
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          const digits = (node.textContent || '').replace(/[^\d.]/g, '');
          if (digits && digits.includes(normalized) && node.parentElement) {
            priceEl = node.parentElement;
            break;
          }
          node = walker.nextNode();
        }
      }
      if (!priceEl) {
        // Structured data was missing or didn't match anything visible — fall back to a
        // plain "does this look like a price element" scan.
        const candidates = Array.from(document.querySelectorAll('[class*="price" i], [id*="price" i]'));
        priceEl = candidates.find((el) => el.children.length === 0 && /\d/.test(el.textContent || '')) || null;
      }
      if (priceEl) {
        result.price = priceEl.textContent.trim();
        result.priceSelector = buildSelector(priceEl);
      }

      const titleText = (jsonLd && jsonLd.name) || findMetaContent('meta[property="og:title"]');
      let titleEl = null;
      if (titleText) {
        const candidates = Array.from(document.querySelectorAll('h1, h2, [class*="title" i], [class*="product-name" i]'));
        titleEl =
          candidates.find((el) => (el.textContent || '').trim() === titleText.trim()) ||
          candidates.find((el) => (el.textContent || '').includes(titleText.trim()));
      }
      if (!titleEl) titleEl = document.querySelector('h1');
      if (titleEl) {
        result.title = titleEl.textContent.trim();
        result.titleSelector = buildSelector(titleEl);
      }

      const ogImage = findMetaContent('meta[property="og:image"]');
      if (ogImage) {
        const imgs = Array.from(document.querySelectorAll('img'));
        const fileName = ogImage.split('/').pop();
        const imgEl = imgs.find((img) => img.src === ogImage) || (fileName && imgs.find((img) => (img.src || '').includes(fileName)));
        if (imgEl) {
          result.image = imgEl.src;
          result.imageSelector = buildSelector(imgEl);
        }
      }

      return result;
    });

    return { status: 'ok', errorMessage: null, ...detected };
  } catch (error) {
    return {
      status: 'error',
      errorMessage: describeNavigationError(error),
      price: null,
      priceSelector: null,
      title: null,
      titleSelector: null,
      image: null,
      imageSelector: null,
      searchUrlTemplate: null,
    };
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

/** Ad-hoc single scrape used by the "Test" button in the Manage Competitor Sites dialog,
 * before a source is saved. */
async function testSource(sourceConfig, query) {
  const trimmed = String(query || '').trim();
  if (!trimmed) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'A search query is required to test this source');
  }
  if (!String(sourceConfig.searchUrlTemplate || '').includes('{query}')) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Search URL template must contain the {query} placeholder');
  }
  return scrapeSource(sourceConfig, trimmed);
}

const snapshotResultFields = ({ status, price, title, productUrl, imageUrl, errorMessage, fetchedAt }) => ({
  status,
  price,
  title,
  productUrl,
  imageUrl,
  errorMessage,
  fetchedAt,
});

/**
 * Own-catalog lookup + one entry per active competitor source. Competitor results are
 * fetched through the shared concurrency limiter and, unless forceRefresh is set, served
 * from PriceCheckSnapshot when a fresh (< 30min) cache entry exists — keeps repeat
 * searches for the same item instant and avoids re-hammering competitor sites.
 */
async function checkPrice({ organizationId, branchId, query, forceRefresh, sourceId }) {
  const trimmed = String(query || '').trim();
  if (!trimmed) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'A search query is required');
  }
  const normalizedQuery = trimmed.toLowerCase();
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'i');

  // branchId is only applied when present — a superAdmin browsing without an
  // x-branch-id header still gets an org-wide catalog match, matching
  // utils/branchFilter.js#applyBranchFilter's convention elsewhere in the app.
  const productFilter = { organizationId, $or: [{ name: regex }, { barcode: regex }] };
  if (branchId) productFilter.branchId = branchId;

  // sourceId narrows to a single competitor — used by a result card's own "retry" button
  // so re-checking one broken source doesn't force-refresh (and bypass the cache for)
  // every other configured source too.
  const sourceFilter = { organizationId, isActive: true, status: 'active' };
  if (sourceId) sourceFilter._id = sourceId;

  const [ownProducts, sources] = await Promise.all([
    Product.find(productFilter)
      .select('name barcode price stockQuantity image')
      .limit(8)
      .lean(),
    PriceCheckerSource.find(sourceFilter).lean(),
  ]);

  const competitorResults = await Promise.all(
    sources.map((source) =>
      limitConcurrentScrapes(async () => {
        const sourceId = source._id;

        if (!forceRefresh) {
          const cached = await PriceCheckSnapshot.findOne({ organizationId, sourceId, normalizedQuery }).lean();
          if (cached && cached.expiresAt > new Date()) {
            return { sourceId, sourceName: source.name, cached: true, ...snapshotResultFields(cached) };
          }
        }

        const result = await scrapeSource(source, trimmed);
        const fetchedAt = new Date();
        const expiresAt = new Date(fetchedAt.getTime() + CACHE_TTL_MS);

        await Promise.all([
          PriceCheckSnapshot.findOneAndUpdate(
            { organizationId, sourceId, normalizedQuery },
            { ...result, fetchedAt, expiresAt },
            { upsert: true },
          ),
          PriceCheckerSource.updateOne({ _id: sourceId }, { lastCheckedAt: fetchedAt, lastCheckStatus: result.status }),
        ]);

        return { sourceId, sourceName: source.name, cached: false, fetchedAt, ...result };
      }),
    ),
  );

  return { ownProducts, competitorResults };
}

/**
 * Competitor site CRUD — mirrors brand.service.js (org-scoped, name-uniqueness check,
 * soft delete via `status`).
 */
const createSource = async (sourceBody) => {
  const exists = await PriceCheckerSource.findOne({
    organizationId: sourceBody.organizationId,
    name: sourceBody.name,
  });
  if (exists) {
    throw new ApiError(httpStatus.BAD_REQUEST, `A competitor site named "${sourceBody.name}" already exists`);
  }
  const source = new PriceCheckerSource(sourceBody);
  return source.save();
};

const querySources = async (filter, options) => PriceCheckerSource.paginate(filter, options);

const getAllSources = async (filter) => {
  const query = { organizationId: filter.organizationId, status: filter.status || 'active' };
  return PriceCheckerSource.find(query).sort({ name: 1 });
};

const getSourceById = async (id) => {
  const source = await PriceCheckerSource.findById(id);
  if (!source) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Competitor site not found');
  }
  return source;
};

const updateSourceById = async (sourceId, updateBody) => {
  const source = await getSourceById(sourceId);
  if (updateBody.name && updateBody.name !== source.name) {
    const exists = await PriceCheckerSource.findOne({
      organizationId: source.organizationId,
      name: updateBody.name,
      _id: { $ne: source._id },
    });
    if (exists) {
      throw new ApiError(httpStatus.BAD_REQUEST, `A competitor site named "${updateBody.name}" already exists`);
    }
  }
  Object.assign(source, updateBody);
  await source.save();
  return source;
};

/** Soft delete — keeps the source (and its price-check history) around instead of
 * removing it, matching softDeleteBrandById. */
const softDeleteSourceById = async (sourceId) => {
  const source = await getSourceById(sourceId);
  source.status = 'inactive';
  await source.save();
  return source;
};

module.exports = {
  checkPrice,
  testSource,
  autoDetectSelectors,
  createSource,
  querySources,
  getAllSources,
  getSourceById,
  updateSourceById,
  softDeleteSourceById,
};
