const { Customer, Product } = require('../../../models');
const { buildFilter } = require('./shared');

const MATCH_LIMIT = 5;

/**
 * Write tools never touch the database — they only resolve entities and compute a preview.
 * `aiAssistant.service.js#buildPendingAction` looks for `result.status === 'preview'` on a
 * tool named here and attaches it to the assistant message as a `pendingAction` that the
 * frontend renders as a Confirm/Cancel card. The actual `invoiceService.createInvoice` call
 * only happens later, from `aiAssistant.service.js#confirmAction`, after the user clicks
 * Confirm and the backend re-validates independently — see spec: "Gemini MUST NEVER directly
 * write to the database." Scoped to a single non-variant product line, paid in cash, for v1.
 */
async function prepareCreateInvoice(args, ctx) {
  const customerQuery = String(args.customerName || '').trim();
  const productQuery = String(args.productName || '').trim();
  const quantity = Number(args.quantity);

  if (!productQuery) {
    return { status: 'error', message: 'I need a product name to prepare an invoice.' };
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { status: 'error', message: 'Quantity must be a positive number.' };
  }

  // customerName is optional — no customer mentioned means a walk-in/cash sale, not something
  // to guess a name for. `invoiceService.createInvoice` already treats the literal string
  // 'walk-in' as its no-customer sentinel (same as the regular Invoices page's walk-in flow),
  // so this never searches for, matches, or creates any customer record in that case.
  const [customerResult, productResult] = await Promise.all([
    customerQuery
      ? Customer.paginate(buildFilter(ctx), { search: customerQuery, fieldName: 'name,phone', limit: MATCH_LIMIT })
      : Promise.resolve(null),
    Product.paginate(buildFilter(ctx), { search: productQuery, fieldName: 'name,barcode', limit: MATCH_LIMIT }),
  ]);

  if (customerResult && customerResult.totalResults === 0) {
    return { status: 'needs_clarification', reason: 'customer_not_found', query: customerQuery };
  }
  if (customerResult && customerResult.totalResults > 1) {
    return {
      status: 'needs_clarification',
      reason: 'multiple_customers',
      matches: customerResult.results.map((c) => ({ name: c.name, phone: c.phone })),
    };
  }
  if (productResult.totalResults === 0) {
    return { status: 'needs_clarification', reason: 'product_not_found', query: productQuery };
  }
  if (productResult.totalResults > 1) {
    return {
      status: 'needs_clarification',
      reason: 'multiple_products',
      matches: productResult.results.map((p) => ({ name: p.name, price: p.price })),
    };
  }

  const customer = customerResult ? customerResult.results[0] : null;
  const product = productResult.results[0];

  if (product.hasVariants) {
    return {
      status: 'error',
      message: `${product.name} has multiple variants (size/color/storage/etc). Please create this invoice from the Invoices page so the exact variant can be picked — I can only prepare invoices for simple, single-variant products right now.`,
    };
  }

  const unitPrice = Number(product.price || 0);
  const total = Math.round(unitPrice * quantity * 100) / 100;

  return {
    status: 'preview',
    preview: {
      customerId: customer ? customer.id : 'walk-in',
      customerName: customer ? customer.name : 'Walk-in Customer',
      customerBalance: customer ? customer.balance || 0 : 0,
      productId: product.id,
      productName: product.name,
      quantity,
      unitPrice,
      total,
      currency: 'Rs',
    },
  };
}

const declarations = [
  {
    name: 'create_invoice',
    description:
      'Prepare a new cash-sale invoice for ONE product, for the user to review and confirm — this does NOT save anything by itself, it only resolves the customer/product and computes the total. The app shows the user a Confirm/Cancel card after this call; only the user clicking Confirm actually creates the invoice, so just present what you found and let the UI handle confirmation (do not ask the user to type "yes"). Use when the user asks to create/make/bill/sell an invoice (e.g. "create an invoice for Ali Traders for 5 Samsung A15", "sale 10 qty of 5v"). Only call this once you have a product name and a quantity — ask for whichever is missing first. customerName is OPTIONAL: only pass it if the user actually named a specific customer. If they did not name one, omit customerName entirely (do not invent, guess, or reuse a name from earlier in the conversation) — it automatically becomes a walk-in/cash sale, which is the normal case for a plain "sale X qty of Y" request. Only supports one product line and immediate cash payment — if the user wants multiple products, a specific variant, or credit/on-account terms, tell them to use the Invoices page instead.',
    permission: 'createInvoices',
    write: true,
    parameters: {
      type: 'object',
      properties: {
        customerName: {
          type: 'string',
          description:
            'Customer name to bill, ONLY if the user actually named one. Omit this property entirely for a walk-in/cash sale — never guess or invent a name.',
        },
        productName: { type: 'string', description: 'Product name to sell, as the user said it' },
        quantity: { type: 'number', description: 'How many units to sell' },
      },
      required: ['productName', 'quantity'],
    },
    handler: prepareCreateInvoice,
  },
];

module.exports = { declarations };
