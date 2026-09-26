const {
  isBlockedAddress,
  sniffImageFormat,
  scoreResult,
  queryTerms,
  relevanceOf,
  parseYandexImages,
  proxiedImageUrl,
  raceDownloads,
} = require('../../../src/services/webImageSearch.service');
const config = require('../../../src/config/config');

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

describe('webImageSearch relevance', () => {
  const query = 'Anker A2724 PowerDrive III 40W Duo USBC Car Charger';
  const terms = queryTerms(query);
  const weightOf = (term) => (terms.find((t) => t.term === term) || {}).weight;

  test('a model code outweighs a spec, which outweighs a plain word', () => {
    expect(weightOf('a2724')).toBeGreaterThan(weightOf('40w'));
    expect(weightOf('40w')).toBeGreaterThan(weightOf('charger'));
  });

  test('a number-plus-unit is a spec, not a model code', () => {
    const phone = queryTerms('Samsung Galaxy A15 128GB 950g');
    expect(phone.find((t) => t.term === 'a15').weight).toBe(8);
    expect(phone.find((t) => t.term === '128gb').weight).toBe(2);
    expect(phone.find((t) => t.term === '950g').weight).toBe(2);
  });

  test('the manufacturer shot (SKU in file name) scores high', () => {
    const shot = {
      title: 'Anker PowerDrive III Duo',
      url: 'https://cdn.shopify.com/s/files/1/0743/7769/1325/files/A2724013_ND01_V1_1.png',
      sourceUrl: 'https://www.anker.com/ca/products/a2724',
      author: 'anker.com',
    };
    expect(relevanceOf(shot, terms)).toBeGreaterThanOrEqual(0.7);
  });

  test('a stock photo that only shares "car" is irrelevant', () => {
    const stock = {
      title: 'A white electric car plugged into a charger at an outdoor parking area',
      url: 'https://images.pexels.com/photos/123/pexels-photo-123.jpeg',
      sourceUrl: 'https://www.pexels.com/photo/white-car-123/',
      author: 'Someone',
    };
    expect(relevanceOf(stock, terms)).toBeLessThan(0.25);
  });

  test('"USB-C" satisfies "usbc", but "car" does not match "cardigan"', () => {
    const [usbc] = queryTerms('usbc');
    expect(relevanceOf({ title: 'Fast USB-C cable' }, [usbc])).toBe(1);
    expect(relevanceOf({ title: 'Wool cardigan' }, queryTerms('car'))).toBe(0);
  });

  test('a relevant web hit outranks an irrelevant one from the same provider', () => {
    const base = { provider: 'yandex', url: 'https://x.test/a.jpg', width: 800, height: 800 };
    expect(scoreResult({ ...base, relevance: 0.9 })).toBeGreaterThan(scoreResult({ ...base, relevance: 0.3 }));
  });
});

describe('webImageSearch Yandex parsing', () => {
  const entity = {
    origUrl: 'https://cdn.example.com/A2724.png',
    image: '//avatars.mds.yandex.net/i?id=abc',
    origWidth: 2400,
    origHeight: 2400,
    snippet: { title: 'Anker "PowerDrive" & Co', url: 'https://anker.com/a2724', domain: 'anker.com' },
    viewerData: { dups: [{ url: 'https://mirror.example.com/a.jpg', w: 1000, h: 1000 }] },
  };
  const encode = (obj) => JSON.stringify(obj).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  test('reads entities out of the HTML-encoded data-state attribute, in page order', () => {
    const state = {
      initialState: {
        serpList: {
          items: { keys: ['b', 'a'], entities: { a: entity, b: { ...entity, origUrl: 'https://b.test/b.jpg' } } },
        },
      },
    };
    const html = `<div data-state="${encode({ other: 1 })}"></div><div data-state="${encode(state)}"></div>`;
    const items = parseYandexImages(html);
    expect(items.map((i) => i.origUrl)).toEqual(['https://b.test/b.jpg', 'https://cdn.example.com/A2724.png']);
    expect(items[1].snippet.title).toBe('Anker "PowerDrive" & Co');
  });

  test('returns null for a captcha page so the provider reports itself unavailable', () => {
    expect(parseYandexImages('<html><form action="/checkcaptcha"></form></html>')).toBeNull();
  });
});

describe('webImageSearch fast image delivery', () => {
  test('builds a resized, never-enlarged CDN URL with the original encoded', () => {
    const url = proxiedImageUrl('https://shop.example/a b.png?v=1', 1200);
    expect(url).toMatch(
      /^https:\/\/wsrv\.nl\/\?url=https%3A%2F%2Fshop\.example%2Fa%20b\.png%3Fv%3D1&w=1200&h=1200&fit=inside&we$/
    );
  });

  test('returns empty when the proxy is disabled, so callers use the original', () => {
    const saved = config.webImageProxy;
    config.webImageProxy = '';
    try {
      expect(proxiedImageUrl('https://shop.example/a.jpg', 400)).toBe('');
    } finally {
      config.webImageProxy = saved;
    }
  });

  test('ignores a non-http URL', () => {
    expect(proxiedImageUrl('file:///etc/passwd', 400)).toBe('');
  });

  test('race rejects (does not hang) when every candidate is refused', async () => {
    await expect(
      raceDownloads(['http://127.0.0.1/a.jpg', 'http://10.0.0.1/b.jpg', 'http://169.254.169.254/c'])
    ).rejects.toThrow(/not reachable/);
  });
});
