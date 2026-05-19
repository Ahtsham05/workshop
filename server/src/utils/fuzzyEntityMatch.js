/**
 * Fuzzy match scanned invoice text to saved suppliers / products (EN + Urdu).
 */

const URDU_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

const STOP_WORDS = new Set([
  'the',
  'and',
  'co',
  'company',
  'ltd',
  'pvt',
  'store',
  'shop',
  'traders',
  'trader',
  'trading',
  'enterprise',
  'supplier',
  'wholesale',
  'retail',
  'mobile',
  'communication',
  'اسٹور',
  'شاپ',
  'ٹریڈرز',
  'ٹریڈر',
  'کمپنی',
]);

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

function phonesMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  return a.length >= 7 && b.length >= 7 && (a.endsWith(b) || b.endsWith(a));
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\w\u0600-\u06FF\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value) {
  return normalizeText(value)
    .split(' ')
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[a.length][b.length];
}

function similarityRatio(a, b) {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.92;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return maxLen > 0 ? 1 - dist / maxLen : 0;
}

function tokenOverlapScore(a, b) {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (!ta.length || !tb.length) return 0;
  const setB = new Set(tb);
  let inter = 0;
  ta.forEach((t) => {
    if (setB.has(t)) inter += 1;
  });
  return inter / Math.max(ta.length, tb.length);
}

function bilingualScore(scannedParts, entityParts) {
  let best = 0;
  scannedParts.forEach((s) => {
    entityParts.forEach((e) => {
      if (!s || !e) return;
      const ratio = similarityRatio(s, e);
      const tokens = tokenOverlapScore(s, e);
      const combined = Math.max(ratio, tokens);
      if (combined > best) best = combined;
    });
  });
  return best;
}

/**
 * @param {{ name?: string, nameUrdu?: string, phone?: string }} scanned
 * @param {Array<{ id: string, name?: string, nameUrdu?: string, phone?: string, whatsapp?: string }>} suppliers
 * @param {{ minScore?: number }} [opts]
 */
function matchSupplier(scanned, suppliers, opts = {}) {
  const minScore = opts.minScore ?? 0.55;
  if (!suppliers?.length) return null;

  const phone = normalizePhone(scanned.phone);
  if (phone.length >= 7) {
    const byPhone = suppliers.find((s) => {
      const sp = normalizePhone(s.phone);
      const sw = normalizePhone(s.whatsapp);
      return phonesMatch(phone, sp) || phonesMatch(phone, sw);
    });
    if (byPhone) {
      return { entity: byPhone, score: 1, method: 'phone' };
    }
  }

  const scannedParts = [scanned.name, scanned.nameUrdu].filter(Boolean);
  if (!scannedParts.length) return null;

  let best = null;
  let bestScore = 0;

  suppliers.forEach((supplier) => {
    const entityParts = [supplier.name, supplier.nameUrdu].filter(Boolean);
    const score = bilingualScore(scannedParts, entityParts);
    if (score > bestScore) {
      bestScore = score;
      best = supplier;
    }
  });

  if (best && bestScore >= minScore) {
    return { entity: best, score: bestScore, method: 'name' };
  }
  return null;
}

/**
 * @param {{ name?: string, nameUrdu?: string, barcode?: string }} scanned
 * @param {Array<{ id: string, name?: string, nameUrdu?: string, barcode?: string }>} products
 * @param {{ minScore?: number }} [opts]
 */
function matchProduct(scanned, products, opts = {}) {
  const minScore = opts.minScore ?? 0.5;
  if (!products?.length) return null;

  const barcode = String(scanned.barcode || '').trim();
  if (barcode) {
    const exact = products.find((p) => String(p.barcode || '').trim() === barcode);
    if (exact) return { entity: exact, score: 1, method: 'barcode' };
  }

  const scannedParts = [scanned.name, scanned.nameUrdu].filter(Boolean);
  if (!scannedParts.length) return null;

  let best = null;
  let bestScore = 0;

  products.forEach((product) => {
    const entityParts = [product.name, product.nameUrdu, product.barcode].filter(Boolean);
    let score = bilingualScore(scannedParts, entityParts);
    const scannedJoined = scannedParts.join(' ');
    const entityJoined = entityParts.join(' ');
    if (URDU_SCRIPT.test(scannedJoined) && URDU_SCRIPT.test(entityJoined)) {
      score = Math.max(score, tokenOverlapScore(scannedJoined, entityJoined) * 1.05);
    }
    if (score > bestScore) {
      bestScore = score;
      best = product;
    }
  });

  if (best && bestScore >= minScore) {
    return { entity: best, score: bestScore, method: 'name' };
  }
  return null;
}

module.exports = {
  matchSupplier,
  matchProduct,
  normalizeText,
  similarityRatio,
};
