/**
 * How a product came to exist in a branch — shown as a badge on the Products list and in
 * Add Product's "similar products" panel, so an item imported from Excel can be told apart
 * from one typed in from scratch. Stored on Product.source; null = created before the field
 * existed (unknown).
 */
const PRODUCT_SOURCES = [
  'manual', // Add Product dialog
  'excel_import', // Excel/CSV import
  'ai_scan', // AI photo/list scanner
  'branch_import', // "Import from other branches" (pull)
  'branch_sync', // "Sync across branches" (push from another branch)
  'stock_transfer', // auto-created at the receiving branch by a stock transfer
  'phone_buyback', // used-phone intake
  'demo', // trial demo data
];

module.exports = { PRODUCT_SOURCES };
