const config = require('../../../src/config/config');

jest.mock('../../../src/services/productVision.service', () => ({
  geminiRequest: jest.fn(),
  extractGeminiText: jest.fn(),
  resolveModelsToTry: jest.fn(),
}));
const vision = require('../../../src/services/productVision.service');
const { extractText, itemsToLines } = require('../../../src/services/priceListExtract.service');
const { parsePriceList } = require('../../../src/utils/priceListParser');

const { execFileSync } = require('child_process');
const path = require('path');

jest.setTimeout(60000);

// Real pdf.js extraction runs in a child Node process (see tests/utils/extractPdfChild.js).
const extractInChild = (files) => {
  const stdout = execFileSync(process.execPath, [path.join(__dirname, '../../utils/extractPdfChild.js')], {
    input: JSON.stringify(files.map((f) => ({ base64: f.toString('base64'), mime: 'application/pdf' }))),
    maxBuffer: 50 * 1024 * 1024,
    env: { ...process.env, NODE_ENV: 'test' },
  });
  return JSON.parse(stdout.toString('utf8'));
};

/**
 * Builds a real (minimal, single-font) PDF from positioned text so extraction is tested against
 * pdf.js itself rather than against hand-made "text item" fixtures. `items` are
 * { x, y, text, size } in PDF points, origin bottom-left, A4.
 */
const buildPdf = (pages) => {
  const objects = [];
  const push = (body) => {
    objects.push(body);
    return objects.length;
  };
  push('<< /Type /Catalog /Pages 2 0 R >>');
  push('PAGES');
  push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageNumbers = pages.map((items) => {
    const content = items
      .map(({ x, y, text, size = 11 }) => `BT /F1 ${size} Tf ${x} ${y} Td (${text.replace(/[()\\]/g, '\\$&')}) Tj ET`)
      .join('\n');
    const contentNumber = push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    return push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNumber} 0 R >>`);
  });
  objects[1] = `<< /Type /Pages /Kids [${pageNumbers.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageNumbers.length} >>`;

  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
};

// One row per y, cells at the given x positions.
const table = (rows, xs, startY = 780, step = 18) =>
  rows.flatMap((cells, r) => cells.map((text, c) => ({ x: xs[c], y: startY - r * step, text })));

describe('priceListExtract.service', () => {
  describe('itemsToLines', () => {
    const item = (str, x, y, width = str.length * 5.5, size = 11) => ({ str, transform: [size, 0, 0, size, x, y], width, height: size });

    test('clusters fragments into rows by y, top of page first, ordered by x', () => {
      const lines = itemsToLines([item('B', 200, 700), item('A', 50, 700), item('Second row', 50, 682), item('Top', 50, 760)]);
      expect(lines).toEqual(['Top', 'A \t B', 'Second row']);
    });

    test('adjacent fragments of one line are joined with a space, not a tab', () => {
      const lines = itemsToLines([item('Galaxy', 50, 700), item('A15', 88, 700), item('4/128', 113, 700)]);
      expect(lines).toEqual(['Galaxy A15 4/128']);
    });

    test('a wide gap becomes a tab (a column break)', () => {
      expect(itemsToLines([item('iPhone 15', 50, 700), item('280000', 300, 700)])).toEqual(['iPhone 15 \t 280000']);
    });

    test('ignores blank fragments and tolerates empty input', () => {
      expect(itemsToLines([item('   ', 50, 700), item('', 60, 700)])).toEqual([]);
      expect(itemsToLines([])).toEqual([]);
    });
  });

  describe('PDF with a text layer (real pdf.js, in a child process)', () => {
    let extracted;
    const fixtures = {
      lines: buildPdf([[
        { x: 50, y: 780, text: 'SAMSUNG' },
        { x: 50, y: 762, text: 'A15 4/128 - 38,500' },
        { x: 50, y: 744, text: 'Galaxy A25 8/256 = 62.5k' },
      ]]),
      table: buildPdf([table(
        [
          ['Product', 'Dealer Price', 'Retail Price'],
          ['iPhone 15 128GB', '280000', '310000'],
          ['Galaxy S24 Ultra 12/256', '250000', '275000'],
        ],
        [50, 300, 420],
      )]),
      twoColumns: buildPdf([table(
        [['Galaxy A15 4/128', '38500', 'Galaxy A25 8/256', '62500'], ['Hot 40i 4/128', '27500', 'Spark 20 8/256', '31000']],
        [50, 200, 310, 460],
      )]),
      pages: buildPdf([
        [{ x: 50, y: 780, text: 'Page one item - 1500' }],
        [{ x: 50, y: 780, text: 'Page two item - 2500' }],
      ]),
      scan: buildPdf([[]]),
      damaged: Buffer.from('this is not a pdf at all'),
    };

    beforeAll(() => {
      const names = Object.keys(fixtures);
      const results = extractInChild(names.map((n) => fixtures[n]));
      extracted = Object.fromEntries(names.map((n, i) => [n, results[i]]));
    });

    test('plain lines come out as lines and parse into rows', () => {
      const out = extracted.lines;
      expect(out).toMatchObject({ ok: true, method: 'pdf-text', pages: 1, truncated: false });
      expect(out.text.split('\n')).toEqual(['SAMSUNG', 'A15 4/128 - 38,500', 'Galaxy A25 8/256 = 62.5k']);
      expect(parsePriceList(out.text).rows.map((r) => [r.name, r.section, r.values[0].value])).toEqual([
        ['A15 4/128', 'SAMSUNG', 38500],
        ['Galaxy A25 8/256', 'SAMSUNG', 62500],
      ]);
    });

    test('a table keeps its columns: header kinds + cost/price per row', () => {
      const parsed = parsePriceList(extracted.table.text);
      expect(parsed.columnKinds).toEqual(['cost', 'price']);
      expect(parsed.rows.map((r) => [r.name, r.values.map((v) => [v.value, v.kind])])).toEqual([
        ['iPhone 15 128GB', [[280000, 'cost'], [310000, 'price']]],
        ['Galaxy S24 Ultra 12/256', [[250000, 'cost'], [275000, 'price']]],
      ]);
    });

    test('a two-column page yields both products from each printed row', () => {
      const rows = parsePriceList(extracted.twoColumns.text).rows;
      expect(rows.map((r) => [r.name, r.values[0].value])).toEqual([
        ['Galaxy A15 4/128', 38500],
        ['Galaxy A25 8/256', 62500],
        ['Hot 40i 4/128', 27500],
        ['Spark 20 8/256', 31000],
      ]);
    });

    test('reads every page, in order', () => {
      expect(extracted.pages).toMatchObject({ ok: true, pages: 2, text: 'Page one item - 1500\nPage two item - 2500' });
    });

    test('a scanned PDF (no text layer) explains itself when AI is not configured', () => {
      // The child process has no GEMINI_API_KEY in its environment.
      expect(extracted.scan).toMatchObject({ ok: false, statusCode: 422 });
      expect(extracted.scan.message).toMatch(/scan/i);
    });

    test('a damaged PDF is rejected clearly', () => {
      expect(extracted.damaged).toMatchObject({ ok: false, statusCode: 422 });
      expect(extracted.damaged.message).toMatch(/Could not read this PDF/);
    });
  });

  describe('files that cannot be read as text', () => {
    const originalKey = config.gemini.apiKey;
    afterEach(() => {
      config.gemini.apiKey = originalKey;
      jest.clearAllMocks();
    });


    test('a scanned PDF is read with AI when it is configured', async () => {
      config.gemini.apiKey = 'test-key';
      vision.resolveModelsToTry.mockResolvedValue(['gemini-test']);
      vision.geminiRequest.mockResolvedValue({});
      vision.extractGeminiText.mockReturnValue('```\nProduct | Price\nGalaxy A15 4/128 | 38500\nGalaxy A25 8/256 | 62500\nInfinix Hot 40i | 27500\n```');

      const out = await extractText(Buffer.from('%PDF'), 'application/pdf', { extractPdfText: async () => ({ text: '12', pages: 1 }) });
      expect(out).toMatchObject({ method: 'ai', model: 'gemini-test', pages: 1 });
      expect(out.text.startsWith('Product | Price')).toBe(true); // code fences stripped
      expect(out.notice).toMatch(/check the numbers/i);
      // The PDF itself goes to the model, as application/pdf.
      const sent = vision.geminiRequest.mock.calls[0][3];
      expect(sent.contents[0].parts[1].inline_data.mime_type).toBe('application/pdf');
      expect(sent.generationConfig.temperature).toBe(0);
    });

    test('an image is read with AI; without configuration it says so', async () => {
      config.gemini.apiKey = '';
      await expect(extractText(Buffer.from('x'), 'image/png')).rejects.toMatchObject({ statusCode: 503 });

      config.gemini.apiKey = 'test-key';
      vision.resolveModelsToTry.mockResolvedValue(['gemini-test']);
      vision.geminiRequest.mockResolvedValue({});
      vision.extractGeminiText.mockReturnValue('Galaxy A15 4/128 | 38500\nGalaxy A25 8/256 | 62500\nInfinix Hot 40i | 27500');
      const out = await extractText(Buffer.from('x'), 'image/jpeg');
      expect(out.method).toBe('ai');
      expect(vision.geminiRequest.mock.calls[0][3].contents[0].parts[1].inline_data.mime_type).toBe('image/jpeg');
    });

    test('an AI answer with no readable content is reported, not passed on', async () => {
      config.gemini.apiKey = 'test-key';
      vision.resolveModelsToTry.mockResolvedValue(['gemini-test']);
      vision.geminiRequest.mockResolvedValue({});
      vision.extractGeminiText.mockReturnValue('Sorry, I cannot read this.');
      await expect(extractText(Buffer.from('x'), 'image/png')).rejects.toMatchObject({ statusCode: 422 });
    });

    test('a text layer with words but no prices (a scanner watermark) is still treated as a scan', async () => {
      config.gemini.apiKey = '';
      await expect(
        extractText(Buffer.from('%PDF'), 'application/pdf', { extractPdfText: async () => ({ text: 'Scanned with CamScanner\nScanned with CamScanner', pages: 2 }) }),
      ).rejects.toMatchObject({ statusCode: 422, message: expect.stringMatching(/scan/i) });
    });

    test('a very short list is still a list', async () => {
      const out = await extractText(Buffer.from('%PDF'), 'application/pdf', { extractPdfText: async () => ({ text: 'Galaxy A15 - 38500\nHot 40i - 27500', pages: 1 }) });
      expect(out.method).toBe('pdf-text');
    });

    test('a text-layer PDF never calls AI', async () => {
      config.gemini.apiKey = 'test-key';
      const text = 'Galaxy A15 4/128 - 38500\nGalaxy A25 8/256 - 62500\nInfinix Hot 40i - 27500';
      const out = await extractText(Buffer.from('%PDF'), 'application/pdf', { extractPdfText: async () => ({ text, pages: 1 }) });
      expect(out.method).toBe('pdf-text');
      expect(vision.geminiRequest).not.toHaveBeenCalled();
    });

    test('an empty file and an unsupported type are rejected clearly', async () => {
      await expect(extractText(Buffer.alloc(0), 'application/pdf')).rejects.toMatchObject({ statusCode: 400 });
      await expect(extractText(Buffer.from('a,b'), 'text/csv')).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
