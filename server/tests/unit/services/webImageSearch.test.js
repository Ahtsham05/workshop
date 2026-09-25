const { isBlockedAddress, sniffImageFormat, scoreResult } = require('../../../src/services/webImageSearch.service');

describe('webImageSearch SSRF guard', () => {
  test.each([
    ['127.0.0.1', 'loopback'],
    ['10.1.2.3', 'private class A'],
    ['172.16.0.1', 'private class B (low)'],
    ['172.31.255.254', 'private class B (high)'],
    ['192.168.1.10', 'private class C'],
    ['169.254.169.254', 'cloud metadata'],
    ['100.64.0.1', 'carrier-grade NAT'],
    ['0.0.0.0', 'unspecified'],
    ['224.0.0.1', 'multicast'],
    ['::1', 'IPv6 loopback'],
    ['fe80::1', 'IPv6 link-local'],
    ['fd00::1', 'IPv6 unique-local'],
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
    ['not-an-ip', 'garbage'],
  ])('blocks %s (%s)', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  test.each([
    ['8.8.8.8'],
    ['1.1.1.1'],
    ['172.15.0.1'], // just below the private range
    ['172.32.0.1'], // just above it
    ['2606:4700:4700::1111'],
  ])('allows public address %s', (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });
});

describe('webImageSearch image sniffing', () => {
  const withPrefix = (bytes) => Buffer.concat([Buffer.from(bytes), Buffer.alloc(16)]);

  test('recognises JPEG', () => {
    expect(sniffImageFormat(withPrefix([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
  });

  test('recognises PNG', () => {
    expect(sniffImageFormat(withPrefix([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
  });

  test('recognises GIF', () => {
    expect(sniffImageFormat(withPrefix(Buffer.from('GIF89a')))).toBe('gif');
  });

  test('recognises WebP', () => {
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]);
    expect(sniffImageFormat(webp)).toBe('webp');
  });

  test('rejects an HTML error page served with an image content-type', () => {
    expect(sniffImageFormat(Buffer.from('<!DOCTYPE html><html><body>404 not found</body></html>'))).toBeNull();
  });

  test('rejects a truncated buffer', () => {
    expect(sniffImageFormat(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});

describe('webImageSearch ranking', () => {
  const result = (overrides) => ({
    provider: 'duckduckgo',
    url: 'https://cdn.example.com/a.jpg',
    width: 800,
    height: 800,
    exactMatch: false,
    ...overrides,
  });

  test('a barcode match outranks a web hit of the same size', () => {
    const barcode = result({ provider: 'openfoodfacts', exactMatch: true });
    expect(scoreResult(barcode)).toBeGreaterThan(scoreResult(result()));
  });

  test('a web hit outranks a stock photo of the same size', () => {
    expect(scoreResult(result())).toBeGreaterThan(scoreResult(result({ provider: 'pexels' })));
  });

  test('a square image outranks a wide banner crop', () => {
    const banner = result({ width: 1600, height: 400 });
    expect(scoreResult(result())).toBeGreaterThan(scoreResult(banner));
  });

  test('a tiny thumbnail is penalised', () => {
    expect(scoreResult(result({ width: 80, height: 80 }))).toBeLessThan(scoreResult(result()));
  });
});
