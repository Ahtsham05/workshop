const XLSX = require('xlsx');
const { readSheetRows, normalizeHeader } = require('../../../src/utils/importSheet');

const FIELDS = [
  { key: 'firstName', label: 'First Name', required: true, aliases: ['Name', 'Student Name'] },
  { key: 'lastName', label: 'Last Name' },
  { key: 'gender', label: 'Gender', required: true },
  { key: 'class', label: 'Class', required: true, aliases: ['Grade'] },
  { key: 'monthlyFee', label: 'Monthly Fee', aliases: ['Fee'] },
];

const toBuffer = (sheets) => {
  const workbook = XLSX.utils.book_new();
  Object.entries(sheets).forEach(([name, rows]) => {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  });
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

describe('readSheetRows', () => {
  test('finds the header row under a title and blank rows, and numbers rows as Excel does', () => {
    const buffer = toBuffer({
      Sheet1: [
        ['Al-Noor School — Admission List'],
        [],
        ['Student Name', 'Last Name', 'Gender', 'Class', 'Fee'],
        ['Ahmed', 'Ali', 'male', 'Class 1', 3000],
      ],
    });

    const { rows, headerRow, missingFields } = readSheetRows(buffer, FIELDS);

    expect(headerRow).toBe(3);
    expect(missingFields).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ __excelRow: 4, firstName: 'Ahmed', gender: 'male', class: 'Class 1' });
  });

  test('matches headers regardless of case, spacing or a (required) marker', () => {
    const buffer = toBuffer({
      Sheet1: [
        ['first_name (required)', 'LAST NAME', ' Gender ', 'Grade', 'Monthly  Fee'],
        ['Sara', 'Khan', 'female', 'Class 2', 3500],
      ],
    });

    const { rows, matchedFields } = readSheetRows(buffer, FIELDS);

    expect(matchedFields).toEqual(expect.arrayContaining(['firstName', 'lastName', 'gender', 'class', 'monthlyFee']));
    expect(rows[0].firstName).toBe('Sara');
    expect(rows[0].monthlyFee).toBe(3500);
  });

  test('picks the sheet that holds the data, not blindly the first one', () => {
    const buffer = toBuffer({
      Instructions: [['Fill in the Students tab'], ['Do not edit this sheet']],
      Students: [
        ['First Name', 'Gender', 'Class'],
        ['Ahmed', 'male', 'Class 1'],
      ],
    });

    const { rows, sheetName } = readSheetRows(buffer, FIELDS);

    expect(sheetName).toBe('Students');
    expect(rows).toHaveLength(1);
  });

  test('leaves out blank rows, a repeated header and a Total footer', () => {
    const buffer = toBuffer({
      Sheet1: [
        ['First Name', 'Last Name', 'Gender', 'Class', 'Fee'],
        ['Ahmed', 'Ali', 'male', 'Class 1', 3000],
        [],
        ['First Name', 'Last Name', 'Gender', 'Class', 'Fee'],
        ['Sara', 'Khan', 'female', 'Class 2', 3500],
        ['Total', '', '', '', 6500],
      ],
    });

    const { rows } = readSheetRows(buffer, FIELDS);

    expect(rows.map((row) => row.firstName)).toEqual(['Ahmed', 'Sara']);
  });

  test('falls back to template column order when there is no header row', () => {
    const buffer = toBuffer({ Sheet1: [['Ahmed', 'Ali', 'male', 'Class 1', 3000]] });

    const { rows, headerRow } = readSheetRows(buffer, FIELDS);

    expect(headerRow).toBeNull();
    expect(rows[0]).toMatchObject({ firstName: 'Ahmed', lastName: 'Ali', gender: 'male', class: 'Class 1' });
  });

  test('reports which required columns are missing instead of silently importing nothing', () => {
    const buffer = toBuffer({
      Sheet1: [
        ['First Name', 'Last Name'],
        ['Ahmed', 'Ali'],
      ],
    });

    const { missingFields } = readSheetRows(buffer, FIELDS);

    expect(missingFields).toEqual(expect.arrayContaining(['gender', 'class']));
  });

  test('ignores a second column claiming a field the first one already fills', () => {
    const buffer = toBuffer({
      Sheet1: [
        ['First Name', 'Name', 'Gender', 'Class'],
        ['Ahmed', 'SHOULD BE IGNORED', 'male', 'Class 1'],
      ],
    });

    const { rows } = readSheetRows(buffer, FIELDS);

    expect(rows[0].firstName).toBe('Ahmed');
  });

  test('keeps real Excel row numbers when the data does not start at A1', () => {
    const sheet = XLSX.utils.aoa_to_sheet(
      [
        ['First Name', 'Gender', 'Class'],
        ['Ahmed', 'male', 'Class 1'],
      ],
      { origin: 'C5' },
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');

    const { rows, headerRow } = readSheetRows(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), FIELDS);

    expect(headerRow).toBe(5);
    expect(rows[0].__excelRow).toBe(6);
  });
});

describe('normalizeHeader', () => {
  test('collapses the ways one header gets written', () => {
    ['Sale Price', 'sale_price', 'SALE-PRICE', 'Sale price:', 'Sale Price (required)'].forEach((header) => {
      expect(normalizeHeader(header)).toBe('saleprice');
    });
  });
});
