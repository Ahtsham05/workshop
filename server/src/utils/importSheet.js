/**
 * Reads an uploaded spreadsheet into rows keyed by the field names the services expect.
 *
 * The browser does this for the imports that send JSON (see client/src/lib/excel-import.ts).
 * The student import instead uploads the file itself, so the same tolerance has to exist
 * here: find the header row wherever it is (files routinely start with a school name or
 * a blank row or two), match header text to fields however it is spelled or cased, and
 * hand back the real Excel row number so a failure can name the row the user is looking at.
 */

const XLSX = require('xlsx');
const { toImportText } = require('./importRow');

/**
 * Reduces a header cell to a comparison key: case-folded, accent-stripped, with spaces
 * and punctuation removed, so "First Name", "first_name" and "FIRST-NAME" all match one
 * alias entry. A trailing "(required)" marker is dropped too, which is what makes the
 * generated templates re-importable as-is.
 */
const normalizeHeader = (raw) =>
  String(raw ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[﻿​-‏‪-‮]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .trim();

const isBlank = (value) => value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

/** Header rows sit near the top; past this we'd start matching text inside the data. */
const HEADER_SEARCH_DEPTH = 25;

const buildAliasIndex = (fields) => {
  const index = new Map();
  fields.forEach((field) => {
    [field.key, field.label, ...(field.aliases || [])].forEach((candidate) => {
      const normalized = normalizeHeader(candidate);
      if (normalized && !index.has(normalized)) index.set(normalized, field.key);
    });
  });
  return index;
};

const scoreRow = (row, aliasIndex, requiredKeys) => {
  const matched = new Set();
  let score = 0;
  row.forEach((cell) => {
    if (isBlank(cell) || typeof cell === 'number' || cell instanceof Date) return;
    const field = aliasIndex.get(normalizeHeader(cell));
    if (!field || matched.has(field)) return;
    matched.add(field);
    score += requiredKeys.has(field) ? 3 : 1;
  });
  return score;
};

/**
 * @param {Buffer} buffer - the uploaded file
 * @param {Array<{key: string, label?: string, aliases?: string[], required?: boolean}>} fields
 * @returns {{ rows: Object[], headerRow: number|null, sheetName: string, matchedFields: string[], missingFields: string[] }}
 *   Each row is `{ [fieldKey]: cell, __excelRow: number }`. Blank rows, a repeated header
 *   and a trailing "Total" line are left out.
 */
const readSheetRows = (buffer, fields) => {
  const workbook = XLSX.read(buffer, { type: 'buffer', codepage: 65001, cellDates: true });
  const aliasIndex = buildAliasIndex(fields);
  const requiredKeys = new Set(fields.filter((field) => field.required).map((field) => field.key));

  let best = null;
  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;
    const ref = sheet['!ref'];
    const firstRow = ref ? XLSX.utils.decode_range(ref).s.r : 0;
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null, blankrows: true });

    let headerIndex = -1;
    let headerScore = 0;
    const depth = Math.min(matrix.length, HEADER_SEARCH_DEPTH);
    for (let i = 0; i < depth; i += 1) {
      const row = matrix[i];
      if (!row || row.every(isBlank)) continue;
      const score = scoreRow(row, aliasIndex, requiredKeys);
      if (score > headerScore) {
        headerScore = score;
        headerIndex = i;
      }
    }

    const dataRowCount = matrix.slice(headerIndex + 1).filter((row) => row && !row.every(isBlank)).length;
    const candidate = { sheetName, matrix, firstRow, headerIndex, headerScore, dataRowCount };
    // The sheet whose header matches best wins; row count only breaks a tie. A workbook
    // whose first tab is instructions or an empty "Sheet1" used to read as "file is empty".
    if (
      !best ||
      candidate.headerScore > best.headerScore ||
      (candidate.headerScore === best.headerScore && candidate.dataRowCount > best.dataRowCount)
    ) {
      best = candidate;
    }
  });

  if (!best) return { rows: [], headerRow: null, sheetName: '', matchedFields: [], missingFields: fields.filter((f) => f.required).map((f) => f.key) };

  const { matrix, firstRow, headerIndex } = best;
  // No recognisable header: fall back to the template's column order, which is what a
  // file exported without headers almost always follows.
  const positional = headerIndex < 0;
  const headerCells = positional ? [] : matrix[headerIndex] || [];
  const width = matrix.reduce((max, row) => Math.max(max, (row && row.length) || 0), headerCells.length);

  const columnField = [];
  const claimed = new Set();
  for (let column = 0; column < width; column += 1) {
    let field = positional
      ? (fields[column] && fields[column].key) || null
      : aliasIndex.get(normalizeHeader(headerCells[column])) || null;
    // Two columns feeding one field would have the second silently overwrite the first.
    if (field && claimed.has(field)) field = null;
    if (field) claimed.add(field);
    columnField.push(field);
  }

  const rows = [];
  for (let i = positional ? 0 : headerIndex + 1; i < matrix.length; i += 1) {
    const row = matrix[i] || [];
    if (row.every(isBlank)) continue;

    const mapped = { __excelRow: firstRow + i + 1 };
    let hasValue = false;
    columnField.forEach((field, column) => {
      if (!field) return;
      const cell = row[column] ?? null;
      mapped[field] = cell;
      if (!isBlank(cell)) hasValue = true;
    });
    if (!hasValue) continue;

    // A header repeated mid-file (long lists printed page by page) and "Total" footers
    // are layout, not data.
    const firstField = fields[0] && fields[0].key;
    const label = firstField ? toImportText(mapped[firstField]).toLowerCase() : '';
    if (/^(total|grand total|sub ?total|sum|end)\b/.test(label)) continue;
    const repeatsHeader =
      !positional &&
      columnField.some(Boolean) &&
      columnField.every((field, column) => !field || isBlank(row[column]) || normalizeHeader(row[column]) === normalizeHeader(headerCells[column]));
    if (repeatsHeader) continue;

    rows.push(mapped);
  }

  return {
    rows,
    headerRow: positional ? null : firstRow + headerIndex + 1,
    sheetName: best.sheetName,
    matchedFields: [...claimed],
    missingFields: [...requiredKeys].filter((key) => !claimed.has(key)),
  };
};

module.exports = { readSheetRows, normalizeHeader };
