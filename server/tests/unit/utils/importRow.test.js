const { toImportText, parseImportNumber, matchKey, phoneKey, isValidEmail } = require('../../../src/utils/importRow');

describe('import row helpers', () => {
  describe('parseImportNumber', () => {
    test('passes through real numbers', () => {
      expect(parseImportNumber(1250.5)).toEqual({ value: 1250.5, valid: true });
      expect(parseImportNumber(0)).toEqual({ value: 0, valid: true });
    });

    test('treats an empty cell as absent rather than invalid', () => {
      expect(parseImportNumber('')).toEqual({ value: undefined, valid: true });
      expect(parseImportNumber('   ')).toEqual({ value: undefined, valid: true });
      expect(parseImportNumber(null)).toEqual({ value: undefined, valid: true });
      expect(parseImportNumber(undefined)).toEqual({ value: undefined, valid: true });
    });

    test('strips currency and thousands separators', () => {
      expect(parseImportNumber('Rs 62,000').value).toBe(62000);
      expect(parseImportNumber('1,250.50').value).toBe(1250.5);
      expect(parseImportNumber('PKR 1 200').value).toBe(1200);
      expect(parseImportNumber('$99.99').value).toBe(99.99);
    });

    test('reads the European 1.250,50 convention', () => {
      expect(parseImportNumber('1.250,50').value).toBe(1250.5);
      expect(parseImportNumber('1.234.567').value).toBe(1234567);
      expect(parseImportNumber('12,5').value).toBe(12.5);
    });

    test('treats parentheses as negative but a trailing /- as the local suffix', () => {
      expect(parseImportNumber('(500)').value).toBe(-500);
      expect(parseImportNumber('-500').value).toBe(-500);
      expect(parseImportNumber('2,999/-').value).toBe(2999);
    });

    test('reads Urdu and Arabic digits', () => {
      expect(parseImportNumber('۱,۲۵۰').value).toBe(1250);
      expect(parseImportNumber('٣٥').value).toBe(35);
      expect(parseImportNumber('۳٫۵').value).toBe(3.5);
    });

    test('reports an unusable cell instead of guessing', () => {
      expect(parseImportNumber('abc')).toEqual({ value: undefined, valid: false });
      expect(parseImportNumber('-')).toEqual({ value: undefined, valid: false });
      expect(parseImportNumber(true)).toEqual({ value: undefined, valid: false });
      expect(parseImportNumber(NaN)).toEqual({ value: NaN, valid: false });
    });
  });

  describe('toImportText', () => {
    test('trims strings and stringifies numbers', () => {
      expect(toImportText('  Mobile Charger ')).toBe('Mobile Charger');
      expect(toImportText(8901234567890)).toBe('8901234567890');
    });

    test('treats anything else as absent rather than "[object Object]"', () => {
      expect(toImportText({ name: 'x' })).toBe('');
      expect(toImportText([1, 2])).toBe('');
      expect(toImportText(null)).toBe('');
      expect(toImportText(undefined)).toBe('');
    });
  });

  describe('phoneKey', () => {
    test('matches the same number however it is written', () => {
      const expected = '3001234567';
      expect(phoneKey('+92 300 1234567')).toBe(expected);
      expect(phoneKey('0300-1234567')).toBe(expected);
      expect(phoneKey('03001234567')).toBe(expected);
      expect(phoneKey('(0300) 1234567')).toBe(expected);
    });

    test('ignores anything too short to identify a subscriber', () => {
      expect(phoneKey('123')).toBe('');
      expect(phoneKey('')).toBe('');
      expect(phoneKey(null)).toBe('');
    });
  });

  describe('matchKey', () => {
    test('is case- and whitespace-insensitive', () => {
      expect(matchKey('  Ali Traders ')).toBe('ali traders');
      expect(matchKey('ALI TRADERS')).toBe(matchKey('ali traders'));
    });
  });

  describe('isValidEmail', () => {
    test('accepts ordinary addresses and rejects obvious mistakes', () => {
      expect(isValidEmail('ali@example.com')).toBe(true);
      expect(isValidEmail('ali@example')).toBe(false);
      expect(isValidEmail('not an email')).toBe(false);
      expect(isValidEmail('')).toBe(false);
    });
  });
});
