/**
 * Turns the text of a supplier price list — a pasted WhatsApp message, text pulled out of a
 * PDF, OCR output — into structured rows: `{ name, values: [{ value, kind }], ... }`.
 *
 * Why this is its own module: nobody sends a price list in a clean format. The same shop gets
 *
 *     *SAMSUNG*                              (a heading, then bare model lines)
 *     A15 4/128 - 38,500
 *     Galaxy A25 8/256 = 62.5k
 *
 *     Infinix Hot 40i                        (a name on one line, its price on the next)
 *     Price: 27500/-
 *
 *     [12/09/2026, 10:32 am] Ali Traders: Tecno Spark 20  DP 31000  RP 33999
 *
 *     Product        Dealer     Retail      (a PDF table, cells separated by " | " after
 *     iPhone 15      280000     310000       text extraction)
 *
 * and a naive "last number on the line is the price" rule turns every one of those into wrong
 * prices — worst of all "4/128" (RAM/ROM), "A15", "128GB" and message timestamps, all of which
 * contain digits that must never be read as money. Applying a wrong price to a real product is
 * the one failure this feature can't afford, so this parser is deliberately conservative:
 * anything it isn't sure is a price is left out, and every line it drops is reported in
 * `ignored` so nothing vanishes silently.
 *
 * Pure functions, no I/O — see tests/unit/utils/priceListParser.test.js.
 */

const { normalizeDigits } = require('./importRow');

const MAX_LINES = 5000;
const MAX_LINE_LENGTH = 400;

// A bare number needs a reason to be believed as a price. These are storage/RAM sizes people
// write after a model name ("iPhone 15 128 350000") — never a price on their own.
const STORAGE_SIZES = new Set([2, 3, 4, 6, 8, 12, 16, 32, 64, 128, 256, 512, 1024, 2048]);
const MIN_BARE_PRICE = 100;
const LONG_CODE_DIGITS = 8; // 8+ bare digits is a barcode/phone, not money

const MULTIPLIERS = {
  k: 1e3,
  hazar: 1e3,
  hazaar: 1e3,
  lac: 1e5,
  lacs: 1e5,
  lakh: 1e5,
  lakhs: 1e5,
  million: 1e6,
};

// Label words that tell us *what kind* of price the number after them is.
const COST_LABELS = new Set([
  'dp', 'd.p', 'dealer', 'dealers', 'wholesale', 'ws', 'w/s', 'cost', 'trade', 'tp', 't.p',
  'purchase', 'buy', 'buying', 'net', 'nett', 'landing', 'wsp',
]);
const PRICE_LABELS = new Set([
  'rp', 'r.p', 'retail', 'mrp', 'm.r.p', 'market', 'sale', 'sales', 'sell', 'selling', 'sp', 's.p',
  'consumer',
]);
// Words that sit before a price and belong to neither the name nor a kind.
const FILLER_LABELS = new Set([
  'price', 'prices', 'rate', 'rates', 'rs', 'pkr', 'amount', 'only', 'new', 'now', 'latest', 'is',
  'at', 'for', 'each', 'per', 'pc', 'pcs', 'piece', 'total', 'special', 'offer', 'final',
]);

const HEADER_NAME_WORDS = /\b(product|products|item|items|description|model|name|particulars?|article|title)\b/i;
const HEADER_PRICE_WORDS = /\b(price|prices|rate|rates|dp|rp|mrp|cost|dealer|retail|wholesale|trade|tp|sp)\b/i;

const UNIT_AFTER_NUMBER = new RegExp(
  '^\\s*(?:gb|tb|mb|kb|mah|inch|inches|in\\b|mp|hz|watts?|w\\b|kg|gm|gms|g\\b|ltrs?|l\\b|ml|mm|cm|m\\b|' +
    'x\\b|yards?|meters?|metres?|mtrs?|amps?|a\\b|v\\b|volts?|cores?|way\\b|ports?|' +
    'slots?|bit|nm|mbps|gbps|kbps|rpm|fps|"|”|″|\'|%)',
  'i',
);

const PACK_HINT = /(?:\bper\b|\/|\bp\/)\s*(?:dozen|doz|dz|carton|ctn|box|pack|pkt|set|pair|gross|kg|meter|mtr|yard)\b|\b(?:dozen|doz|dz|carton|ctn)\s*(?:rate|price)?\b/i;

// ─── Cleaning ────────────────────────────────────────────────────────────────

// "[12/09/2026, 10:32:15 AM] Ali Traders: " and "12/09/26, 10:32 - Ali: " — WhatsApp's own
// per-message prefix, which contains digits that look like prices to anything naive.
const WA_PREFIX = /^\[?\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4},?\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?\]?\s*(?:[-–—]\s*)?[^:\n]{1,50}:\s+/i;

const DATE_TOKENS = [
  /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g, // 12/09/2026
  /\b\d{4}-\d{1,2}-\d{1,2}\b/g, // 2026-09-12
  /\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?/gi, // 10:32 am
  /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?,?(?:\s+\d{2,4})?\b/gi, // 12 Sep 2026
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?\b/gi, // Sep 12
];
const PHONE_TOKENS = /(?:\+?92[-\s]?|\b0)3\d{2}[-\s]?\d{7}\b|\b\d{4}[-\s]\d{7}\b/g;

// RAM/ROM specs: "4/128", "6+128", "8gb/256gb", "4-128". Masked out before scanning for
// prices so their digits are never candidates. `-` only counts when unspaced.
const SPEC_PAIR = /\b\d{1,2}\s*(?:gb)?\s*[/+]\s*\d{1,4}\s*(?:gb)?\b|\b\d{1,2}(?:gb)?-\d{2,4}(?:gb)?\b/gi;

const mask = (text, pattern) => text.replace(pattern, (m) => '§'.repeat(m.length));

/** Strips WhatsApp/markdown/emoji noise and normalizes digits. Keeps column separators. */
const cleanLine = (raw) => {
  let s = normalizeDigits(String(raw || '').slice(0, MAX_LINE_LENGTH * 2));
  s = s
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, '')
    .replace(/[\u00A0\u2007\u202F]/g, ' ')
    .replace(WA_PREFIX, '');
  s = s.replace(/\t+/g, ' | '); // tab-separated cells (Excel paste, extracted PDF tables)
  s = s.replace(/[→⇒➡➞⟶⟹↦]/g, ' = '); // an arrow between name and price is a separator
  s = s.replace(/^\s*\d\uFE0F?\u20E3\s*/, ''); // keycap-emoji list numbering ("1" + keycap)
  s = s.replace(/[*~`]/g, ''); // WhatsApp bold / strike / monospace
  s = s.replace(/(^|\s)_+|_+(?=\s|$)/g, '$1'); // _italic_
  s = s.replace(/[\p{Extended_Pictographic}\uFE0F\u20E3\u200D]/gu, ' ');
  s = s.replace(/[•●○◦▪▫■□◆◇▶►➤➜➔✔✓☑✗✘★☆‣⁃※]/g, ' ');
  s = s.replace(/^\s*\d{1,3}[.)\]]\s+/, ''); // "12. Samsung A15" / "3) Tecno"
  s = s.replace(/[ ]{2,}/g, ' ').replace(/(?: \| ){2,}/g, ' | ');
  s = s.replace(/^[\s|]+|[\s|]+$/g, '');
  return s.slice(0, MAX_LINE_LENGTH);
};

// ─── Number scanning ─────────────────────────────────────────────────────────

const CURRENCY = '(?:rs\\.?|pkr|₨|rupees?|usd|\\$)';
const NUMBER_RE_SOURCE =
  '(?<![\\p{L}\\p{N}_.,/])' + // not glued onto a preceding word/number/separator
  `(?:(${CURRENCY})\\s*)?` + // 1: currency prefix
  '(\\d{1,3}(?:,\\d{2,3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)' + // 2: 38,500 | 1,20,000 | 38500 | 38.5
  '(?:\\s*(k|hazaa?r|lacs?|lakhs?|million)(?![\\p{L}\\p{N}]))?' + // 3: 38.5k | 1.2 lac
  '(?![\\p{L}\\p{N}_])';

const toAmount = (numberText, multiplierWord) => {
  let text = numberText;
  // "38.500" is thousands in the dot-grouping convention; no real price has 3 decimals.
  if (/^\d{1,3}\.\d{3}$/.test(text)) text = text.replace('.', '');
  const base = Number(text.replace(/,/g, ''));
  if (!Number.isFinite(base)) return NaN;
  const multiplier = multiplierWord ? MULTIPLIERS[multiplierWord.toLowerCase().replace(/^hazaar$/, 'hazar')] : 1;
  return Math.round(base * (multiplier || 1) * 100) / 100;
};

/**
 * Finds every number in `line` that could be a price, with the evidence for it. Does not
 * decide anything — `acceptPrices` does — so the same scan serves plain and tabular lines.
 */
const scanNumbers = (line) => {
  let scan = mask(line, PHONE_TOKENS);
  DATE_TOKENS.forEach((pattern) => {
    scan = mask(scan, pattern);
  });
  scan = mask(scan, SPEC_PAIR);
  scan = scan.replace(new RegExp(`(?<![\\p{L}\\p{N}_.,/])\\d{${LONG_CODE_DIGITS},14}(?![\\p{L}\\p{N}_])`, 'gu'), (m) =>
    '§'.repeat(m.length),
  );

  const found = [];
  const re = new RegExp(NUMBER_RE_SOURCE, 'giu');
  let m = re.exec(scan);
  while (m) {
    const start = m.index;
    const end = start + m[0].length;
    const before = scan.slice(0, start);
    const after = scan.slice(end);
    const beforeTrim = before.replace(/\s+$/, '');
    const lastCh = beforeTrim.slice(-1);

    // "A15-128": a dash hugging a model token on its left is part of the name. "38000-40000" is
    // the same shape but the left side is a plain number — a price range, kept so it can be
    // flagged instead of silently losing its upper bound.
    const prevToken = beforeTrim.slice(0, -1).match(/[\p{L}\p{N}.,]+$/u);
    const prevIsNumber = Boolean(prevToken) && /^[\d.,]+k?$/i.test(prevToken[0]);
    const glued = /[-+]/.test(lastCh) && before.endsWith(lastCh) && Boolean(prevToken) && !prevIsNumber;
    const signed = lastCh === '+' && !glued && /(^|\s)\+$/.test(beforeTrim);
    const unitAfter = UNIT_AFTER_NUMBER.test(after);

    if (!glued && !unitAfter) {
      const value = toAmount(m[2], m[3]);
      if (Number.isFinite(value)) {
        const hasSepBefore = /[=:@|\-–—]$/.test(beforeTrim) || (lastCh === '(' && /^\s*\)/.test(after));
        const hasSuffix = /^\s*(?:\/-|-\/|\/=|\/–|only\b)/i.test(after);
        found.push({
          start,
          end,
          value,
          raw: line.slice(start, end).trim(),
          currency: Boolean(m[1]),
          comma: m[2].includes(','),
          multiplier: Boolean(m[3]),
          decimal: /\./.test(m[2]) && !/^\d{1,3}\.\d{3}$/.test(m[2]) && !m[3],
          sepBefore: hasSepBefore,
          suffix: hasSuffix,
          signed,
        });
      }
    }
    m = re.exec(scan);
  }
  return found;
};

const isYear = (n) => Number.isInteger(n.value) && n.value >= 2015 && n.value <= 2035;

/**
 * Keeps only the numbers believable as a price. Currency/thousands-comma/"k"/"/-" markers are
 * proof on their own. A separator in front ("- 38500") is weaker — "iPhone 15 - 128 - 350000"
 * has one before the storage size too — so it still can't be a storage size or a decimal.
 * A bare trailing integer has to be big enough to not be a model number or a year.
 */
const acceptPrices = (numbers) =>
  numbers.filter((n) => {
    if (!(n.value > 0)) return false;
    if (n.currency || n.comma || n.multiplier || n.suffix) return true;
    if (n.decimal || STORAGE_SIZES.has(n.value)) return false;
    if (n.sepBefore) return true;
    return n.value >= MIN_BARE_PRICE && !isYear(n);
  });

// ─── Labels ──────────────────────────────────────────────────────────────────

const wordsOf = (text) =>
  text
    .toLowerCase()
    .replace(/[:=@|,;()[\]]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

const kindOfWord = (word) => {
  if (COST_LABELS.has(word)) return 'cost';
  if (PRICE_LABELS.has(word)) return 'price';
  return null;
};

/** The kind named by the label words in `segment` (last one wins), or null. */
const kindFromSegment = (segment) => {
  let kind = null;
  wordsOf(segment).forEach((word) => {
    kind = kindOfWord(word) || kind;
  });
  return kind;
};

/**
 * Removes trailing separator/label words ("... DP", "... Price:", "... Rs") from the text in
 * front of a price so what's left is the product name. Returns the cleaned name and the kind
 * the stripped labels announced.
 */
const peelTrailingLabels = (text) => {
  let rest = text.replace(/[\s=:@|,\-–—/(]+$/, '');
  let kind = null;
  for (;;) {
    const m = rest.match(/(?:^|[\s|])([A-Za-z][A-Za-z./]{0,9})$/);
    if (!m) break;
    const word = m[1].toLowerCase();
    if (!kindOfWord(word) && !FILLER_LABELS.has(word)) break;
    kind = kind || kindOfWord(word);
    rest = rest.slice(0, rest.length - m[1].length).replace(/[\s=:@|,\-–—/(]+$/, '');
  }
  return { name: rest, kind };
};

const hasLetters = (text, min = 2) => (text.match(/\p{L}/gu) || []).length >= min;

/**
 * True when what's left of a line after its price and label words is a product name. Model-only
 * names are normal in brand-grouped lists ("A15 4/128", "S24", "13C") so this cannot demand
 * two letters — it only asks that something identifying is left. An empty remainder is what
 * marks a price-only line ("Price: 38,500", "Retail: 42000").
 */
const hasName = (text) => /[\p{L}\p{N}]/u.test(text || '');

// ─── Line parsing ────────────────────────────────────────────────────────────

const NUMERIC_CELL = new RegExp(`^\\s*(?:${CURRENCY}\\s*)?(\\d{1,3}(?:,\\d{2,3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)(?:\\s*(k|hazaa?r|lacs?|lakhs?|million))?\\s*(?:\\/-|-\\/)?\\s*$`, 'i');

const cellKind = (cell) => {
  const words = wordsOf(cell);
  if (!words.length) return 'ignore';
  if (words.some((w) => /^(qty|quantity|stock|pcs|units?|available|sr|s\.?no|no|#|sno|serial|tax|gst|disc|discount|%|unit|uom|code|sku|barcode)$/.test(w))) {
    return words.some((w) => /^(price|rate|cost|mrp|dp|rp)$/.test(w)) ? null : 'ignore';
  }
  const kind = words.reduce((found, w) => kindOfWord(w) || found, null);
  return kind;
};

/**
 * Detects a table header ("Product | Dealer | Retail"). Returns the ordered kinds of the
 * *non-name* columns — 'cost' | 'price' | null (a generic price column) | 'ignore' (qty, sr#…)
 * — or null when the line isn't a header.
 */
const detectHeader = (line, hasPriceNumbers) => {
  if (hasPriceNumbers) return null;
  if (!HEADER_PRICE_WORDS.test(line) || !HEADER_NAME_WORDS.test(line)) return null;
  const words = line.split(/\s+/);
  if (words.length > 14) return null;

  const cells = line.split(' | ').map((c) => c.trim()).filter(Boolean);
  if (cells.length >= 2) {
    const kinds = cells.map((cell) => (HEADER_NAME_WORDS.test(cell) && !HEADER_PRICE_WORDS.test(cell) ? 'name' : cellKind(cell)));
    const nameIdx = kinds.indexOf('name');
    if (nameIdx === -1) return null;
    // "Product | Price | Product | Price" — a multi-column page; rows are read by name/number groups.
    if (kinds.filter((k) => k === 'name').length >= 2) return [];
    return kinds.slice(nameIdx + 1);
  }
  // No cell separators: read the price-ish words in order ("Product Dealer Price Retail Price").
  const kinds = [];
  const ws = wordsOf(line);
  for (let i = 0; i < ws.length; i += 1) {
    const kind = kindOfWord(ws[i]);
    if (kind) {
      kinds.push(kind);
      if (ws[i + 1] && /^(price|rate)$/.test(ws[i + 1])) i += 1;
    } else if (/^(price|rate)$/.test(ws[i])) {
      kinds.push(null);
    }
  }
  return kinds.length ? kinds : null;
};

const finishName = (text) =>
  text
    .replace(/^\s*\d{1,3}[.)\]]\s+/, '')
    .replace(/[\s=:@|,\-–—/(]+$/, '')
    .replace(/^[\s=:@|,\-–—/)]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

const toTabularValues = (numericCells, columnKinds) => {
  if (columnKinds && columnKinds.length === numericCells.length) {
    return numericCells
      .map((cell, i) => ({ value: cell.value, raw: cell.raw, kind: columnKinds[i] }))
      .filter((v) => v.kind !== 'ignore' && v.value > 0);
  }
  // No usable header: a bare numeric cell under 100 is a qty/serial/discount, not a price.
  return numericCells
    .filter((cell) => cell.value >= MIN_BARE_PRICE || /rs|pkr|,|k$/i.test(cell.raw))
    .map((cell) => ({ value: cell.value, raw: cell.raw, kind: null }))
    .filter((v) => v.value > 0);
};

/**
 * Tabular line ("iPhone 15 | 280000 | 310000"). Cells are grouped into products: a product is its
 * name cell(s) followed by its numeric cells, and a new name cell after numbers starts the next
 * product — that is how a page printed in two or three side-by-side columns arrives
 * ("Galaxy A15 | 38500 | Galaxy A25 | 62500"), and how a brand | model split across cells joins
 * back into one name. Returns the products found on the line (usually one), or null.
 */
const parseTabularLine = (line, columnKinds) => {
  const cells = line.split(' | ').map((c) => c.trim()).filter(Boolean);
  if (cells.length < 2) return null;

  const groups = [];
  let current = null;
  cells.forEach((cell) => {
    const numeric = cell.match(NUMERIC_CELL);
    if (numeric) {
      // Numbers before any name are a serial number / row index.
      if (current) {
        const value = toAmount(numeric[1], numeric[2]);
        if (Number.isFinite(value)) current.numericCells.push({ value, raw: cell });
      }
      return;
    }
    if (!hasName(cell)) return;
    if (!current || current.numericCells.length > 0) {
      current = { nameParts: [cell], numericCells: [], trailing: [] };
      groups.push(current);
    } else {
      current.nameParts.push(cell); // brand | model in separate cells
    }
  });

  // A group with no numbers is a trailing text cell ("PTA", "Black"): short ones belong to the
  // product's name (they decide which product it is), long ones are just a note.
  const products = [];
  groups.forEach((group) => {
    if (group.numericCells.length) {
      products.push({ ...group, name: group.nameParts.join(' '), note: '' });
      return;
    }
    const prev = products[products.length - 1];
    if (!prev) return;
    const text = group.nameParts.join(' ');
    if (text.split(/\s+/).length <= 3) prev.name += ` ${text}`;
    else prev.note = `${prev.note} ${text}`.trim();
  });

  const parsed = products
    .map((product) => ({
      name: finishName(product.name),
      values: toTabularValues(product.numericCells, products.length === 1 ? columnKinds : null),
      note: product.note,
      warnings: [],
    }))
    .filter((product) => product.values.length && hasName(product.name));
  return parsed.length ? parsed : null;
};

/**
 * Parses one cleaned line. Returns `{ name, values, note, warnings, codes }` where `values` may
 * be empty (a heading, a name-only line, or chat).
 */
const parseLine = (line, columnKinds) => {
  const codes = [];
  const maskedPhones = mask(line, PHONE_TOKENS);
  const codeRe = new RegExp(`(?<![\\p{L}\\p{N}_.,/])(\\d{${LONG_CODE_DIGITS},14})(?![\\p{L}\\p{N}_])`, 'gu');
  let cm = codeRe.exec(maskedPhones);
  while (cm) {
    if (!codes.includes(cm[1])) codes.push(cm[1]);
    cm = codeRe.exec(maskedPhones);
  }

  const tab = line.includes(' | ') ? parseTabularLine(line, columnKinds) : null;
  if (tab) {
    const warnings = PACK_HINT.test(line) ? ['pack_price'] : [];
    return { ...tab[0], warnings, codes, extra: tab.slice(1).map((t) => ({ ...t, warnings, codes: [] })) };
  }

  const prices = acceptPrices(scanNumbers(line));
  if (!prices.length) {
    return { name: finishName(line.replace(/\s*\|\s*/g, ' ')), values: [], note: '', warnings: [], codes };
  }

  const warnings = [];
  if (PACK_HINT.test(line)) warnings.push('pack_price');
  if (prices.some((p) => p.signed)) warnings.push('signed_change');

  const first = prices[0];
  const last = prices[prices.length - 1];
  const beforeFirst = line.slice(0, first.start);
  const afterLast = line.slice(last.end).replace(/^\s*(?:\/-|-\/|\/=|\/–|only\b)/i, '');

  // Each price's kind comes from the label words directly in front of it.
  const values = prices.map((p, i) => {
    const segStart = i === 0 ? 0 : prices[i - 1].end;
    const segment = line.slice(segStart, p.start);
    const label = i === 0 ? peelTrailingLabels(segment).kind : kindFromSegment(segment.split(/[\s|]/).slice(-3).join(' '));
    return { value: p.value, raw: p.raw, kind: label };
  });

  // Two prices joined by "-"/"to"/"~" are a range, not a cost + a retail.
  for (let i = 1; i < prices.length; i += 1) {
    const between = line.slice(prices[i - 1].end, prices[i].start).trim();
    if (/^(?:-|–|—|to|~)$/i.test(between)) warnings.push('range');
  }

  const { name: leadName } = peelTrailingLabels(beforeFirst);
  let name = leadName;
  let note = '';
  if (hasLetters(afterLast, 1)) {
    // "38500 - Samsung A15" (price first) vs "Samsung A15 38500 (pta approved)" (trailing note).
    if (!hasName(name)) name = afterLast;
    else note = afterLast.replace(/^[\s=:@|,\-–—/()]+|[\s=:@|,\-–—/()]+$/g, '');
  }

  codes.forEach((code) => {
    name = name.replace(code, ' ');
  });
  return { name: finishName(name), values, note, warnings: [...new Set(warnings)], codes };
};

// ─── Whole-document parsing ──────────────────────────────────────────────────

// Words that mark a no-price line as chatter or a list title rather than a product group.
const CHATTER = /\b(rates?|prices?|list|updated?|stock|available|assalam|salam|alaikum|dear|sir|madam|hello|hi|regards|thanks?|thank|please|kindly|today|tomorrow|valid|offer|note|call|contact|whatsapp|order|delivery|payment|bank|account)\b/i;

/**
 * A no-price line that plausibly heads a group of products ("SAMSUNG", "*Infinix*", "Tecno:").
 * Only a hint for matching — a heading is never required and never penalises a product — but
 * "Assalam o alaikum sir, new rates" must not become the context of forty lines, so a heading
 * needs a real signal: bold in the source, ALL CAPS, a trailing colon, or just one to three words.
 */
const looksLikeHeading = (name, { emphasis = false, colon = false } = {}) => {
  if (!hasLetters(name, 2)) return false;
  if (name.length > 60 || /[.!?]$/.test(name)) return false;
  if (CHATTER.test(name)) return false;
  const words = name.split(/\s+/).length;
  if (words > 6) return false;
  const letters = name.replace(/[^\p{L}]/gu, '');
  const allCaps = letters.length >= 3 && letters === letters.toUpperCase() && /[A-Z]/.test(letters);
  return emphasis || colon || allCaps || words <= 3;
};

/**
 * @param {string} text
 * @returns {{
 *   rows: Array<{ line: number, raw: string, name: string, section: string|null,
 *     values: Array<{ value: number, kind: 'cost'|'price'|null, raw: string }>,
 *     codes: string[], note: string, warnings: string[] }>,
 *   ignored: Array<{ line: number, raw: string, reason: string }>,
 *   columnKinds: Array<'cost'|'price'|null>|null,
 *   stats: { lines: number, parsed: number, ignored: number, truncated: boolean },
 * }}
 */
const parsePriceList = (text) => {
  const allLines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const truncated = allLines.length > MAX_LINES;
  const lines = truncated ? allLines.slice(0, MAX_LINES) : allLines;

  const rows = [];
  const ignored = [];
  let section = null;
  let columnKinds = null;
  let pending = null; // a no-price line that may be a heading OR the name for the next line's price
  let lastRow = null; // where a price-only continuation line ("Retail: 38000") attaches

  const resolvePending = () => {
    if (!pending) return;
    if (looksLikeHeading(pending.name, pending)) section = pending.name;
    else ignored.push({ line: pending.line, raw: pending.raw, reason: 'no_price' });
    pending = null;
  };

  const pushRow = (row) => {
    rows.push(row);
    lastRow = row;
  };

  lines.forEach((rawLine, index) => {
    const lineNo = index + 1;
    const cleaned = cleanLine(rawLine);
    if (!cleaned) {
      resolvePending();
      lastRow = null;
      return;
    }

    const headerKinds = detectHeader(cleaned, acceptPrices(scanNumbers(cleaned)).length > 0);
    if (headerKinds) {
      resolvePending();
      columnKinds = headerKinds.some((k) => k === 'cost' || k === 'price') || headerKinds.some((k) => k === 'ignore') ? headerKinds : null;
      lastRow = null;
      return;
    }

    const parsed = parseLine(cleaned, columnKinds);
    if (columnKinds && parsed.values.length === columnKinds.length && parsed.values.every((v) => !v.kind)) {
      // A header told us the column order and this (untabulated) row has exactly that many prices.
      parsed.values = parsed.values
        .map((v, i) => ({ ...v, kind: columnKinds[i] }))
        .filter((v) => v.kind !== 'ignore');
    }

    if (parsed.values.length && hasName(parsed.name)) {
      resolvePending();
      pushRow({
        line: lineNo,
        raw: cleaned,
        name: parsed.name,
        section,
        values: parsed.values,
        codes: parsed.codes,
        note: parsed.note,
        warnings: parsed.warnings,
      });
      (parsed.extra || []).forEach((more) => {
        pushRow({ line: lineNo, raw: cleaned, name: more.name, section, values: more.values, codes: more.codes, note: more.note, warnings: more.warnings });
      });
      return;
    }

    if (parsed.values.length) {
      // A price with no product name: "Price: 38,500", "Retail: 42000", "Rs 27500/-".
      if (pending) {
        const row = {
          paired: true,
          line: pending.line,
          raw: `${pending.raw} → ${cleaned}`,
          name: pending.name,
          section,
          values: parsed.values,
          codes: parsed.codes,
          note: parsed.note,
          warnings: parsed.warnings,
        };
        pending = null;
        pushRow(row);
      } else if (lastRow && lastRow.line >= lineNo - 3 && (lastRow.paired || parsed.values.every((v) => v.kind))) {
        lastRow.values = lastRow.values.concat(parsed.values);
        lastRow.warnings = [...new Set(lastRow.warnings.concat(parsed.warnings))];
      } else {
        ignored.push({ line: lineNo, raw: cleaned, reason: 'price_without_name' });
      }
      return;
    }

    // No price on this line.
    resolvePending();
    lastRow = null;
    if (hasLetters(parsed.name, 1)) {
      pending = {
        line: lineNo,
        raw: cleaned,
        name: parsed.name,
        emphasis: /^\s*[*_~]{1,3}[^*_~]{2,}[*_~]{1,3}\s*[:-]?\s*$/.test(String(rawLine)),
        colon: /:\s*$/.test(cleaned),
      };
    } else {
      ignored.push({ line: lineNo, raw: cleaned, reason: 'no_price' });
    }
  });
  resolvePending();

  if (truncated) ignored.push({ line: MAX_LINES + 1, raw: `(${allLines.length - MAX_LINES} more lines)`, reason: 'too_long' });

  return {
    rows: rows.map(({ paired, ...row }) => row), // `paired` is bookkeeping for continuation lines only
    ignored,
    columnKinds,
    stats: { lines: lines.filter((l) => l.trim()).length, parsed: rows.length, ignored: ignored.length, truncated },
  };
};

module.exports = {
  parsePriceList,
  parseLine,
  cleanLine,
  scanNumbers,
  acceptPrices,
  detectHeader,
  MAX_LINES,
};
