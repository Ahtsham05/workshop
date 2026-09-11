const logger = require('../config/logger');
const { Category, Product, Customer, Supplier, Invoice, Purchase, Expense } = require('../models');
const invoiceService = require('./invoice.service');
const purchaseService = require('./purchase.service');
const expenseService = require('./expense.service');
const walletService = require('./wallet.service');

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
      const invoiceNumber = await purchaseService.generateNextPurchaseInvoiceNumber();
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

/**
 * Clear every isDemo-tagged record for an organization and reseed a fresh batch.
 * Invoices/Purchases/Expenses go through their real delete-service functions so stock,
 * wallet balances, ledgers, and the cash book are all correctly reversed rather than
 * left dangling by a raw deleteMany.
 * @param {{organizationId: ObjectId, branchId: ObjectId, userId: ObjectId}} ctx
 */
const resetDemoData = async (ctx) => {
  const { organizationId } = ctx;

  const [demoInvoices, demoPurchases, demoExpenses] = await Promise.all([
    Invoice.find({ organizationId, isDemo: true }).select('_id'),
    Purchase.find({ organizationId, isDemo: true }).select('_id'),
    Expense.find({ organizationId, isDemo: true }).select('_id'),
  ]);

  for (const { _id } of demoInvoices) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await invoiceService.deleteInvoiceById(_id);
    } catch (err) {
      logger.warn(`Demo data reset: failed to delete invoice ${_id} — ${err.message}`);
    }
  }
  for (const { _id } of demoPurchases) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await purchaseService.deletePurchaseById(_id);
    } catch (err) {
      logger.warn(`Demo data reset: failed to delete purchase ${_id} — ${err.message}`);
    }
  }
  for (const { _id } of demoExpenses) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await expenseService.deleteExpenseById(_id);
    } catch (err) {
      logger.warn(`Demo data reset: failed to delete expense ${_id} — ${err.message}`);
    }
  }

  await Promise.all([
    Product.deleteMany({ organizationId, isDemo: true }),
    Customer.deleteMany({ organizationId, isDemo: true }),
    Supplier.deleteMany({ organizationId, isDemo: true }),
    Category.deleteMany({ organizationId, isDemo: true }),
  ]);

  return seedDemoData(ctx);
};

module.exports = {
  seedDemoData,
  resetDemoData,
};
