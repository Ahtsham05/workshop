const { Customer, Supplier, Product } = require('../../../models');
const productService = require('../../product.service');
const imeiService = require('../../imei.service');
const { buildFilter } = require('./shared');

const MATCH_LIMIT = 5;

/**
 * These are the assistant's only way to resolve "Ali's balance" / "how much stock of
 * iPhone 13" style questions into a concrete record. Each returns up to MATCH_LIMIT
 * candidates with enough detail (balance/stock/etc.) to answer directly when there's
 * one clear match — the system prompt tells the model to ask the user to disambiguate
 * when there's more than one.
 */

async function searchCustomer(args, ctx) {
  const query = String(args.name || '').trim();
  if (!query) return { matchCount: 0, matches: [] };
  const result = await Customer.paginate(buildFilter(ctx), { search: query, fieldName: 'name,phone', limit: MATCH_LIMIT });
  return {
    matchCount: result.totalResults,
    matches: result.results.map((c) => ({ name: c.name, phone: c.phone, balance: c.balance || 0 })),
  };
}

async function searchSupplier(args, ctx) {
  const query = String(args.name || '').trim();
  if (!query) return { matchCount: 0, matches: [] };
  const result = await Supplier.paginate(buildFilter(ctx), { search: query, fieldName: 'name,phone', limit: MATCH_LIMIT });
  return {
    matchCount: result.totalResults,
    matches: result.results.map((s) => ({ name: s.name, phone: s.phone, balance: s.balance || 0 })),
  };
}

async function searchProduct(args, ctx) {
  const query = String(args.name || '').trim();
  if (!query) return { matchCount: 0, matches: [] };
  const result = await Product.paginate(buildFilter(ctx), {
    search: query,
    fieldName: 'name,barcode',
    limit: MATCH_LIMIT,
    populate: [{ path: 'category', select: 'name' }],
  });
  const withAggregates = await productService.attachVariantAggregates(result.results);
  return {
    matchCount: result.totalResults,
    matches: withAggregates.map((p) => ({
      name: p.name,
      category: p.category && p.category.name ? p.category.name : 'Uncategorized',
      stockQuantity: p.hasVariants ? (p.variantStockTotal ?? 0) : p.stockQuantity,
      price: p.price,
    })),
  };
}

async function searchImei(args, ctx) {
  const number = String(args.number || '').trim();
  if (!number) return { found: false };
  const record = await imeiService.getImeiByNumber(number, ctx.organizationId, ctx.branchId);
  if (!record) return { found: false };
  return {
    found: true,
    imei: record.imei,
    status: record.status,
    productName: record.productName,
    customerName: record.customerName,
  };
}

const declarations = [
  {
    name: 'search_customer',
    description:
      'Look up a customer by name or phone (partial match ok) and get their current ledger balance. Use whenever the user asks about a SPECIFIC named customer (e.g. "what does Ali owe me", "check Sarah\'s balance") rather than a list. If more than one match comes back, list them and ask the user which one before answering.',
    permission: 'viewCustomers',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Customer name or phone number to search for' } },
      required: ['name'],
    },
    handler: searchCustomer,
  },
  {
    name: 'search_supplier',
    description:
      'Look up a supplier by name or phone (partial match ok) and get the current balance owed to them. Use for a SPECIFIC named supplier. If more than one match comes back, list them and ask the user which one before answering.',
    permission: 'viewSuppliers',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Supplier name or phone number to search for' } },
      required: ['name'],
    },
    handler: searchSupplier,
  },
  {
    name: 'search_product',
    description:
      'Look up a product by name or barcode (partial match ok) and get its current stock and price. Use for a SPECIFIC named product (e.g. "how many iPhone 13 do I have left") rather than a list. If more than one match comes back, list them and ask the user which one before answering.',
    permission: 'viewProducts',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Product name or barcode to search for' } },
      required: ['name'],
    },
    handler: searchProduct,
  },
  {
    name: 'search_imei',
    description:
      'Look up a single phone/device by its exact IMEI or serial number and get its status (in stock, sold, returned, etc.), product and — if sold — the customer.',
    permission: 'viewImeiTracking',
    parameters: {
      type: 'object',
      properties: { number: { type: 'string', description: 'Exact IMEI or serial number' } },
      required: ['number'],
    },
    handler: searchImei,
  },
];

module.exports = { declarations };
