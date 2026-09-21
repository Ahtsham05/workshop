const { parsePriceList } = require('../../../src/utils/priceListParser');

// Flattened view of the parse — name + numeric values (+ kinds when a test cares about them).
const rowsOf = (text) =>
  parsePriceList(text).rows.map((r) => ({ name: r.name, values: r.values.map((v) => v.value) }));
const kindsOf = (text) => parsePriceList(text).rows.map((r) => r.values.map((v) => v.kind));

describe('priceListParser', () => {
  describe('name + price on one line', () => {
    test.each([
      ['Samsung A15 - 38500'],
      ['Samsung A15 = 38,500'],
      ['Samsung A15: 38500'],
      ['Samsung A15 @ 38500'],
      ['Samsung A15 – 38500'],
      ['Samsung A15 | 38500'],
      ['Samsung A15 → 38500'],
      ['Samsung A15 Rs. 38,500'],
      ['Samsung A15 PKR 38500'],
      ['Samsung A15 Price: 38500'],
      ['Samsung A15 38500/-'],
      ['Samsung A15 38500'],
      ['📱 *Samsung A15* ✅ 38,500'],
      ['1. Samsung A15 - 38,500'],
    ])('%s', (line) => {
      expect(rowsOf(line)).toEqual([{ name: 'Samsung A15', values: [38500] }]);
    });

    test('reads k / lac / hazar multipliers', () => {
      expect(rowsOf('Galaxy A25 = 62.5k')[0].values).toEqual([62500]);
      expect(rowsOf('Vivo Y36 1.2 lac')[0].values).toEqual([120000]);
      expect(rowsOf('Oppo A18 45 hazar')[0].values).toEqual([45000]);
      expect(rowsOf('Oppo A18 38.5 K')[0].values).toEqual([38500]);
    });

    test('reads Urdu/Arabic digits and keeps Urdu names', () => {
      expect(rowsOf('سیمسنگ A15 - ۳۸۵۰۰')).toEqual([{ name: 'سیمسنگ A15', values: [38500] }]);
      expect(rowsOf('Vivo Y18 ٣٤٥٠٠')[0].values).toEqual([34500]);
    });

    test('supports a price written before the name', () => {
      expect(rowsOf('1200 - Oppo A18 4/64')).toEqual([{ name: 'Oppo A18 4/64', values: [1200] }]);
    });
  });

  describe('numbers that are NOT prices', () => {
    test.each([
      ['Infinix Hot 40i 4/128'],
      ['Galaxy A15 128GB'],
      ['iPhone 15 Pro Max 256GB'],
      ['Redmi Note 13 Pro 8+256'],
      ['Type C cable 1.5m'],
      ['Tempered Glass 9D'],
      ['Galaxy A15 5G 4/128'],
      ['Samsung 55 inch'],
    ])('a spec-only line yields no price: %s', (line) => {
      expect(parsePriceList(line).rows).toEqual([]);
    });

    test('a trailing price after specs is still found', () => {
      expect(rowsOf('iPhone 15 128 350000')).toEqual([{ name: 'iPhone 15 128', values: [350000] }]);
      expect(rowsOf('iPhone 11 128 GB 120000')).toEqual([{ name: 'iPhone 11 128 GB', values: [120000] }]);
      expect(rowsOf('Galaxy S24 Ultra 12/256 445000/-')).toEqual([{ name: 'Galaxy S24 Ultra 12/256', values: [445000] }]);
      expect(rowsOf('Galaxy A05 64GB 26,500')[0].values).toEqual([26500]);
      expect(rowsOf('Router 300 Mbps 4500')[0].values).toEqual([4500]);
    });

    test('a separator does not turn a storage size into a price', () => {
      expect(rowsOf('iPhone 15 - 128 - 350000')[0].values).toEqual([350000]);
    });

    test('bare years and small bare numbers are not prices', () => {
      expect(parsePriceList('Price list 2026').rows).toEqual([]);
      expect(parsePriceList('Note 13 Pro').rows).toEqual([]);
    });

    test('dates, timestamps and phone numbers are ignored', () => {
      expect(parsePriceList('Rates valid till 15 Sep 2026').rows).toEqual([]);
      expect(parsePriceList('Rate list 12/09/2026 10:30 am').rows).toEqual([]);
      expect(parsePriceList('Call 0300-1234567 for orders').rows).toEqual([]);
      expect(parsePriceList('Contact +92 300 1234567').rows).toEqual([]);
    });

    test('an 8+ digit number is a barcode, kept as a code and removed from the name', () => {
      const [row] = parsePriceList('8801643123456 Galaxy A15 38500').rows;
      expect(row.codes).toEqual(['8801643123456']);
      expect(row.name).toBe('Galaxy A15');
      expect(row.values.map((v) => v.value)).toEqual([38500]);
    });
  });

  describe('WhatsApp exports', () => {
    test('strips the per-message prefix in both platform formats', () => {
      expect(rowsOf('[12/09/2026, 10:32:15 AM] Ali Traders: Tecno Spark 20 33999')).toEqual([
        { name: 'Tecno Spark 20', values: [33999] },
      ]);
      expect(rowsOf('12/09/26, 10:32 - Ali: Vivo Y18 4/128 - 34500')).toEqual([
        { name: 'Vivo Y18 4/128', values: [34500] },
      ]);
    });
  });

  describe('structure across lines', () => {
    test('a bold or ALL-CAPS heading becomes the section for the model lines below it', () => {
      const { rows } = parsePriceList('*SAMSUNG*\nA15 4/128 - 38500\nA25 8/256 - 62500\n\nINFINIX\nHot 40i - 27500');
      expect(rows.map((r) => [r.name, r.section])).toEqual([
        ['A15 4/128', 'SAMSUNG'],
        ['A25 8/256', 'SAMSUNG'],
        ['Hot 40i', 'INFINIX'],
      ]);
    });

    test('chatter is not mistaken for a heading', () => {
      const { rows, ignored } = parsePriceList('Assalam o alaikum sir new rates\nA15 - 38500');
      expect(rows[0].section).toBeNull();
      expect(ignored.map((i) => i.raw)).toContain('Assalam o alaikum sir new rates');
    });

    test('a name on one line takes the price on the next', () => {
      const { rows } = parsePriceList('Infinix Hot 40i 4/128\nPrice: 27,500/-');
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('Infinix Hot 40i 4/128');
      expect(rows[0].values.map((v) => v.value)).toEqual([27500]);
      expect(rows[0].line).toBe(1);
    });

    test('labelled follow-up lines attach to the same product', () => {
      const { rows } = parsePriceList('Samsung A15\nDealer: 35000\nRetail: 38500');
      expect(rows).toHaveLength(1);
      expect(rows[0].values).toEqual([
        { value: 35000, kind: 'cost', raw: '35000' },
        { value: 38500, kind: 'price', raw: '38500' },
      ]);
    });

    test('a stray price-only line after a finished row does not attach to it', () => {
      const { rows, ignored } = parsePriceList('Samsung A15 - 38500\nRs 5000');
      expect(rows).toHaveLength(1);
      expect(rows[0].values.map((v) => v.value)).toEqual([38500]);
      expect(ignored.map((i) => i.reason)).toContain('price_without_name');
    });
  });

  describe('price kinds', () => {
    test('inline dealer/retail labels', () => {
      expect(kindsOf('Tecno Spark 20  DP 31000  RP 33999')).toEqual([['cost', 'price']]);
      expect(kindsOf('Spark 20 Dealer 31000 Retail 33999')).toEqual([['cost', 'price']]);
      expect(rowsOf('Tecno Spark 20  DP 31000  RP 33999')[0].name).toBe('Tecno Spark 20');
    });

    test('an unlabelled price has no kind', () => {
      expect(kindsOf('Samsung A15 - 38500')).toEqual([[null]]);
    });
  });

  describe('tables (PDF text / Excel paste)', () => {
    test('header row names the columns', () => {
      const out = parsePriceList('Product | Dealer Price | Retail Price\niPhone 15 | 280000 | 310000\nGalaxy S24 | 250,000 | 275,000');
      expect(out.columnKinds).toEqual(['cost', 'price']);
      expect(out.rows.map((r) => [r.name, r.values.map((v) => [v.value, v.kind])])).toEqual([
        ['iPhone 15', [[280000, 'cost'], [310000, 'price']]],
        ['Galaxy S24', [[250000, 'cost'], [275000, 'price']]],
      ]);
    });

    test('tab-separated cells (pasted from Excel) work the same', () => {
      const out = parsePriceList('Item\tCost\tMRP\nGalaxy A15\t35000\t38500');
      expect(out.rows).toHaveLength(1);
      expect(out.rows[0].values.map((v) => [v.value, v.kind])).toEqual([[35000, 'cost'], [38500, 'price']]);
    });

    test('a qty column is dropped rather than read as a price', () => {
      const out = parsePriceList('Sr | Product | Qty | Price\n1 | Galaxy A15 | 150 | 38500\n2 | Galaxy A25 | 12 | 62500');
      expect(out.rows.map((r) => [r.name, r.values.map((v) => v.value)])).toEqual([
        ['Galaxy A15', [38500]],
        ['Galaxy A25', [62500]],
      ]);
    });

    test('a header without separators still labels the columns', () => {
      const out = parsePriceList('Product Dealer Price Retail Price\nGalaxy A15 35000 38500');
      expect(out.rows[0].values.map((v) => [v.value, v.kind])).toEqual([[35000, 'cost'], [38500, 'price']]);
    });

    test('a page printed in two columns yields one product per name/number group', () => {
      const out = parsePriceList('Galaxy A15 | 38500 | Galaxy A25 | 62500\nHot 40i | 27500 | Spark 20 | 31000');
      expect(out.rows.map((r) => [r.name, r.values.map((v) => v.value)])).toEqual([
        ['Galaxy A15', [38500]],
        ['Galaxy A25', [62500]],
        ['Hot 40i', [27500]],
        ['Spark 20', [31000]],
      ]);
      expect(out.rows.map((r) => r.line)).toEqual([1, 1, 2, 2]);
    });

    test('a repeated header ("Product | Price | Product | Price") is recognised and skipped', () => {
      const out = parsePriceList('Product | Price | Product | Price\nGalaxy A15 | 38500 | Galaxy A25 | 62500');
      expect(out.rows).toHaveLength(2);
      expect(out.ignored).toEqual([]);
    });

    test('brand and model in separate cells join into one name', () => {
      const out = parsePriceList('Brand | Model | Price\nSamsung | Galaxy A15 4/128 | 38500');
      expect(out.rows[0].name).toBe('Samsung Galaxy A15 4/128');
    });

    test('a short trailing text cell (PTA, Black) becomes part of the name; a long one is a note', () => {
      const out = parsePriceList('Vivo Y36 | 45000 | PTA Approved\nOppo A18 | 25000 | Stock will be available after Monday next week');
      expect(out.rows[0].name).toBe('Vivo Y36 PTA Approved');
      expect(out.rows[1].name).toBe('Oppo A18');
      expect(out.rows[1].note).toMatch(/available after Monday/);
    });

    test('without a header, a small numeric cell is not a price', () => {
      const out = parsePriceList('Galaxy A15 | 12 | 38500');
      expect(out.rows[0].values.map((v) => v.value)).toEqual([38500]);
    });
  });

  describe('warnings', () => {
    test('flags per-dozen / per-carton pricing', () => {
      const [row] = parsePriceList('Airpods 2nd Gen 12500 per dozen').rows;
      expect(row.warnings).toContain('pack_price');
      expect(row.values[0].value).toBe(12500);
    });

    test('flags a price range and keeps both ends', () => {
      const [row] = parsePriceList('Oppo A18 38000-40000').rows;
      expect(row.warnings).toContain('range');
      expect(row.values.map((v) => v.value)).toEqual([38000, 40000]);
      expect(parsePriceList('Oppo A18 38,000 - 40,000').rows[0].warnings).toContain('range');
    });

    test('keeps a hyphenated model such as A15-128 in the name', () => {
      const [row] = parsePriceList('A15-128 38500').rows;
      expect(row.name).toBe('A15-128');
      expect(row.warnings).not.toContain('range');
    });

    test('flags a "+500" price change', () => {
      expect(parsePriceList('Samsung A15 +500').rows[0].warnings).toContain('signed_change');
    });
  });

  describe('nothing disappears silently', () => {
    test('every dropped line is reported with a reason', () => {
      const { rows, ignored, stats } = parsePriceList('Hello\nSamsung A15 - 38500\nRs 5000\n\nOK thanks');
      expect(rows).toHaveLength(1);
      expect(ignored.map((i) => i.reason).sort()).toEqual(['no_price', 'no_price', 'price_without_name'].sort());
      expect(stats).toMatchObject({ parsed: 1, truncated: false });
    });

    test('a realistic mixed message parses end to end', () => {
      const text = [
        '[12/09/2026, 10:32:15 AM] Ali Traders: Assalam o alaikum sir new rates',
        '*SAMSUNG*',
        'A15 4/128 - 38,500',
        'Galaxy A25 8/256 = 62.5k',
        '',
        'Infinix Hot 40i 4/128',
        'Price: 27500/-',
        '',
        'Tecno Spark 20  DP 31000  RP 33999',
        'Rate 12/09/2026 valid till 15 Sep',
      ].join('\n');
      const { rows } = parsePriceList(text);
      expect(rows.map((r) => [r.name, r.values.map((v) => v.value)])).toEqual([
        ['A15 4/128', [38500]],
        ['Galaxy A25 8/256', [62500]],
        ['Infinix Hot 40i 4/128', [27500]],
        ['Tecno Spark 20', [31000, 33999]],
      ]);
    });
  });

  describe('robustness', () => {
    test('never throws on junk input', () => {
      [null, undefined, '', '\n\n\n', '💥💥💥', '|||', '---', 42, {}, 'a'.repeat(50000)].forEach((input) => {
        const out = parsePriceList(input);
        expect(Array.isArray(out.rows)).toBe(true);
        expect(Array.isArray(out.ignored)).toBe(true);
      });
    });

    test('caps very long documents and reports the truncation', () => {
      const text = Array.from({ length: 6000 }, (_, i) => `Product ${i} - ${10000 + i}`).join('\n');
      const started = Date.now();
      const out = parsePriceList(text);
      expect(out.stats.truncated).toBe(true);
      expect(out.rows).toHaveLength(5000);
      expect(Date.now() - started).toBeLessThan(3000);
    });
  });
});
