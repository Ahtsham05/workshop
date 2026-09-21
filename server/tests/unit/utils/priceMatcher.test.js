const { buildCatalogIndex, matchRow, tokenize, aliasKey } = require('../../../src/utils/priceMatcher');

const entry = (id, name, extra = {}) => ({ id, name, ...extra });

const CATALOG = [
  entry('a15-4', 'Samsung Galaxy A15 4GB/128GB'),
  entry('a15-6', 'Samsung Galaxy A15 6GB/128GB'),
  entry('a25', 'Samsung Galaxy A25 8GB/256GB'),
  entry('s24u', 'Samsung Galaxy S24 Ultra 12GB/256GB'),
  entry('hot40i', 'Infinix Hot 40i 4GB/128GB'),
  entry('spark20', 'Tecno Spark 20 8GB/256GB'),
  entry('redmi13c', 'Redmi 13C 6GB/128GB'),
  entry('oppo-a18', 'Oppo A18 4GB/64GB'),
  entry('ip15', 'Apple iPhone 15 128GB'),
  entry('ip15pm', 'Apple iPhone 15 Pro Max 256GB'),
  entry('y36-pta', 'Vivo Y36 8GB/256GB PTA'),
  entry('y36-non', 'Vivo Y36 8GB/256GB Non PTA'),
  entry('sam-charger', 'Samsung 25W Fast Charger'),
  entry('anker-charger', 'Anker 25W Charger'),
  entry('cable-1m', 'Type C Cable 1m'),
  entry('cable-2m', 'Type C Cable 2m'),
  entry('airpods', 'Apple Airpods Pro 2'),
  entry('urdu-charger', 'Charger 20W', { nameUrdu: 'چارجر' }),
  entry('coded', 'Galaxy Buds', { barcode: '8801643123456', sku: 'SM-R510' }),
];
const index = buildCatalogIndex(CATALOG);
const match = (name, extra = {}) => matchRow(index, { name, ...extra });
const idOf = (result) => (result.entry ? result.entry.id : null);

describe('priceMatcher', () => {
  describe('spec normalization', () => {
    test.each([['4GB/128GB'], ['4gb 128gb'], ['4+128'], ['4 / 128'], ['4-128'], ['4GB RAM 128GB ROM'], ['4gb/128 gb']])(
      'RAM/ROM written as %s becomes one 4/128 token',
      (spec) => {
        expect([...tokenize(`Galaxy A15 ${spec}`).hard.keys()]).toEqual(expect.arrayContaining(['a15', '4/128']));
      },
    );

    test('storage, dimensions and glued words normalize', () => {
      expect(tokenize('iPad 1TB').hard.has('1024gb')).toBe(true);
      expect(tokenize('Charger 20 Watt').hard.get('20w')).toBe('dim');
      expect(tokenize('Cable 1.5 m').hard.get('1.5m')).toBe('dim');
      expect(tokenize('iphone15 pro').soft).toEqual(expect.arrayContaining(['iphone', 'pro']));
      expect(tokenize('iphone15 pro').hard.has('15')).toBe(true);
    });

    test('a pair also satisfies its storage', () => {
      expect(tokenize('A15 4/128').hard.has('128gb')).toBe(true);
    });

    test('aliasKey is stable across spec notation', () => {
      expect(aliasKey('Galaxy A15 4GB/128GB')).toBe(aliasKey('galaxy  a15 4+128'));
    });
  });

  describe('confident matches', () => {
    test('same product, different notation', () => {
      const r = match('Samsung Galaxy A15 4/128');
      expect(r).toMatchObject({ status: 'high', method: 'exact' });
      expect(idOf(r)).toBe('a15-4');
    });

    test('picks the right RAM/ROM variant', () => {
      expect(idOf(match('Samsung Galaxy A15 6/128'))).toBe('a15-6');
      expect(match('Samsung Galaxy A15 6/128').status).toBe('high');
    });

    test('a missing brand word is fine when the model and specs pin the product', () => {
      const r = match('Galaxy A15 4/128');
      expect(r.status).toBe('high');
      expect(idOf(r)).toBe('a15-4');
      expect(idOf(match('Hot 40i 4/128'))).toBe('hot40i');
      expect(match('Hot 40i 4/128').status).toBe('high');
    });

    test('a one-letter typo in a long word still matches, and says so', () => {
      const r = match('Infnix Hot 40i 4/128');
      expect(idOf(r)).toBe('hot40i');
      expect(r.status).toBe('high');
      expect(r.flags).toContain('fuzzy_words');
    });

    test('brand-section context completes a model-only line', () => {
      const r = match('A15 4/128', { section: 'SAMSUNG' });
      expect(r.status).toBe('high');
      expect(idOf(r)).toBe('a15-4');
      expect(r.flags).toContain('section_used');
    });

    test('a barcode or SKU is authoritative', () => {
      expect(match('whatever', { codes: ['8801643123456'] })).toMatchObject({ status: 'high', method: 'code' });
      expect(idOf(match('Buds sm-r510 12000'))).toBe('coded');
    });

    test('Urdu names match on the Urdu field', () => {
      expect(idOf(match('چارجر 20W'))).toBe('urdu-charger');
    });
  });

  describe('never confidently pairs two DIFFERENT products', () => {
    test('a RAM/ROM the catalog does not have is not matched to a sibling', () => {
      const r = match('Samsung Galaxy A15 8/256');
      expect(r.status).toBe('none');
      expect(r.entry).toBeNull();
      // ...but the near-misses are offered for a human to look at.
      expect(r.alternatives.map((a) => a.entry.id)).toEqual(expect.arrayContaining(['a15-4']));
    });

    test('a different model number is a conflict', () => {
      expect(match('Samsung Galaxy A35 4/128').status).toBe('none');
      expect(match('Apple iPhone 14 128GB').status).not.toBe('high');
    });

    test('"Pro" is not "Pro Max"', () => {
      const r = match('Apple iPhone 15 Pro 256GB');
      expect(r.status).not.toBe('high');
      if (r.entry) expect(r.flags).toContain('variant_word');
    });

    test('"Pro Max" is not plain', () => {
      expect(match('iPhone 15 Pro Max 256GB').status).toBe('high');
      expect(idOf(match('iPhone 15 Pro Max 256GB'))).toBe('ip15pm');
    });

    test('PTA vs Non PTA', () => {
      expect(idOf(match('Vivo Y36 8/256 PTA'))).toBe('y36-pta');
      expect(match('Vivo Y36 8/256 PTA').status).toBe('high');
      expect(idOf(match('Vivo Y36 8/256 Non PTA'))).toBe('y36-non');
      // Not saying which one is a coin-flip on price: never auto-selected.
      expect(match('Vivo Y36 8/256').status).not.toBe('high');
    });

    test('cable lengths', () => {
      expect(idOf(match('Type C Cable 2m'))).toBe('cable-2m');
      expect(match('Type C Cable 3m').status).toBe('none');
    });

    test('a generic name that fits two products is ambiguous, not guessed', () => {
      const r = match('Charger 25W');
      expect(r.status).toBe('review');
      expect(r.flags).toContain('ambiguous');
      expect(r.alternatives.length).toBeGreaterThan(0);
    });

    test('two products with the same name are ambiguous', () => {
      const dup = buildCatalogIndex([entry('u1', 'USB Cable'), entry('u2', 'USB Cable')]);
      const r = matchRow(dup, { name: 'USB Cable' });
      expect(r.status).toBe('review');
      expect(r.flags).toContain('ambiguous');
    });

    test('a stale section heading can only break a tie, never override the name', () => {
      // "SAMSUNG" is still the section, but this line is an Infinix.
      const r = match('Hot 40i 4/128', { section: 'SAMSUNG' });
      expect(idOf(r)).toBe('hot40i');
      // A tie between the two chargers is settled toward the section's brand, but still needs review.
      const tie = match('Charger 25W', { section: 'SAMSUNG' });
      expect(tie.status).toBe('review');
      expect(idOf(tie)).toBe('sam-charger');
    });

    test('a product that is more specific than the line is only a suggestion', () => {
      const r = match('Samsung Galaxy A15');
      expect(r.status).not.toBe('high');
      expect(r.flags).toContain('ambiguous');
    });

    test('a lone product with extra specs is still not auto-matched to a line that omits them', () => {
      // No sibling to make it "ambiguous": the ONLY thing stopping a high match is that the
      // catalog's product pins down a RAM/ROM the price list never mentioned.
      const only = buildCatalogIndex([entry('solo', 'Samsung Galaxy A15 4GB/128GB')]);
      const r = matchRow(only, { name: 'Samsung Galaxy A15' });
      expect(r.status).toBe('review');
      expect(r.flags).toContain('product_more_specific');
      expect(r.flags).not.toContain('ambiguous');
    });

    test('a lone "Pro Max" is not auto-matched to a plain "Pro" line', () => {
      const only = buildCatalogIndex([entry('solo', 'Apple iPhone 15 Pro Max')]);
      const r = matchRow(only, { name: 'Apple iPhone 15 Pro' });
      expect(r.status).not.toBe('high');
      expect(r.flags).toContain('variant_word');
    });

    test('unrelated lines match nothing', () => {
      expect(match('Wooden Chair').status).toBe('none');
      expect(match('   ').status).toBe('none');
      expect(matchRow(buildCatalogIndex([]), { name: 'Galaxy A15' }).status).toBe('none');
    });
  });

  describe('scale', () => {
    test('500 lines against a 20,000-product catalog in a reasonable time', () => {
      const brands = ['Samsung', 'Infinix', 'Tecno', 'Oppo', 'Vivo', 'Xiaomi', 'Realme', 'Nokia'];
      const big = [];
      for (let i = 0; i < 20000; i += 1) {
        big.push(entry(`p${i}`, `${brands[i % brands.length]} Model X${i} ${[4, 6, 8][i % 3]}GB/${[64, 128, 256][i % 3]}GB`));
      }
      const bigIndex = buildCatalogIndex(big);

      const started = Date.now();
      let high = 0;
      for (let i = 0; i < 500; i += 1) {
        const target = big[(i * 37) % big.length];
        const result = matchRow(bigIndex, { name: target.name.replace('GB', '').replace('GB', '') });
        if (result.status === 'high' && result.entry.id === target.id) high += 1;
      }
      const elapsed = Date.now() - started;
      expect(high).toBeGreaterThan(450);
      expect(elapsed).toBeLessThan(4000);
    });
  });
});
