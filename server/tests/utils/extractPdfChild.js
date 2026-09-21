/* eslint-disable */
// Runs the REAL price-list extraction (pdf.js, an ES module) outside Jest, where dynamic
// import() works. Reads JSON `[{ base64, mime }]` on stdin, writes JSON results on stdout:
// `{ ok: true, ...extraction }` or `{ ok: false, statusCode, message }` per input.
// Tests must never reach a real AI service: blank the key BEFORE config loads (dotenv does not
// override a variable that is already set), so a developer's real key in .env is never used.
process.env.GEMINI_API_KEY = '';
process.env.NODE_ENV = 'test';
const { extractText } = require('../../src/services/priceListExtract.service');

const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', async () => {
  const inputs = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const results = [];
  for (const input of inputs) {
    try {
      const out = await extractText(Buffer.from(input.base64, 'base64'), input.mime || 'application/pdf');
      results.push({ ok: true, ...out });
    } catch (err) {
      results.push({ ok: false, statusCode: err.statusCode, message: err.message });
    }
  }
  process.stdout.write(JSON.stringify(results));
  process.exit(0);
});
