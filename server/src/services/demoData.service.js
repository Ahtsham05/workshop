const mongoose = require('mongoose');
const logger = require('../config/logger');
const {
  Category,
  Product,
  Customer,
  Supplier,
  Invoice,
  Purchase,
  Expense,
  PurchaseOrder,
  SalesReturn,
  PurchaseReturn,
  StockAdjustment,
  InventoryTransfer,
  WarrantyClaim,
  CustomerLedger,
  CustomerPayment,
  SupplierLedger,
  SupplierPayment,
  EmployeeLedger,
  SalesmanCommissionLedger,
  JournalEntry,
  AccountHead,
  CashBookEntry,
  WalletEntry,
  Imei,
} = require('../models');
const invoiceService = require('./invoice.service');
const purchaseService = require('./purchase.service');
const expenseService = require('./expense.service');
const walletService = require('./wallet.service');
const customerLedgerService = require('./customerLedger.service');
const supplierLedgerService = require('./supplierLedger.service');
const inventorySyncService = require('./inventorySync.service');

/**
 * Trial-account demo-data seeder.
 *
 * Populates a freshly-onboarded organization with a realistic generic-retail dataset
 * (categories, products, suppliers, customers, purchases, invoices, expenses) so a
 * trial user can explore Reports/Invoices/Purchases/etc. immediately instead of
 * starting from an empty account. Purchases/invoices/expenses are created through the
 * real service layer (not raw inserts) so stock, ledgers, and the cash book all stay
 * consistent, exactly as if a user had entered this data by hand.
 *
 * Every document this seeds directly is tagged `isDemo: true` so it can be told apart
 * from real data and safely cleared via resetDemoData without touching anything the
 * user has since added.
 */

const CATEGORY_SEEDS = [
  { name: 'Beverages' },
  { name: 'Snacks & Confectionery' },
  { name: 'Personal Care' },
  { name: 'Electronics & Accessories' },
  { name: 'Stationery & Office' },
];

// categoryIndex refers to CATEGORY_SEEDS above. lowStockThreshold is only set on the
// handful of items deliberately seeded under it, so the Low Stock UI has something to show.
const PRODUCT_SEEDS = [
  { categoryIndex: 0, name: 'Mineral Water 1.5L', cost: 35, price: 60, stockQuantity: 150 },
  { categoryIndex: 0, name: 'Cola 500ml', cost: 45, price: 80, stockQuantity: 200 },
  { categoryIndex: 0, name: 'Fresh Juice 1L', cost: 90, price: 150, stockQuantity: 80 },
  { categoryIndex: 0, name: 'Energy Drink 250ml', cost: 60, price: 120, stockQuantity: 20, lowStockThreshold: 25 },

  { categoryIndex: 1, name: 'Potato Chips 40g', cost: 20, price: 40, stockQuantity: 300 },
  { categoryIndex: 1, name: 'Chocolate Bar', cost: 35, price: 70, stockQuantity: 250 },
  { categoryIndex: 1, name: 'Biscuits Pack', cost: 25, price: 50, stockQuantity: 180 },
  { categoryIndex: 1, name: 'Assorted Candy Jar', cost: 15, price: 30, stockQuantity: 15, lowStockThreshold: 20 },

  { categoryIndex: 2, name: 'Shampoo 200ml', cost: 180, price: 320, stockQuantity: 60 },
  { categoryIndex: 2, name: 'Toothpaste 100g', cost: 90, price: 150, stockQuantity: 90 },
  { categoryIndex: 2, name: 'Bar Soap', cost: 40, price: 70, stockQuantity: 120 },
  { categoryIndex: 2, name: 'Hand Sanitizer 100ml', cost: 70, price: 130, stockQuantity: 45 },

  { categoryIndex: 3, name: 'USB Cable Type-C', cost: 150, price: 300, stockQuantity: 50 },
  { categoryIndex: 3, name: 'Wired Earphones', cost: 400, price: 800, stockQuantity: 30 },
  { categoryIndex: 3, name: 'Power Bank 10000mAh', cost: 1800, price: 2800, stockQuantity: 12, lowStockThreshold: 15 },
  { categoryIndex: 3, name: 'Mobile Screen Protector', cost: 60, price: 150, stockQuantity: 100 },

  { categoryIndex: 4, name: 'Ball Pen Pack (10pcs)', cost: 80, price: 150, stockQuantity: 70 },
  { categoryIndex: 4, name: 'Notebook A4', cost: 60, price: 120, stockQuantity: 90 },
  { categoryIndex: 4, name: 'Stapler', cost: 120, price: 220, stockQuantity: 40 },
  { categoryIndex: 4, name: 'Printer Paper Ream', cost: 500, price: 750, stockQuantity: 25 },
];

const SUPPLIER_SEEDS = [
  { name: 'Al-Noor Distributors', phone: '0300-1112233' },
  { name: 'Metro Wholesale Traders', phone: '0301-2223344' },
  { name: 'Crescent Supply Co.', phone: '0302-3334455' },
  { name: 'Prime Mart Suppliers', phone: '0333-4445566' },
  { name: 'City Electronics Hub', phone: '0345-5556677' },
];

const CUSTOMER_SEEDS = [
  { name: 'Ahmed Traders', customerType: 'wholesale', phone: '0300-1234567' },
  { name: 'Sara Khan', customerType: 'retail', phone: '0301-2345678' },
  { name: 'Bilal Enterprises', customerType: 'corporate', phone: '0302-3456789' },
  { name: 'Fatima Malik', customerType: 'vip', phone: '0333-4567890' },
  { name: 'Usman General Store', customerType: 'wholesale', phone: '0345-5678901' },
  { name: 'Ayesha Retail Point', customerType: 'retail', phone: '0304-6789012' },
  { name: 'Hamza & Sons', customerType: 'corporate', phone: '0306-7890123' },
  { name: 'Zainab Cosmetics', customerType: 'retail', phone: '0321-8901234' },
];

const EXPENSE_SEEDS = [
  { category: 'Rent', description: 'Monthly shop rent', amount: 35000, vendor: 'Property Owner' },
  { category: 'Utilities', description: 'Electricity bill', amount: 8500, vendor: 'Power Company' },
  { category: 'Utilities', description: 'Internet & phone bill', amount: 3200, vendor: 'Telecom Provider' },
  { category: 'Salaries', description: 'Staff salary', amount: 45000, vendor: 'Staff' },
  { category: 'Transport', description: 'Delivery & fuel costs', amount: 6000, vendor: 'Local Transport' },
  { category: 'Maintenance', description: 'Shop equipment repair', amount: 4500, vendor: 'Repair Services' },
  { category: 'Marketing', description: 'Local ads & promotions', amount: 5000, vendor: 'Print Shop' },
  { category: 'Office Supplies', description: 'Packaging & stationery', amount: 2800, vendor: 'Prime Mart Suppliers' },
  { category: 'Miscellaneous', description: 'Cleaning supplies', amount: 1500, vendor: 'General Store' },
  { category: 'Utilities', description: 'Water bill', amount: 1800, vendor: 'Water Board' },
];

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[randomInt(0, arr.length - 1)];

/** Backdated Date within the trailing `maxDaysAgo` days, weighted toward more recent days. */
const recentDate = (maxDaysAgo = 90) => {
  const daysAgo = Math.floor((Math.random() ** 1.5) * maxDaysAgo);
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(randomInt(9, 19), randomInt(0, 59), 0, 0);
  return date;
};

const seedCategories = async ({ organizationId, branchId, userId }) => {
  const docs = await Category.insertMany(
    CATEGORY_SEEDS.map((c) => ({
      organizationId,
      branchId,
      createdBy: userId,
      isDemo: true,
      name: c.name,
    }))
  );
  return docs;
};

const seedSuppliers = async ({ organizationId, branchId, userId }) => {
  const docs = await Supplier.insertMany(
    SUPPLIER_SEEDS.map((s) => ({
      organizationId,
      branchId,
      createdBy: userId,
      isDemo: true,
      name: s.name,
      phone: s.phone,
    }))
  );
  return docs;
};

const seedCustomers = async ({ organizationId, branchId, userId }) => {
  const docs = await Customer.insertMany(
    CUSTOMER_SEEDS.map((c) => ({
      organizationId,
      branchId,
      createdBy: userId,
      isDemo: true,
      name: c.name,
      phone: c.phone,
      customerType: c.customerType,
    }))
  );
  return docs;
};

const seedProducts = async ({ organizationId, branchId, userId }, categories) => {
  const docs = await Product.insertMany(
    PRODUCT_SEEDS.map((p) => {
      const category = categories[p.categoryIndex];
      return {
        organizationId,
        branchId,
        createdBy: userId,
        isDemo: true,
        source: 'demo',
        name: p.name,
        price: p.price,
        cost: p.cost,
        stockQuantity: p.stockQuantity,
        lowStockThreshold: p.lowStockThreshold ?? null,
        category: category?.name,
        categories: category ? [{ _id: category._id, name: category.name }] : [],
      };
    })
  );
  return docs;
};

/** Sequential (not parallel) — each createPurchase call generates its own invoice number
 *  and posts to the cash book, so overlapping them risks duplicate-number retries and
 *  noisy cash book races for what is a one-time, low-volume onboarding step. */
const seedPurchases = async ({ organizationId, branchId, userId }, suppliers, products) => {
  const created = [];
  for (let i = 0; i < 14; i += 1) {
    const supplier = pick(suppliers);
    const lineCount = randomInt(2, 4);
    const lineProducts = [...products].sort(() => Math.random() - 0.5).slice(0, lineCount);
    const items = lineProducts.map((product) => {
      const quantity = randomInt(10, 40);
      const priceAtPurchase = product.cost;
      return {
        product: product._id,
        quantity,
        priceAtPurchase,
        total: quantity * priceAtPurchase,
      };
    });
    const totalAmount = items.reduce((sum, item) => sum + item.total, 0);
    const isCredit = Math.random() < 0.3;
    const purchaseDate = recentDate(90);

    try {
      const invoiceNumber = await purchaseService.generateNextPurchaseInvoiceNumber(organizationId, branchId);
      // eslint-disable-next-line no-await-in-loop
      const purchase = await purchaseService.createPurchase({
        organizationId,
        branchId,
        createdBy: userId,
        isDemo: true,
        supplier: supplier._id,
        invoiceNumber,
        items,
        totalAmount,
        type: isCredit ? 'credit' : 'cash',
        paymentMethod: 'cash',
        paidAmount: isCredit ? Math.round(totalAmount * 0.4) : totalAmount,
        purchaseDate,
      });
      created.push(purchase);
    } catch (err) {
      logger.warn(`Demo data: skipped one seeded purchase — ${err.message}`);
    }
  }
  return created;
};

const seedInvoices = async ({ organizationId, branchId, userId }, customers, products) => {
  const created = [];
  for (let i = 0; i < 32; i += 1) {
    const useWalkIn = Math.random() < 0.25;
    const customer = useWalkIn ? null : pick(customers);
    const lineCount = randomInt(1, 4);
    const lineProducts = [...products].sort(() => Math.random() - 0.5).slice(0, lineCount);
    const items = lineProducts.map((product) => ({
      productId: product._id,
      quantity: randomInt(1, 5),
      unitPrice: product.price,
    }));
    const isCredit = !useWalkIn && Math.random() < 0.35;
    const invoiceDate = recentDate(90);
    // Estimate the total (mirrors calculateTotals with no discounts) so a credit
    // invoice's paidAmount can be a realistic partial figure rather than always 0.
    const estimatedTotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const creditPaidAmount = Math.random() < 0.5 ? 0 : Math.round(estimatedTotal * (0.3 + Math.random() * 0.4));

    try {
      // eslint-disable-next-line no-await-in-loop
      const invoice = await invoiceService.createInvoice(
        {
          organizationId,
          branchId,
          isDemo: true,
          items,
          customerId: useWalkIn ? 'walk-in' : customer._id,
          type: isCredit ? 'credit' : 'cash',
          paidAmount: isCredit ? creditPaidAmount : undefined,
          paymentMethod: 'cash',
          invoiceDate,
        },
        userId
      );
      created.push(invoice);
    } catch (err) {
      logger.warn(`Demo data: skipped one seeded invoice — ${err.message}`);
    }
  }
  return created;
};

const seedExpenses = async ({ organizationId, branchId, userId }) => {
  const created = [];
  for (const seed of EXPENSE_SEEDS) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const expense = await expenseService.createExpense({
        organizationId,
        branchId,
        createdBy: userId,
        isDemo: true,
        category: seed.category,
        description: seed.description,
        amount: seed.amount,
        vendor: seed.vendor,
        paymentMethod: 'Cash',
        date: recentDate(90),
        isPaid: true,
      });
      created.push(expense);
    } catch (err) {
      logger.warn(`Demo data: skipped one seeded expense — ${err.message}`);
    }
  }
  return created;
};

/**
 * Seed a full generic-retail demo dataset for a newly-onboarded organization.
 * Best-effort: logs and continues past any single failed line so a seeding hiccup never
 * blocks (or leaves half-broken) account creation.
 * @param {{organizationId: ObjectId, branchId: ObjectId, userId: ObjectId}} ctx
 */
const seedDemoData = async (ctx) => {
  const { organizationId, branchId, userId } = ctx;

  try {
    await walletService.ensureDefaultCashWallet({ organizationId, branchId, userId });
  } catch (err) {
    logger.warn(`Demo data: failed to ensure default cash wallet — ${err.message}`);
  }

  const categories = await seedCategories(ctx);
  const suppliers = await seedSuppliers(ctx);
  const customers = await seedCustomers(ctx);
  const products = await seedProducts(ctx, categories);
  const purchases = await seedPurchases(ctx, suppliers, products);
  const invoices = await seedInvoices(ctx, customers, products);
  const expenses = await seedExpenses(ctx);

  return {
    categories: categories.length,
    suppliers: suppliers.length,
    customers: customers.length,
    products: products.length,
    purchases: purchases.length,
    invoices: invoices.length,
    expenses: expenses.length,
  };
};

// One demo-data job (remove or reset) per organization at a time. Before this guard, two
// overlapping resets each cleared and reseeded, which left an account with two or three
// copies of the sample invoices/expenses that a later reset could never fully catch up on.
// The server runs as a single process (ecosystem.config.json instances: 1), so an
// in-memory map is enough; a restart mid-job just leaves the remainder for the next click.
const runningJobs = new Map();

const getDemoDataJob = (organizationId) => runningJobs.get(String(organizationId)) || null;

/**
 * Run a seed/remove/reset job for an org unless one is already running.
 * @returns {Promise|null} the job's promise (resolves to its result, never rejects —
 *   failures are logged and resolve to `{ error }`), or null when a job was already running
 */
const startDemoDataJob = (organizationId, kind, run) => {
  const key = String(organizationId);
  if (runningJobs.has(key)) return null;
  const job = { kind, startedAt: new Date(), step: 'Starting' };
  runningJobs.set(key, job);
  return Promise.resolve()
    .then(() => run(job))
    .catch((err) => {
      logger.error(`Demo data ${kind} failed for organization ${key}: ${err.message}`);
      return { error: err.message };
    })
    .finally(() => runningJobs.delete(key));
};

/**
 * How many isDemo-tagged records are still in the organization.
 * @param {ObjectId} organizationId
 */
const getDemoDataCounts = async (organizationId) => {
  const filter = { organizationId, isDemo: true };
  const [products, customers, suppliers, categories, invoices, purchases, expenses] = await Promise.all([
    Product.countDocuments(filter),
    Customer.countDocuments(filter),
    Supplier.countDocuments(filter),
    Category.countDocuments(filter),
    Invoice.countDocuments(filter),
    Purchase.countDocuments(filter),
    Expense.countDocuments(filter),
  ]);
  return { products, customers, suppliers, categories, invoices, purchases, expenses };
};

// Matches customer/supplier ledger payment rows that moved a wallet (see parseWalletType
// in customerLedger.service.js) — those reverse a wallet balance on delete.
const WALLET_PAYMENT_METHOD = /wallet|jazzcash|easypaisa/i;

const hasWalletLeg = (doc) =>
  String(doc.paymentMethod || '').toLowerCase() === 'wallet' ||
  Boolean(doc.walletType) ||
  String(doc.splitPaymentMethod || '').toLowerCase() === 'wallet' ||
  Boolean(doc.splitWalletType);

const hasTrackedLine = (item) =>
  Boolean(item.variantId) ||
  Boolean(item.batchId) ||
  (item.batchAllocations || []).length > 0 ||
  (item.imeis || []).length > 0;

/**
 * Split demo invoices/purchases/expenses into the ones the bulk remover can undo exactly
 * and the ones with side effects it doesn't model (wallet balances, variants/batches/IMEIs,
 * salesman commission, employee/supplier offsets, payment allocations). The seeder only
 * creates plain cash/credit documents, so in practice everything is "simple"; anything a
 * user has since edited into something richer still goes through the real delete services.
 */
const classifyDemoDocuments = async (organizationId, invoices, purchases, expenses) => {
  const invoiceIds = invoices.map((d) => d._id);
  const purchaseIds = purchases.map((d) => d._id);
  const byOrg = { organizationId };

  const [customerEntries, supplierEntries, employeeRefs, offsetRefs, commissionRefs] = await Promise.all([
    CustomerLedger.find({ ...byOrg, referenceId: { $in: invoiceIds } })
      .select('_id customer referenceId transactionType paymentMethod')
      .lean(),
    SupplierLedger.find({ ...byOrg, referenceId: { $in: [...purchaseIds, ...invoiceIds] } })
      .select('_id supplier referenceId transactionType paymentMethod')
      .lean(),
    EmployeeLedger.distinct('referenceId', { ...byOrg, referenceId: { $in: invoiceIds } }),
    SupplierLedger.distinct('referenceId', { ...byOrg, referenceId: { $in: invoiceIds } }),
    SalesmanCommissionLedger.distinct('referenceId', { ...byOrg, referenceId: { $in: invoiceIds } }),
  ]);
  const ledgerIds = [...customerEntries, ...supplierEntries].map((e) => e._id);
  const [customerPayments, supplierPayments] = await Promise.all([
    CustomerPayment.find({
      ...byOrg,
      $or: [{ 'allocations.invoice': { $in: invoiceIds } }, { customerLedgerEntryId: { $in: ledgerIds } }],
    })
      .select('allocations.invoice customerLedgerEntryId')
      .lean(),
    SupplierPayment.find({
      ...byOrg,
      $or: [{ 'allocations.purchase': { $in: purchaseIds } }, { supplierLedgerEntryId: { $in: ledgerIds } }],
    })
      .select('allocations.purchase supplierLedgerEntryId')
      .lean(),
  ]);

  const complex = new Set([...employeeRefs, ...offsetRefs, ...commissionRefs].map(String));
  const entryOwner = new Map([...customerEntries, ...supplierEntries].map((e) => [String(e._id), String(e.referenceId)]));
  for (const p of customerPayments) {
    (p.allocations || []).forEach((a) => complex.add(String(a.invoice)));
    if (p.customerLedgerEntryId) complex.add(entryOwner.get(String(p.customerLedgerEntryId)));
  }
  for (const p of supplierPayments) {
    (p.allocations || []).forEach((a) => complex.add(String(a.purchase)));
    if (p.supplierLedgerEntryId) complex.add(entryOwner.get(String(p.supplierLedgerEntryId)));
  }
  for (const e of [...customerEntries, ...supplierEntries]) {
    if (WALLET_PAYMENT_METHOD.test(e.paymentMethod || '')) complex.add(String(e.referenceId));
  }
  invoices.forEach((d) => {
    if (hasWalletLeg(d) || d.salesmanId || (d.items || []).some(hasTrackedLine)) complex.add(String(d._id));
  });
  purchases.forEach((d) => {
    if (hasWalletLeg(d) || (d.items || []).some(hasTrackedLine)) complex.add(String(d._id));
  });
  expenses.forEach((d) => {
    if (String(d.paymentMethod) === 'Wallet' && d.walletType) complex.add(String(d._id));
  });

  const isSimple = (d) => !complex.has(String(d._id));
  const simpleIds = new Set([...invoices, ...purchases, ...expenses].filter(isSimple).map((d) => String(d._id)));
  return {
    simple: { invoices: invoices.filter(isSimple), purchases: purchases.filter(isSimple), expenses: expenses.filter(isSimple) },
    complex: {
      invoices: invoices.filter((d) => !isSimple(d)),
      purchases: purchases.filter((d) => !isSimple(d)),
      expenses: expenses.filter((d) => !isSimple(d)),
    },
    // Ledger rows owned by simple documents — removed in bulk with them.
    customerEntries: customerEntries.filter((e) => simpleIds.has(String(e.referenceId))),
    supplierEntries: supplierEntries.filter((e) => simpleIds.has(String(e.referenceId))),
  };
};

/**
 * Undo simple demo documents in bulk, inside one transaction: the same end state the
 * per-document delete services reach (stock back, cash book / wallet / ledger rows gone,
 * account balances restored), in a fixed handful of round trips instead of ~50 per
 * document. Journal entries are deleted outright and their exact effect on
 * AccountHead.currentBalance is backed out, rather than posting reversal entries — demo
 * postings should leave no trace in the books. All-or-nothing, so a server restart midway
 * leaves nothing half-removed and the next click simply starts over.
 */
const bulkRemoveDemoDocuments = async (organizationId, { invoices, purchases, expenses }, customerEntries, supplierEntries) => {
  const docIds = [...invoices, ...purchases, ...expenses].map((d) => d._id);
  if (docIds.length === 0) return;
  const ledgerIds = [...customerEntries, ...supplierEntries].map((e) => e._id);
  const refIds = [...docIds, ...ledgerIds];
  const byOrg = { organizationId };

  // Net stock movement to undo, per product (same quantities the delete services use).
  const stockDelta = new Map();
  const addDelta = (productId, qty) => {
    if (!productId || !qty) return;
    const key = String(productId);
    stockDelta.set(key, (stockDelta.get(key) || 0) + qty);
  };
  invoices
    .filter((inv) => inv.type !== 'quotation')
    .forEach((inv) => inv.items.forEach((i) => addDelta(i.productId, Number(i.stockQuantity || i.quantity || 0))));
  purchases.forEach((pur) => pur.items.forEach((i) => addDelta(i.product, -Number(i.stockQuantity || i.quantity || 0))));

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const journals = await JournalEntry.find({ ...byOrg, referenceId: { $in: refIds } })
        .select('_id lines.accountId lines.debit lines.credit')
        .session(session)
        .lean();
      const accountIds = [...new Set(journals.flatMap((j) => j.lines.map((l) => String(l.accountId))))];
      const accounts = await AccountHead.find({ _id: { $in: accountIds } })
        .select('_id balanceType')
        .session(session)
        .lean();
      const balanceType = new Map(accounts.map((a) => [String(a._id), a.balanceType]));
      // Every entry (originals and any reversals) moved currentBalance when it was posted
      // (accountsSystem.createJournalEntry); subtract that net effect.
      const accountDelta = new Map();
      for (const line of journals.flatMap((j) => j.lines)) {
        const key = String(line.accountId);
        if (!balanceType.has(key)) continue;
        const debitMinusCredit = (line.debit || 0) - (line.credit || 0);
        const delta = balanceType.get(key) === 'DEBIT' ? debitMinusCredit : -debitMinusCredit;
        accountDelta.set(key, (accountDelta.get(key) || 0) + delta);
      }

      const accountOps = [...accountDelta]
        .filter(([, delta]) => delta !== 0)
        .map(([id, delta]) => ({ updateOne: { filter: { _id: id }, update: { $inc: { currentBalance: -delta } } } }));
      const stockOps = [...stockDelta]
        .filter(([, qty]) => qty !== 0)
        .map(([id, qty]) => ({ updateOne: { filter: { _id: id }, update: { $inc: { stockQuantity: qty } } } }));
      // Sequential on purpose: operations sharing a transaction's session must not run in
      // parallel. Purchases with IMEI lines are never "simple", so no IMEI cleanup here.
      const writes = [
        () => JournalEntry.deleteMany({ _id: { $in: journals.map((j) => j._id) } }, { session }),
        () => accountOps.length && AccountHead.bulkWrite(accountOps, { session }),
        () => CashBookEntry.deleteMany({ ...byOrg, referenceId: { $in: refIds } }, { session }),
        () => WalletEntry.deleteMany({ ...byOrg, referenceId: { $in: refIds } }, { session }),
        () => CustomerLedger.deleteMany({ _id: { $in: customerEntries.map((e) => e._id) } }, { session }),
        () => SupplierLedger.deleteMany({ _id: { $in: supplierEntries.map((e) => e._id) } }, { session }),
        () => stockOps.length && Product.bulkWrite(stockOps, { session }),
        () => Invoice.deleteMany({ _id: { $in: invoices.map((d) => d._id) } }, { session }),
        () => Purchase.deleteMany({ _id: { $in: purchases.map((d) => d._id) } }, { session }),
        () => Expense.deleteMany({ _id: { $in: expenses.map((d) => d._id) } }, { session }),
      ];
      for (const write of writes) {
        // eslint-disable-next-line no-await-in-loop
        await write();
      }

      // Inventory mirror (only for orgs on the dual-write rollout).
      for (const [productId, qty] of stockDelta) {
        // eslint-disable-next-line no-await-in-loop
        await inventorySyncService.recordStockChange({
          organizationId,
          productId,
          quantityDelta: qty,
          type: 'adjustment',
          refType: 'DemoDataRemoval',
          session,
        });
      }
    });
  } finally {
    await session.endSession();
  }
};

/**
 * Clear every isDemo-tagged record for an organization, without reseeding.
 * Plain demo invoices/purchases/expenses are undone in bulk (bulkRemoveDemoDocuments);
 * any with richer side effects go through their real delete services. Demo products/
 * customers/suppliers/categories that a real (non-demo) record still points at are kept,
 * so removing the samples can never break the user's own invoices, purchases or products.
 * @param {{organizationId: ObjectId}} ctx
 * @param {object} [job] - running job record; `step` is updated for the status endpoint
 */
const clearDemoData = async ({ organizationId }, job = {}) => {
  const failed = [];

  // Manufacturing demo products are isDemo too — clear them (and the BOMs/orders that use
  // them) first, so the Product.deleteMany below never orphans manufacturing documents.
  job.step = 'Removing manufacturing samples';
  try {
    // eslint-disable-next-line global-require
    await require('./manufacturing/demoData.service').clearDemoData({ organizationId });
  } catch (err) {
    logger.warn(`Demo data clear: failed to clear manufacturing demo data — ${err.message}`);
  }

  job.step = 'Removing sample invoices, purchases and expenses';
  const [demoInvoices, demoPurchases, demoExpenses] = await Promise.all([
    Invoice.find({ organizationId, isDemo: true }).lean(),
    Purchase.find({ organizationId, isDemo: true }).lean(),
    Expense.find({ organizationId, isDemo: true }).lean(),
  ]);
  const { simple, complex, customerEntries, supplierEntries } = await classifyDemoDocuments(
    organizationId,
    demoInvoices,
    demoPurchases,
    demoExpenses
  );

  await bulkRemoveDemoDocuments(organizationId, simple, customerEntries, supplierEntries);

  const slowSteps = [
    ['invoice', complex.invoices, (id) => invoiceService.deleteInvoiceById(id)],
    ['purchase', complex.purchases, (id) => purchaseService.deletePurchaseById(id)],
    ['expense', complex.expenses, (id) => expenseService.deleteExpenseById(id)],
  ];
  for (const [label, docs, remove] of slowSteps) {
    for (let i = 0; i < docs.length; i += 1) {
      job.step = `Removing edited sample ${label}s (${i + 1} of ${docs.length})`;
      try {
        // eslint-disable-next-line no-await-in-loop
        await remove(docs[i]._id);
      } catch (err) {
        failed.push(`${label} ${docs[i]._id}`);
        logger.warn(`Demo data clear: failed to delete ${label} ${docs[i]._id} — ${err.message}`);
      }
    }
  }

  // Master records: keep any demo record a real record still references. Demo invoices/
  // purchases are gone by now, so whatever still points at a demo product, customer or
  // supplier is the user's own data.
  job.step = 'Removing sample products, customers, suppliers and categories';
  const real = { organizationId, isDemo: { $ne: true } };
  const demoProductIds = await Product.distinct('_id', { organizationId, isDemo: true });
  const inUse = { $in: demoProductIds };
  // [model, product path] — scoped to the org so the lookups stay on its indexes.
  const productRefs = [
    [Invoice, 'items.productId'],
    [Purchase, 'items.product'],
    [PurchaseOrder, 'items.product'],
    [SalesReturn, 'items.productId'],
    [PurchaseReturn, 'items.productId'],
    [StockAdjustment, 'productId'],
    [InventoryTransfer, 'fromProductId'],
    [InventoryTransfer, 'toProductId'],
    [WarrantyClaim, 'productId'],
  ];
  // Ledger entries left after the demo documents were reversed are the user's own
  // (payments, opening balances, adjustments), so they also keep a customer/supplier.
  const byOrg = { organizationId };
  const [productUses, customerUses, supplierUses, realProducts] = await Promise.all([
    Promise.all(productRefs.map(([Model, path]) => Model.distinct(path, { organizationId, [path]: inUse }))),
    Promise.all([
      Invoice.distinct('customerId', real),
      CustomerLedger.distinct('customer', byOrg),
      CustomerPayment.distinct('customer', byOrg),
    ]),
    Promise.all([
      Purchase.distinct('supplier', real),
      PurchaseOrder.distinct('supplier', byOrg),
      Product.distinct('supplier', real),
      SupplierLedger.distinct('supplier', byOrg),
      SupplierPayment.distinct('supplier', byOrg),
    ]),
    Product.find(real).select('categories._id categories.name category').lean(),
  ]);
  const keepCategoryIds = new Set();
  const keepCategoryNames = new Set();
  for (const p of realProducts) {
    if (p.category) keepCategoryNames.add(p.category);
    for (const c of p.categories || []) {
      if (c._id) keepCategoryIds.add(String(c._id));
      else if (c.name) keepCategoryNames.add(c.name);
    }
  }
  const demoCategories = await Category.find({ organizationId, isDemo: true }).select('_id name').lean();
  const removableCategoryIds = demoCategories
    .filter((c) => !keepCategoryIds.has(String(c._id)) && !keepCategoryNames.has(c.name))
    .map((c) => c._id);

  // invoice.customerId is Mixed ('walk-in' or an id), so drop anything that isn't an id.
  const ids = (values) => values.filter((v) => v && mongoose.isValidObjectId(v)).map(String);
  const keepProductIds = new Set(ids(productUses.flat()));
  const removableProductIds = demoProductIds.filter((id) => !keepProductIds.has(String(id)));
  const [products, , customers, suppliers, categories] = await Promise.all([
    Product.deleteMany({ _id: { $in: removableProductIds } }),
    // Same cleanup as productService's delete: unsold IMEIs go with the product.
    Imei.deleteMany({ organizationId, productId: { $in: removableProductIds }, status: 'in_stock' }),
    Customer.deleteMany({ organizationId, isDemo: true, _id: { $nin: ids(customerUses.flat()) } }),
    Supplier.deleteMany({ organizationId, isDemo: true, _id: { $nin: ids(supplierUses.flat()) } }),
    Category.deleteMany({ organizationId, isDemo: true, _id: { $in: removableCategoryIds } }),
  ]);

  // Running balances of any customer/supplier that survived (one a real record uses) —
  // once per party instead of once per deleted ledger row.
  job.step = 'Updating balances';
  const [survivingCustomers, survivingSuppliers] = await Promise.all([
    Customer.distinct('_id', { _id: { $in: customerEntries.map((e) => e.customer) } }),
    Supplier.distinct('_id', { _id: { $in: supplierEntries.map((e) => e.supplier) } }),
  ]);
  await Promise.all([
    ...survivingCustomers.map((id) => customerLedgerService.recalculateBalances(id)),
    ...survivingSuppliers.map((id) => supplierLedgerService.recalculateBalances(id)),
  ]);

  return {
    invoices: demoInvoices.length,
    purchases: demoPurchases.length,
    expenses: demoExpenses.length,
    products: products.deletedCount,
    customers: customers.deletedCount,
    suppliers: suppliers.deletedCount,
    categories: categories.deletedCount,
    failed,
  };
};

/**
 * Clear every isDemo-tagged record for an organization and reseed a fresh batch.
 * @param {{organizationId: ObjectId, branchId: ObjectId, userId: ObjectId}} ctx
 * @param {object} [job]
 */
const resetDemoData = async (ctx, job = {}) => {
  await clearDemoData(ctx, job);
  job.step = 'Loading fresh sample data';
  return seedDemoData(ctx);
};

module.exports = {
  seedDemoData,
  clearDemoData,
  resetDemoData,
  getDemoDataCounts,
  getDemoDataJob,
  startDemoDataJob,
};
