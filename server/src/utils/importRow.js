/**
 * Shared helpers for turning one row of an uploaded spreadsheet into clean values.
 *
 * The browser normalizes what it can before sending a batch (see
 * client/src/lib/excel-import.ts), but the same bulk endpoints are also called by the
 * AI vision scanners and directly by API clients, so the server does its own cleaning
 * rather than trusting that the caller already did. Every helper reports failure as a
 * value instead of throwing: one unusable cell has to cost one row, never the batch.
 */

/**
 * Coerces a cell to trimmed text, treating anything that isn't already a string or a
 * number (a nested object from a malformed request, say) as absent rather than letting
 * JS stringify it into the literal text "[object Object]".
 */
const toImportText = (raw) => (typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : '');

const ARABIC_INDIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g;

/** "۱۲۳" / "١٢٣" → "123" — Urdu and Arabic keyboards produce these routinely. */
const normalizeDigits = (text) =>
  text.replace(ARABIC_INDIC_DIGITS, (char) => {
    const code = char.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });

/**
 * Parses a numeric cell that may carry currency symbols, thousands separators in either
 * the 1,250.50 or the 1.250,50 convention, an accounting negative in parentheses, the
 * local "2,999/-" suffix, or non-Latin digits.
 *
 * @param {*} raw
 * @returns {{ value: number|undefined, valid: boolean }} `value: undefined, valid: true`
 *   means the cell was empty — the caller decides whether that's allowed.
 */
const parseImportNumber = (raw) => {
  if (raw === undefined || raw === null || raw === '') return { value: undefined, valid: true };
  if (typeof raw === 'number') return { value: raw, valid: Number.isFinite(raw) };
  if (typeof raw === 'boolean') return { value: undefined, valid: false };

  const original = String(raw).trim();
  if (original === '') return { value: undefined, valid: true };

  let text = normalizeDigits(original)
    .replace(/[\s\u00A0\u202F\u2007]/g, '')
    .replace(/\u066B/g, '.')
    .replace(/\u066C/g, ',');

  // Only a leading "-" or surrounding parentheses mean negative. A trailing "-" or "/-"
  // is the local "rupees only" suffix.
  const negative = /^\(.*\)$/.test(text) || /^-/.test(text);
  text = text
    .replace(/^\(|\)$/g, '')
    .replace(/^[-+]/, '')
    .replace(/\/?-$/, '')
    .replace(/[^0-9.,]/g, '');

  if (text === '' || text === '.' || text === ',') return { value: undefined, valid: false };

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    // Whichever separator comes last is the decimal point; the other groups thousands.
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const groupSep = decimalSep === ',' ? '.' : ',';
    const parts = text.split(groupSep).join('').split(decimalSep);
    text = `${parts.slice(0, -1).join('')}.${parts[parts.length - 1]}`;
  } else if (lastComma !== -1) {
    const groups = text.split(',');
    const isThousands = groups.length > 2 || groups[groups.length - 1].length === 3;
    text = isThousands ? groups.join('') : `${groups.slice(0, -1).join('')}.${groups[groups.length - 1]}`;
  } else if (lastDot !== -1) {
    const groups = text.split('.');
    if (groups.length > 2) text = groups.join('');
  }

  const value = Number(text);
  if (!Number.isFinite(value)) return { value: undefined, valid: false };
  return { value: negative ? -value : value, valid: true };
};

/** Case/whitespace-insensitive key for matching names against what's already saved. */
const matchKey = (value) => toImportText(value).toLowerCase();

/**
 * Comparison key for a phone number. The same person is written "+92 300 1234567",
 * "0300-1234567" and "03001234567" across files, so matching is done on the last 10
 * digits — long enough to identify a subscriber number, short enough to ignore the
 * country code and trunk zero.
 */
const phoneKey = (value) => {
  const digits = normalizeDigits(toImportText(value)).replace(/\D/g, '');
  if (digits.length < 7) return '';
  return digits.slice(-10);
};

// Deliberately permissive: the point is to catch "ali@gmail" and "not an email", not to
// enforce RFC 5322 on data that is optional anyway.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isValidEmail = (value) => EMAIL_PATTERN.test(toImportText(value));

/**
 * Parses a date cell into a Date, accepting every form a spreadsheet actually delivers:
 * a real date cell, an Excel serial number, or text people type by hand. Slash/dash
 * dates are read day-first (16/09/2026), falling back to month-first only when day-first
 * is impossible (09/16/2026) — `new Date(text)` alone reads them month-first and would
 * silently record the wrong day for most of the year.
 *
 * @param {*} raw
 * @returns {{ value: Date|undefined, valid: boolean }} `value: undefined, valid: true`
 *   means the cell was empty.
 */
const parseImportDate = (raw) => {
  if (raw === undefined || raw === null || raw === '') return { value: undefined, valid: true };
  if (raw instanceof Date) return { value: raw, valid: !Number.isNaN(raw.getTime()) };
  if (typeof raw === 'number') {
    // Excel serial: days since 1899-12-30 (that epoch absorbs the 1900 leap-year bug).
    const parsed = new Date(Math.round((raw - 25569) * 86400 * 1000));
    return { value: parsed, valid: !Number.isNaN(parsed.getTime()) };
  }

  const text = normalizeDigits(toImportText(raw));
  if (!text) return { value: undefined, valid: true };

  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) {
    const parsed = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return { value: parsed, valid: !Number.isNaN(parsed.getTime()) };
  }

  const dmy = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (dmy) {
    let day = Number(dmy[1]);
    let month = Number(dmy[2]);
    if (month > 12 && day <= 12) {
      const swap = day;
      day = month;
      month = swap;
    }
    const year = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    const parsed = new Date(year, month - 1, day);
    return { value: parsed, valid: !Number.isNaN(parsed.getTime()) };
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return { value: undefined, valid: false };
  return { value: parsed, valid: true };
};

module.exports = {
  toImportText,
  normalizeDigits,
  parseImportNumber,
  parseImportDate,
  matchKey,
  phoneKey,
  isValidEmail,
};
