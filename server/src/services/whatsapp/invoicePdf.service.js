const fs = require('fs');
const puppeteer = require('puppeteer-core');

// puppeteer-core ships no bundled Chromium — resolve an installed browser binary.
// Set PUPPETEER_EXECUTABLE_PATH on deploy targets (e.g. Render) that don't ship Chrome.
const CANDIDATE_PATHS = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
];

function resolveExecutablePath() {
  const found = CANDIDATE_PATHS.find((p) => p && fs.existsSync(p));
  if (!found) {
    throw new Error(
      'No Chrome/Chromium binary found for PDF generation. Set PUPPETEER_EXECUTABLE_PATH to an installed browser.',
    );
  }
  return found;
}

let sharedBrowser = null;

async function getBrowser() {
  if (!sharedBrowser || !sharedBrowser.isConnected()) {
    sharedBrowser = await puppeteer.launch({
      headless: true,
      executablePath: resolveExecutablePath(),
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return sharedBrowser;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildInvoiceHtml(invoice, customer, organization) {
  const itemRows = (invoice.items || [])
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.name || item.productName || '')}</td>
        <td style="text-align:center">${escapeHtml(item.quantity)}</td>
        <td style="text-align:right">${formatMoney(item.unitPrice)}</td>
        <td style="text-align:right">${formatMoney(item.subtotal ?? item.quantity * item.unitPrice)}</td>
      </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1f2937; padding: 24px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .muted { color: #6b7280; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; }
  th { text-align: left; background: #f9fafb; }
  .totals { margin-top: 16px; width: 280px; margin-left: auto; }
  .totals td { border-bottom: none; padding: 2px 8px; }
  .totals .grand { font-weight: bold; border-top: 1px solid #1f2937; }
</style>
</head>
<body>
  <h1>${escapeHtml(organization?.name || 'Invoice')}</h1>
  <p class="muted">Invoice #${escapeHtml(invoice.invoiceNumber)} &middot; ${new Date(invoice.createdAt || Date.now()).toLocaleDateString()}</p>
  <p>Bill to: <strong>${escapeHtml(customer?.name || 'Walk-in Customer')}</strong></p>
  <table>
    <thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Total</th></tr></thead>
    <tbody>${itemRows}</tbody>
  </table>
  <table class="totals">
    <tr><td>Subtotal</td><td style="text-align:right">${formatMoney(invoice.subtotal)}</td></tr>
    <tr><td>Tax</td><td style="text-align:right">${formatMoney(invoice.tax)}</td></tr>
    <tr><td>Discount</td><td style="text-align:right">-${formatMoney(invoice.discount)}</td></tr>
    <tr class="grand"><td>Total</td><td style="text-align:right">${formatMoney(invoice.total)}</td></tr>
    <tr><td>Paid</td><td style="text-align:right">${formatMoney(invoice.paidAmount)}</td></tr>
    <tr><td>Balance</td><td style="text-align:right">${formatMoney(invoice.balance)}</td></tr>
  </table>
</body>
</html>`;
}

/**
 * Render an invoice to a PDF buffer via headless Chrome.
 * @returns {Promise<Buffer>}
 */
async function generateInvoicePdf(invoice, customer, organization) {
  const html = buildInvoiceHtml(invoice, customer, organization);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const buffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '16px', bottom: '16px' } });
    return buffer;
  } finally {
    await page.close();
  }
}

module.exports = { generateInvoicePdf };
