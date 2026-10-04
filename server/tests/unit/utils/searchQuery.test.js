const { tokenizeSearch, tokenSearchClauses, scoreText, rankDocuments } = require('../../../src/utils/searchQuery');

describe('searchQuery', () => {
  test('tokenizes on whitespace, drops duplicates, caps at 8 words', () => {
    expect(tokenizeSearch('  jbl   JBL speaker ')).toEqual(['jbl', 'speaker']);
    expect(tokenizeSearch('a b c d e f g h i j')).toHaveLength(8);
    expect(tokenizeSearch('   ')).toEqual([]);
  });

  test('builds one $or per word and escapes regex characters', () => {
    const clauses = tokenSearchClauses('jbl (x', ['name', 'barcode']);
    expect(clauses).toHaveLength(2);
    expect(clauses[1].$or[0].name.$regex).toBe('\\(x');
    expect(tokenSearchClauses('   ', ['name'])).toEqual([]);
  });

  test('ranks exact > starts-with > phrase > first/last word > anywhere', () => {
    const q = 'jbl speaker';
    const s = (t) => scoreText(t, q);
    expect(s('JBL Speaker')).toBeGreaterThan(s('JBL Speaker Go 4'));
    expect(s('JBL Speaker Go 4')).toBeGreaterThan(s('New JBL Speaker'));
    expect(s('JBL Charge 3 BT Speaker')).toBeGreaterThan(s('Portable speaker by JBL Go'));
    expect(s('Portable speaker by JBL Go')).toBeGreaterThan(0);
    expect(s('Sony headphones')).toBe(0);
  });

  test('rankDocuments puts the best match first and keeps ties in order', () => {
    const docs = [{ name: 'Mini JBL Speaker' }, { name: 'JBL Speaker' }, { name: 'JBL Charge Speaker' }];
    expect(rankDocuments(docs, 'jbl speaker', 'name').map((d) => d.name)).toEqual([
      'JBL Speaker',
      'Mini JBL Speaker', // exact phrase beats the words merely being present
      'JBL Charge Speaker',
    ]);
  });
});
