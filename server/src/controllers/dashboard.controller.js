const httpStatus = require('http-status');
const mongoose = require('mongoose');
const catchAsync = require('../utils/catchAsync');
const { Invoice, Product, Customer, Purchase, Supplier, SalesReturn, PurchaseReturn, Organization, Expense, PersonalLedger, Inventory, StockAdjustment } = require('../models');
const { applyBranchFilter } = require('../utils/branchFilter');
const { mobileDashboardService, cashBookService } = require('../services');
const { normalizeBusinessType } = require('../config/businessTypes');
const { normalizeInvoicePayment, normalizePurchasePayment } = require('../utils/invoice-display');
const { resolveDashboardDateRange, buildDateMatch } = require('../utils/dashboardDateRange');
const { toBusinessCalendarDate } = require('../utils/businessTimezone');
const { truthyOr } = require('../utils/aggregateExpressions');

/**
 * Build an aggregate $match scope with properly cast ObjectIds.
 * applyBranchFilter works for Mongoose .find() (auto-casts) but NOT for
 * aggregate pipelines which hit the raw MongoDB driver.
 */
const buildAggregateScope = (req) => {
  const scope = {};
  const orgId = req.organizationId || (req.user && req.user.organizationId);
  const branchId = req.branchId;
  if (orgId && mongoose.Types.ObjectId.isValid(orgId)) {
    scope.organizationId = new mongoose.Types.ObjectId(String(orgId));
  }
  if (branchId && mongoose.Types.ObjectId.isValid(branchId)) {
    scope.branchId = new mongoose.Types.ObjectId(String(branchId));
  }
  return scope;
};

/** True if value can be used as Customer/Product _id (excludes walk-in and bad strings). */
const isValidRefObjectId = (id) => {
  if (id == null || id === '' || id === 'walk-in') return false;
  const s = String(id);
  if (!/^[a-fA-F0-9]{24}$/.test(s)) return false;
  try {
    return String(new mongoose.Types.ObjectId(s)) === s;
  } catch {
    return false;
  }
};

const LOW_STOCK_THRESHOLD = 10;
const LOW_STOCK_WIDGET_LIMIT = 20;

const firstRow = ([row]) => row || {};

const compareObjectIds = (a, b) => {
  const left = a.toString();
  const right = b.toString();
  if (left === right) return 0;
  return left < right ? -1 : 1;
};

/**
 * Real stock for every hasVariants product in scope. These products keep
 * Product.stockQuantity/cost at their legacy fallback (often 0) — the real numbers live on
 * Inventory, see docs/architecture/universal-product-migration.md.
 */
const getVariantStockByProduct = async (productFilter) => {
  const variantProductIds = await Product.distinct('_id', { ...productFilter, hasVariants: true });
  if (variantProductIds.length === 0) {
    return { variantProductIds, stockById: new Map() };
  }
  const rows = await Inventory.aggregate([
    { $match: { productId: { $in: variantProductIds } } },
    {
      $group: {
        _id: '$productId',
        totalStock: { $sum: '$quantity' },
        totalValue: { $sum: { $multiply: ['$quantity', '$averageCost'] } },
      },
    },
  ]);
  return { variantProductIds, stockById: new Map(rows.map((row) => [row._id.toString(), row])) };
};

/**
 * Low/out-of-stock counts and total stock value (current snapshot), summed in the database
 * rather than by loading the whole product catalog into memory on every dashboard refresh.
 */
const getInventorySnapshot = async (req) => {
  const [simpleProducts, { variantProductIds, stockById }] = await Promise.all([
    Product.aggregate([
      { $match: { ...buildAggregateScope(req), hasVariants: { $ne: true } } },
      {
        $project: {
          stock: truthyOr('$stockQuantity', 0),
          unitCost: truthyOr('$cost', truthyOr('$price', 0)),
        },
      },
      {
        $group: {
          _id: null,
          lowStockCount: {
            $sum: { $cond: [{ $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', LOW_STOCK_THRESHOLD] }] }, 1, 0] },
          },
          outOfStockCount: { $sum: { $cond: [{ $eq: ['$stock', 0] }, 1, 0] } },
          totalInventoryValue: { $sum: { $multiply: ['$stock', '$unitCost'] } },
        },
      },
    ]).then(firstRow),
    getVariantStockByProduct(applyBranchFilter({}, req)),
  ]);

  let lowStockCount = simpleProducts.lowStockCount || 0;
  let outOfStockCount = simpleProducts.outOfStockCount || 0;
  let totalInventoryValue = simpleProducts.totalInventoryValue || 0;
  variantProductIds.forEach((productId) => {
    const row = stockById.get(productId.toString());
    const stock = row ? row.totalStock : 0;
    if (stock > 0 && stock <= LOW_STOCK_THRESHOLD) lowStockCount += 1;
    if (stock === 0) outOfStockCount += 1;
    totalInventoryValue += row ? row.totalValue : 0;
  });

  return { lowStockCount, outOfStockCount, totalInventoryValue };
};

const resolveBusinessType = async (req, organizationId) => {
  let businessType = normalizeBusinessType(req.user.businessType);
  if (organizationId) {
    const org = await Organization.findById(organizationId).select('businessType');
    if (org?.businessType) {
      businessType = normalizeBusinessType(org.businessType);
    }
  }
  return businessType;
};

/**
 * Cash in Hand for every business type that keeps a Cash Book, plus the full mobile-shop
 * summary (load, repairs, bills, SIM sales, ...) for mobile shops. Returns null for business
 * types that have neither.
 */
const getBusinessTypeSummary = async ({ businessType, organizationId, branchId, startDate, endDate }) => {
  // "Cash in Hand" means cash physically available right now — bound it to the end of
  // today (business timezone) so a transaction mis-dated in the future (e.g. a sale
  // saved with a forward date) can't inflate this figure ahead of the Cash Book page,
  // which always scopes its own "Cash in Hand" to a selected date range ending today.
  const cashInHandAsOf = toBusinessCalendarDate(new Date());

  if (businessType === 'mobile_shop') {
    const [summary, cashBookSummary] = await Promise.all([
      mobileDashboardService.getMobileDashboardSummary({
        organizationId,
        branchId,
        startDate,
        endDate,
      }),
      cashBookService.getCashInHandSummary({ organizationId, branchId, endDate: cashInHandAsOf }),
    ]);
    return { ...summary, cashInHand: cashBookSummary.closingBalance };
  }

  if (!['school', 'restaurant'].includes(businessType)) {
    const cashBookSummary = await cashBookService.getCashInHandSummary({
      organizationId,
      branchId,
      endDate: cashInHandAsOf,
    });
    return { cashInHand: cashBookSummary.closingBalance };
  }

  return null;
};

/**
 * Get dashboard statistics
 * @route GET /v1/dashboard/stats
 */
const getDashboardStats = catchAsync(async (req, res) => {
  const bf = applyBranchFilter({}, req);
  const aggScope = buildAggregateScope(req);
  const dateRange = resolveDashboardDateRange(req.query);
  const { startDate, endDate, compareStart, compareEnd } = dateRange;
  const organizationId = req.organizationId || req.user.organizationId;

  const sumInvoices = (from, to) =>
    Invoice.aggregate([
      { $match: { ...aggScope, ...buildDateMatch('invoiceDate', from, to), status: { $ne: 'cancelled' } } },
      { $group: { _id: null, revenue: { $sum: '$total' }, count: { $sum: 1 }, profit: { $sum: '$totalProfit' } } },
    ]).then(firstRow);

  const sumReturns = (Model) =>
    Model.aggregate([
      { $match: { ...aggScope, status: { $ne: 'rejected' }, ...buildDateMatch('date', startDate, endDate) } },
      { $group: { _id: null, totalAmount: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
    ]).then(firstRow);

  const sumPositiveBalances = (Model) =>
    Model.aggregate([
      { $match: aggScope },
      {
        $group: {
          _id: null,
          total: { $sum: { $max: [0, { $ifNull: ['$balance', 0] }] } },
          count: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$balance', 0] }, 0] }, 1, 0] } },
        },
      },
    ]).then(firstRow);

  // Every query here is independent, so they all go out in one parallel round (this
  // endpoint used to await ~8 of them one after another). The business-type summary only
  // waits on its own organization lookup, not on the rest.
  const [
    currentInvoices,
    previousInvoices,
    inventory,
    pendingInvoiceTotals,
    totalCustomers,
    totalProducts,
    purchaseTotals,
    expenseTotals,
    salesReturnTotals,
    purchaseReturnTotals,
    receivables,
    payables,
    walletExpense,
    { businessType, businessTypeSummary },
  ] = await Promise.all([
    sumInvoices(startDate, endDate),
    sumInvoices(compareStart, compareEnd),
    getInventorySnapshot(req),
    // Pending invoices (current snapshot)
    Invoice.aggregate([
      { $match: { ...aggScope, status: 'pending', type: { $in: ['credit', 'pending'] } } },
      { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$balance' } } },
    ]).then(firstRow),
    Customer.countDocuments({ ...bf }),
    Product.countDocuments({ ...bf }),
    Purchase.aggregate([
      { $match: { ...aggScope, ...buildDateMatch('purchaseDate', startDate, endDate) } },
      { $group: { _id: null, totalPurchases: { $sum: '$totalAmount' } } },
    ]).then(firstRow),
    // Unfiltered by isPaid — this now covers every expense in the period, including
    // unpaid auto-generated recurring cycles, so "Total Expenses" reflects the full
    // obligation. totalPaidExpenses (the old, isPaid-only figure) is what Net Profit
    // After Expense and totalInvestment below actually deduct/count — an unpaid expense
    // hasn't left the bank yet, so it must not reduce profit or count as invested.
    Expense.aggregate([
      { $match: { ...aggScope, ...buildDateMatch('date', startDate, endDate) } },
      {
        $group: {
          _id: null,
          totalExpenses: { $sum: '$amount' },
          totalPaidExpenses: { $sum: { $cond: [{ $ne: ['$isPaid', false] }, '$amount', 0] } },
        },
      },
    ]).then(firstRow),
    sumReturns(SalesReturn),
    sumReturns(PurchaseReturn),
    sumPositiveBalances(Customer),
    sumPositiveBalances(Supplier),
    PersonalLedger.aggregate([
      {
        $match: {
          ...aggScope,
          ...buildDateMatch('transactionDate', startDate, endDate),
          transactionType: 'expense',
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $ifNull: ['$debit', 0] } },
          count: { $sum: 1 },
        },
      },
    ]).then(firstRow),
    resolveBusinessType(req, organizationId).then(async (resolvedType) => ({
      businessType: resolvedType,
      businessTypeSummary: await getBusinessTypeSummary({
        businessType: resolvedType,
        organizationId,
        branchId: req.branchId,
        startDate,
        endDate,
      }),
    })),
  ]);

  const totalRevenue = currentInvoices.revenue || 0;
  const totalSales = currentInvoices.count || 0;
  const salesProfit = currentInvoices.profit || 0;
  const previousRevenue = previousInvoices.revenue || 0;
  const previousSales = previousInvoices.count || 0;

  const totalRevenueChange =
    previousRevenue > 0 ? ((totalRevenue - previousRevenue) / previousRevenue) * 100 : 0;
  const totalSalesChange =
    previousSales > 0 ? ((totalSales - previousSales) / previousSales) * 100 : 0;

  const { lowStockCount, outOfStockCount, totalInventoryValue } = inventory;
  const pendingInvoices = pendingInvoiceTotals.count || 0;
  const pendingInvoicesAmount = pendingInvoiceTotals.amount || 0;

  // Period revenue (same as totalRevenue for filtered dashboard)
  const todayRevenue = totalRevenue;
  const todayRevenueChange = totalRevenueChange;

  const totalPurchases = purchaseTotals.totalPurchases || 0;
  const totalExpenses = expenseTotals.totalExpenses || 0;
  const totalPaidExpenses = expenseTotals.totalPaidExpenses || 0;
  const totalPendingExpenses = totalExpenses - totalPaidExpenses;

  let mobileSummary = {
    totalLoadSold: 0,
    totalRepairIncome: 0,
    totalBillCollection: 0,
    billPaymentProfit: 0,
    salesProfit,
    grossProfit: salesProfit,
    totalProfit: salesProfit,
    totalExpenses,
    totalPaidExpenses,
    totalPendingExpenses,
    roi: 0,
    totalInvestment: totalInventoryValue + totalPaidExpenses,
    cashInHand: 0,
    jazzcashBalance: 0,
    easypaisaBalance: 0,
    walletBalance: 0,
    billsDueToday: 0,
    billsDueInPeriod: 0,
    billsOverdue: 0,
    totalSimSale: 0,
    totalSimSaleProfit: 0,
    simSaleCount: 0,
    totalCashSend: 0,
    totalCashSendProfit: 0,
    cashSendCount: 0,
    totalCashReceived: 0,
    totalCashReceivedProfit: 0,
    cashReceivedCount: 0,
    totalServiceIncome: 0,
    serviceInvoiceCount: 0,
  };

  if (businessType === 'mobile_shop') {
    mobileSummary = businessTypeSummary;
  } else if (businessTypeSummary) {
    mobileSummary.cashInHand = businessTypeSummary.cashInHand;
  }

  const totalSalesReturns = salesReturnTotals.totalAmount || 0;
  const salesReturnCount = salesReturnTotals.count || 0;
  const totalPurchaseReturns = purchaseReturnTotals.totalAmount || 0;
  const purchaseReturnCount = purchaseReturnTotals.count || 0;

  // Mobile shop orgs earn revenue outside the product Invoice collection too (SIM sales,
  // service invoices, repair jobs) — fold those in so Net Sales reflects all revenue
  // streams, not just product sales.
  const mobileSalesAddOn =
    businessType === 'mobile_shop'
      ? (mobileSummary.totalSimSale || 0) +
        (mobileSummary.totalServiceIncome || 0) +
        (mobileSummary.totalRepairIncome || 0)
      : 0;
  const netSales = totalRevenue + mobileSalesAddOn - totalSalesReturns;
  const netPurchase = totalPurchases - totalPurchaseReturns;

  const round2 = (n) => parseFloat((n || 0).toFixed(2));
  const totalReceivable = round2(receivables.total || 0);
  const totalPayable = round2(payables.total || 0);
  const myWalletExpense = round2(walletExpense.total || 0);
  const myWalletExpenseCount = walletExpense.count || 0;
  const receivableCount = receivables.count || 0;
  const payableCount = payables.count || 0;

  if (businessType !== 'mobile_shop') {
    mobileSummary.totalProfit = mobileSummary.grossProfit ?? salesProfit;
    if (mobileSummary.totalInvestment > 0) {
      mobileSummary.roi = parseFloat(
        ((mobileSummary.totalProfit / mobileSummary.totalInvestment) * 100).toFixed(2),
      );
    }
  }

  res.status(httpStatus.OK).send({
    totalRevenue,
    totalRevenueChange,
    totalSales,
    totalSalesChange,
    lowStockCount,
    outOfStockCount,
    totalInventoryValue,
    pendingInvoices,
    pendingInvoicesAmount,
    todayRevenue,
    todayRevenueChange,
    totalCustomers,
    totalProducts,
    totalPurchases,
    totalSalesReturns,
    salesReturnCount,
    totalPurchaseReturns,
    purchaseReturnCount,
    netSales,
    netPurchase,
    totalReceivable,
    totalPayable,
    myWalletExpense,
    myWalletExpenseCount,
    receivableCount,
    payableCount,
    period: {
      preset: dateRange.period,
      startDate: dateRange.startCalendar,
      endDate: dateRange.endCalendar,
    },
    ...mobileSummary,
  });
});

/**
 * Get revenue data for charts
 * @route GET /v1/dashboard/revenue?period=week
 */
const getRevenueData = catchAsync(async (req, res) => {
  const aggScope = buildAggregateScope(req);
  const dateRange = resolveDashboardDateRange(req.query);
  const { startDate, endDate, startCalendar, endCalendar } = dateRange;
  const isSingleDay = startCalendar === endCalendar;

  const groupBy = isSingleDay
    ? { $dateToString: { format: '%H:00', date: '$invoiceDate', timezone: 'Asia/Karachi' } }
    : { $dateToString: { format: '%Y-%m-%d', date: '$invoiceDate', timezone: 'Asia/Karachi' } };

  const revenueData = await Invoice.aggregate([
    {
      $match: {
        ...aggScope,
        ...buildDateMatch('invoiceDate', startDate, endDate),
        status: { $ne: 'cancelled' },
      },
    },
    {
      $group: {
        _id: groupBy,
        revenue: { $sum: '$total' },
        sales: { $sum: 1 },
        profit: { $sum: { $ifNull: ['$totalProfit', 0] } },
      },
    },
    {
      $sort: { _id: 1 },
    },
  ]);

  const formattedData = revenueData.map((item) => {
    let formattedDate = item._id;

    if (isSingleDay) {
      formattedDate = item._id;
    } else {
      const date = new Date(`${item._id}T12:00:00`);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      formattedDate = `${date.getDate().toString().padStart(2, '0')} ${months[date.getMonth()]}`;
    }

    return {
      date: formattedDate,
      revenue: item.revenue || 0,
      sales: item.sales || 0,
      profit: item.profit || 0,
    };
  });

  res.status(httpStatus.OK).send(formattedData);
});

/**
 * Get top selling products
 * @route GET /v1/dashboard/top-products?limit=5
 */
const getTopProducts = catchAsync(async (req, res) => {
  const aggScope = buildAggregateScope(req);
  const { limit = 5 } = req.query;
  const { startDate, endDate } = resolveDashboardDateRange(req.query);

  const topProducts = await Invoice.aggregate([
    {
      $match: {
        ...aggScope,
        ...buildDateMatch('invoiceDate', startDate, endDate),
        status: { $ne: 'cancelled' },
      },
    },
    { $unwind: '$items' },
    {
      $match: {
        $expr: {
          $or: [
            { $eq: [{ $type: '$items.productId' }, 'objectId'] },
            {
              $and: [
                { $eq: [{ $type: '$items.productId' }, 'string'] },
                { $regexMatch: { input: '$items.productId', regex: /^[a-fA-F0-9]{24}$/ } },
              ],
            },
          ],
        },
      },
    },
    {
      $group: {
        _id: '$items.productId',
        totalQuantity: { $sum: '$items.quantity' },
        totalRevenue: { $sum: '$items.subtotal' }
      }
    },
    { $sort: { totalRevenue: -1 } },
    { $limit: parseInt(limit) },
    {
      $addFields: {
        productLookupId: {
          $convert: {
            input: '$_id',
            to: 'objectId',
            onError: null,
            onNull: null,
          },
        },
      },
    },
    { $match: { productLookupId: { $ne: null } } },
    {
      $lookup: {
        from: 'products',
        localField: 'productLookupId',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $unwind: '$product' },
    {
      $project: {
        id: '$_id',
        name: '$product.name',
        image: '$product.image',
        totalQuantity: 1,
        totalRevenue: 1,
        stockQuantity: '$product.stockQuantity',
        hasVariants: '$product.hasVariants',
        _id: 0
      }
    }
  ]);

  // hasVariants products keep Product.stockQuantity at its legacy fallback — resolve
  // the real number from Inventory instead (see
  // docs/architecture/universal-product-migration.md).
  const variantProductIds = topProducts.filter((p) => p.hasVariants).map((p) => p.id);
  if (variantProductIds.length > 0) {
    const stockTotals = await Inventory.aggregate([
      { $match: { productId: { $in: variantProductIds } } },
      { $group: { _id: '$productId', totalStock: { $sum: '$quantity' } } },
    ]);
    const stockById = new Map(stockTotals.map((s) => [s._id.toString(), s.totalStock]));
    topProducts.forEach((p) => {
      if (p.hasVariants) p.stockQuantity = stockById.get(p.id.toString()) ?? 0;
    });
  }

  res.status(httpStatus.OK).send(topProducts);
});

/**
 * Get top customers
 * @route GET /v1/dashboard/top-customers?limit=5
 */
const getTopCustomers = catchAsync(async (req, res) => {
  const aggScope = buildAggregateScope(req);
  const { limit = 5 } = req.query;
  const { startDate, endDate } = resolveDashboardDateRange(req.query);

  const topCustomers = await Invoice.aggregate([
    {
      $match: {
        ...aggScope,
        ...buildDateMatch('invoiceDate', startDate, endDate),
        status: { $ne: 'cancelled' },
        $expr: {
          $or: [
            { $eq: [{ $type: '$customerId' }, 'objectId'] },
            {
              $and: [
                { $eq: [{ $type: '$customerId' }, 'string'] },
                { $regexMatch: { input: '$customerId', regex: /^[a-fA-F0-9]{24}$/ } },
              ],
            },
          ],
        },
      },
    },
    {
      $group: {
        _id: '$customerId',
        totalPurchases: { $sum: 1 },
        totalAmount: { $sum: '$total' },
        lastPurchase: { $max: '$createdAt' }
      }
    },
    { $sort: { totalAmount: -1 } },
    { $limit: parseInt(limit) },
    {
      $addFields: {
        customerLookupId: {
          $convert: {
            input: '$_id',
            to: 'objectId',
            onError: null,
            onNull: null,
          },
        },
      },
    },
    { $match: { customerLookupId: { $ne: null } } },
    {
      $lookup: {
        from: 'customers',
        localField: 'customerLookupId',
        foreignField: '_id',
        as: 'customer'
      }
    },
    { $unwind: '$customer' },
    {
      $project: {
        id: '$_id',
        name: '$customer.name',
        phone: '$customer.phone',
        totalPurchases: 1,
        totalAmount: 1,
        lastPurchase: 1,
        _id: 0
      }
    }
  ]);

  res.status(httpStatus.OK).send(topCustomers);
});

/**
 * Get low stock products
 * @route GET /v1/dashboard/low-stock
 */
const getLowStockProducts = catchAsync(async (req, res) => {
  const bf = applyBranchFilter({}, req);
  const detailFields = 'name image stockQuantity category';

  // Simple products are filtered, sorted and limited by the database directly. hasVariants
  // products can't be: their Product.stockQuantity stays at a legacy fallback (often 0)
  // while the real stock lives on Inventory (see
  // docs/architecture/universal-product-migration.md) — resolve that first, then load
  // details only for the few that can still make the list.
  const [simpleProducts, variantProducts] = await Promise.all([
    Product.find({ ...bf, hasVariants: { $ne: true }, stockQuantity: { $lte: LOW_STOCK_THRESHOLD } })
      .sort({ stockQuantity: 1, _id: 1 })
      .limit(LOW_STOCK_WIDGET_LIMIT)
      .select(detailFields)
      .populate('category', 'name')
      .lean(),
    getVariantStockByProduct(bf).then(async ({ variantProductIds, stockById }) => {
      const candidates = variantProductIds
        .map((productId) => ({ productId, stock: stockById.get(productId.toString())?.totalStock ?? 0 }))
        .filter((candidate) => candidate.stock <= LOW_STOCK_THRESHOLD)
        .sort((a, b) => a.stock - b.stock || compareObjectIds(a.productId, b.productId))
        .slice(0, LOW_STOCK_WIDGET_LIMIT);
      if (candidates.length === 0) return [];

      const docs = await Product.find({ ...bf, _id: { $in: candidates.map((candidate) => candidate.productId) } })
        .select(detailFields)
        .populate('category', 'name')
        .lean();
      const docById = new Map(docs.map((doc) => [doc._id.toString(), doc]));
      return candidates
        .filter((candidate) => docById.has(candidate.productId.toString()))
        .map((candidate) => ({ ...docById.get(candidate.productId.toString()), stockQuantity: candidate.stock }));
    }),
  ]);

  const lowStockProducts = [...simpleProducts, ...variantProducts]
    .sort((a, b) => a.stockQuantity - b.stockQuantity || compareObjectIds(a._id, b._id))
    .slice(0, LOW_STOCK_WIDGET_LIMIT)
    .map((product) => ({
      id: product._id,
      name: product.name,
      image: product.image,
      stockQuantity: product.stockQuantity,
      minStockLevel: LOW_STOCK_THRESHOLD,
      category: product.category && product.category.name ? product.category.name : 'Uncategorized',
    }));

  res.status(httpStatus.OK).send(lowStockProducts);
});

const ADJUSTMENT_TYPE_LABELS = {
  damage: 'Damage',
  theft: 'Theft',
  expired: 'Expired',
  lost: 'Lost',
  found: 'Found',
  correction: 'Stock Correction',
  other: 'Adjustment',
};

/**
 * Get recent activities
 * @route GET /v1/dashboard/recent-activities?limit=10
 */
const getRecentActivities = catchAsync(async (req, res) => {
  const bf = applyBranchFilter({}, req);
  const { limit = 10 } = req.query;
  const { startDate, endDate } = resolveDashboardDateRange(req.query);
  const numLimit = parseInt(limit, 10);
  const share = Math.max(1, Math.ceil(numLimit / 3));

  const [{ recentInvoices, customerNameById }, recentPurchases, recentAdjustments] = await Promise.all([
    Invoice.find({
      ...bf,
      ...buildDateMatch('invoiceDate', startDate, endDate),
    })
      .sort({ createdAt: -1 })
      .limit(share)
      .select('invoiceNumber total createdAt status walkInCustomerName customerId type paidAmount balance')
      .lean()
      .then(async (invoices) => {
        const customerIdsToResolve = [
          ...new Set(
            invoices
              .map((inv) => inv.customerId)
              .filter((id) => isValidRefObjectId(id))
              .map((id) => String(id)),
          ),
        ];
        const customerDocs =
          customerIdsToResolve.length > 0
            ? await Customer.find({ _id: { $in: customerIdsToResolve } })
                .select('name')
                .lean()
            : [];
        return {
          recentInvoices: invoices,
          customerNameById: new Map(customerDocs.map((c) => [String(c._id), c.name])),
        };
      }),
    Purchase.find({
      ...bf,
      ...buildDateMatch('purchaseDate', startDate, endDate),
    })
      .sort({ createdAt: -1 })
      .limit(share)
      .select('invoiceNumber vendorBillNumber totalAmount paidAmount balance paymentType createdAt supplier')
      .populate('supplier', 'name')
      .lean(),
    StockAdjustment.find({
      ...bf,
      ...buildDateMatch('createdAt', startDate, endDate),
    })
      .sort({ createdAt: -1 })
      .limit(share)
      .select('type direction quantity totalValue productName status createdAt')
      .lean(),
  ]);

  // Combine and format activities
  const invoiceActivities = recentInvoices.map((inv) => {
    const cid = inv.customerId;
    const resolvedName =
      cid && isValidRefObjectId(cid) ? customerNameById.get(String(cid)) : null;
    const label =
      resolvedName || inv.walkInCustomerName || 'Walk-in Customer';
    const pay = normalizeInvoicePayment(inv);
    return {
      id: inv._id,
      type: 'invoice',
      description: `Invoice ${inv.invoiceNumber} - ${label}`,
      amount: inv.total,
      paidAmount: pay.paidAmount,
      balance: pay.balance,
      timestamp: inv.createdAt,
      status: pay.displayStatus,
    };
  });

  const purchaseActivities = recentPurchases.map((pur) => {
    const pay = normalizePurchasePayment(pur);
    return {
      id: pur._id,
      type: 'purchase',
      description: `Purchase ${pur.invoiceNumber}${pur.vendorBillNumber ? ` (Bill #${pur.vendorBillNumber})` : ''} - ${pur.supplier?.name || 'Supplier'}`,
      amount: pur.totalAmount,
      paidAmount: pay.paidAmount,
      balance: pay.balance,
      timestamp: pur.createdAt,
      status: pay.displayStatus,
    };
  });

  const adjustmentActivities = recentAdjustments.map((adj) => {
    const typeLabel = ADJUSTMENT_TYPE_LABELS[adj.type] || 'Adjustment';
    return {
      id: adj._id,
      type: 'stock_adjustment',
      description: `${typeLabel} — ${adj.productName}`,
      amount: adj.totalValue,
      adjustmentType: adj.type,
      direction: adj.direction,
      quantity: adj.quantity,
      timestamp: adj.createdAt,
      status: adj.status === 'reversed' ? 'Reversed' : typeLabel,
    };
  });

  // Combine and sort by timestamp
  const activities = [...invoiceActivities, ...purchaseActivities, ...adjustmentActivities]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, numLimit);

  res.status(httpStatus.OK).send(activities);
});

/**
 * Get product sales grouped by category
 * @route GET /v1/dashboard/products-by-category
 */
const getProductsByCategory = catchAsync(async (req, res) => {
  const aggScope = buildAggregateScope(req);
  const { startDate, endDate } = resolveDashboardDateRange(req.query);

  // Aggregate sales data by category
  const categoryData = await Invoice.aggregate([
    {
      $match: {
        ...aggScope,
        ...buildDateMatch('invoiceDate', startDate, endDate),
        status: { $ne: 'cancelled' },
      },
    },
    { $unwind: '$items' },
    {
      $match: {
        $expr: {
          $or: [
            { $eq: [{ $type: '$items.productId' }, 'objectId'] },
            {
              $and: [
                { $eq: [{ $type: '$items.productId' }, 'string'] },
                { $regexMatch: { input: '$items.productId', regex: /^[a-fA-F0-9]{24}$/ } },
              ],
            },
          ],
        },
      },
    },
    {
      $addFields: {
        productLookupId: {
          $convert: {
            input: '$items.productId',
            to: 'objectId',
            onError: null,
            onNull: null,
          },
        },
      },
    },
    { $match: { productLookupId: { $ne: null } } },
    {
      $lookup: {
        from: 'products',
        localField: 'productLookupId',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $unwind: '$product' },
    { $unwind: { path: '$product.categories', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: {
          categoryId: '$product.categories._id',
          categoryName: '$product.categories.name',
        },
        totalQuantity: { $sum: '$items.quantity' },
        totalRevenue: { $sum: '$items.subtotal' },
        totalCost: { $sum: { $multiply: ['$items.quantity', '$product.cost'] } },
        productCount: { $addToSet: '$items.productId' },
      }
    },
    {
      $addFields: {
        profit: { $subtract: ['$totalRevenue', '$totalCost'] },
        productCount: { $size: '$productCount' },
      }
    },
    { $sort: { totalRevenue: -1 } },
    {
      $project: {
        _id: 0,
        categoryId: '$_id.categoryId',
        categoryName: { $ifNull: ['$_id.categoryName', 'Uncategorized'] },
        totalQuantity: 1,
        totalRevenue: 1,
        totalCost: 1,
        profit: 1,
        productCount: 1,
        margin: {
          $cond: {
            if: { $gt: ['$totalRevenue', 0] },
            then: { $multiply: [{ $divide: ['$profit', '$totalRevenue'] }, 100] },
            else: 0
          }
        }
      }
    }
  ]);

  res.status(httpStatus.OK).send(categoryData);
});

/**
 * Get product sales grouped by brand
 * @route GET /v1/dashboard/products-by-brand
 */
const getProductsByBrand = catchAsync(async (req, res) => {
  const aggScope = buildAggregateScope(req);
  const { startDate, endDate } = resolveDashboardDateRange(req.query);

  const brandData = await Invoice.aggregate([
    {
      $match: {
        ...aggScope,
        ...buildDateMatch('invoiceDate', startDate, endDate),
        status: { $ne: 'cancelled' },
      },
    },
    { $unwind: '$items' },
    {
      $match: {
        $expr: {
          $or: [
            { $eq: [{ $type: '$items.productId' }, 'objectId'] },
            {
              $and: [
                { $eq: [{ $type: '$items.productId' }, 'string'] },
                { $regexMatch: { input: '$items.productId', regex: /^[a-fA-F0-9]{24}$/ } },
              ],
            },
          ],
        },
      },
    },
    {
      $addFields: {
        productLookupId: {
          $convert: {
            input: '$items.productId',
            to: 'objectId',
            onError: null,
            onNull: null,
          },
        },
      },
    },
    { $match: { productLookupId: { $ne: null } } },
    {
      $lookup: {
        from: 'products',
        localField: 'productLookupId',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $unwind: '$product' },
    {
      $lookup: {
        from: 'brands',
        localField: 'product.brandId',
        foreignField: '_id',
        as: 'brand'
      }
    },
    {
      $group: {
        _id: {
          brandId: '$product.brandId',
          brandName: { $arrayElemAt: ['$brand.name', 0] },
          brandLogo: { $arrayElemAt: ['$brand.logo', 0] },
        },
        totalQuantity: { $sum: '$items.quantity' },
        totalRevenue: { $sum: '$items.subtotal' },
        totalCost: { $sum: { $multiply: ['$items.quantity', '$product.cost'] } },
        productCount: { $addToSet: '$items.productId' },
        hasImeiProducts: { $max: '$product.trackImei' },
        hasSerialProducts: { $max: '$product.trackSerial' },
      }
    },
    {
      $addFields: {
        profit: { $subtract: ['$totalRevenue', '$totalCost'] },
        productCount: { $size: '$productCount' },
      }
    },
    { $sort: { totalRevenue: -1 } },
    {
      $project: {
        _id: 0,
        brandId: '$_id.brandId',
        brandName: { $ifNull: ['$_id.brandName', 'No Brand'] },
        brandLogo: '$_id.brandLogo',
        totalQuantity: 1,
        totalRevenue: 1,
        totalCost: 1,
        profit: 1,
        productCount: 1,
        hasImeiProducts: 1,
        hasSerialProducts: 1,
        margin: {
          $cond: {
            if: { $gt: ['$totalRevenue', 0] },
            then: { $multiply: [{ $divide: ['$profit', '$totalRevenue'] }, 100] },
            else: 0
          }
        }
      }
    }
  ]);

  res.status(httpStatus.OK).send(brandData);
});

/**
 * Get product sales grouped by sub-category
 * @route GET /v1/dashboard/products-by-subcategory
 */
const getProductsBySubCategory = catchAsync(async (req, res) => {
  const aggScope = buildAggregateScope(req);
  const { startDate, endDate } = resolveDashboardDateRange(req.query);

  const subCategoryData = await Invoice.aggregate([
    {
      $match: {
        ...aggScope,
        ...buildDateMatch('invoiceDate', startDate, endDate),
        status: { $ne: 'cancelled' },
      },
    },
    { $unwind: '$items' },
    {
      $match: {
        $expr: {
          $or: [
            { $eq: [{ $type: '$items.productId' }, 'objectId'] },
            {
              $and: [
                { $eq: [{ $type: '$items.productId' }, 'string'] },
                { $regexMatch: { input: '$items.productId', regex: /^[a-fA-F0-9]{24}$/ } },
              ],
            },
          ],
        },
      },
    },
    {
      $addFields: {
        productLookupId: {
          $convert: {
            input: '$items.productId',
            to: 'objectId',
            onError: null,
            onNull: null,
          },
        },
      },
    },
    { $match: { productLookupId: { $ne: null } } },
    {
      $lookup: {
        from: 'products',
        localField: 'productLookupId',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $unwind: '$product' },
    { $unwind: { path: '$product.subCategories', preserveNullAndEmptyArrays: true } },
    // Resolve the parent category for each sub-category so the report can show a
    // Category > Sub-Category breadcrumb — the embedded product.subCategories entry
    // only carries {_id, name, image}, not its parent link.
    {
      $lookup: {
        from: 'subcategories',
        localField: 'product.subCategories._id',
        foreignField: '_id',
        as: 'subCategoryDoc'
      }
    },
    { $unwind: { path: '$subCategoryDoc', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'categories',
        localField: 'subCategoryDoc.category',
        foreignField: '_id',
        as: 'parentCategoryDoc'
      }
    },
    { $unwind: { path: '$parentCategoryDoc', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: {
          subCategoryId: '$product.subCategories._id',
          subCategoryName: '$product.subCategories.name',
          categoryId: '$parentCategoryDoc._id',
          categoryName: '$parentCategoryDoc.name',
        },
        totalQuantity: { $sum: '$items.quantity' },
        totalRevenue: { $sum: '$items.subtotal' },
        totalCost: { $sum: { $multiply: ['$items.quantity', '$product.cost'] } },
        productCount: { $addToSet: '$items.productId' },
      }
    },
    {
      $addFields: {
        profit: { $subtract: ['$totalRevenue', '$totalCost'] },
        productCount: { $size: '$productCount' },
      }
    },
    { $sort: { totalRevenue: -1 } },
    {
      $project: {
        _id: 0,
        subCategoryId: '$_id.subCategoryId',
        subCategoryName: { $ifNull: ['$_id.subCategoryName', 'Uncategorized'] },
        categoryId: '$_id.categoryId',
        categoryName: { $ifNull: ['$_id.categoryName', 'No Category'] },
        totalQuantity: 1,
        totalRevenue: 1,
        totalCost: 1,
        profit: 1,
        productCount: 1,
        margin: {
          $cond: {
            if: { $gt: ['$totalRevenue', 0] },
            then: { $multiply: [{ $divide: ['$profit', '$totalRevenue'] }, 100] },
            else: 0
          }
        }
      }
    }
  ]);

  res.status(httpStatus.OK).send(subCategoryData);
});

/**
 * Get detailed product breakdown for a specific sub-category
 * @route GET /v1/dashboard/subcategory-products/:subCategoryId
 */
const getSubCategoryProducts = catchAsync(async (req, res) => {
  const aggScope = buildAggregateScope(req);
  const { subCategoryId } = req.params;
  const isUncategorized = subCategoryId === 'uncategorized';
  const { startDate, endDate } = resolveDashboardDateRange(req.query);

  const products = await Invoice.aggregate([
    {
      $match: {
        ...aggScope,
        ...buildDateMatch('invoiceDate', startDate, endDate),
        status: { $ne: 'cancelled' },
      },
    },
    { $unwind: '$items' },
    {
      $match: {
        $expr: {
          $or: [
            { $eq: [{ $type: '$items.productId' }, 'objectId'] },
            {
              $and: [
                { $eq: [{ $type: '$items.productId' }, 'string'] },
                { $regexMatch: { input: '$items.productId', regex: /^[a-fA-F0-9]{24}$/ } },
              ],
            },
          ],
        },
      },
    },
    {
      $addFields: {
        productLookupId: {
          $convert: {
            input: '$items.productId',
            to: 'objectId',
            onError: null,
            onNull: null,
          },
        },
      },
    },
    { $match: { productLookupId: { $ne: null } } },
    {
      $lookup: {
        from: 'products',
        localField: 'productLookupId',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $unwind: '$product' },
    {
      $match: isUncategorized
        ? {
            $or: [
              { 'product.subCategories': { $exists: false } },
              { 'product.subCategories': { $size: 0 } },
            ],
          }
        : {
            'product.subCategories._id': new mongoose.Types.ObjectId(subCategoryId)
          }
    },
    {
      $lookup: {
        from: 'customers',
        localField: 'customerId',
        foreignField: '_id',
        as: 'customer'
      }
    },
    {
      $addFields: {
        customerName: {
          $cond: {
            if: { $gt: [{ $size: '$customer' }, 0] },
            then: { $arrayElemAt: ['$customer.name', 0] },
            else: 'Walk-in Customer'
          }
        },
        itemCost: { $multiply: ['$items.quantity', '$product.cost'] },
        calculatedUnitPrice: {
          $cond: {
            if: { $and: [{ $gt: ['$items.price', 0] }, { $ne: ['$items.price', null] }] },
            then: '$items.price',
            else: {
              $cond: {
                if: { $gt: ['$items.quantity', 0] },
                then: { $divide: ['$items.subtotal', '$items.quantity'] },
                else: 0
              }
            }
          }
        }
      }
    },
    {
      $project: {
        _id: 0,
        invoiceId: '$_id',
        invoiceNo: '$invoiceNumber',
        invoiceDate: 1,
        customerName: 1,
        productId: '$items.productId',
        productName: '$product.name',
        productImage: '$product.image',
        quantity: '$items.quantity',
        unitPrice: '$calculatedUnitPrice',
        revenue: '$items.subtotal',
        cost: '$itemCost',
        profit: { $subtract: ['$items.subtotal', '$itemCost'] },
        trackImei: '$product.trackImei',
        trackSerial: '$product.trackSerial',
      }
    },
    { $sort: { invoiceDate: -1 } }
  ]);

  res.status(httpStatus.OK).send(products);
});

/**
 * Get detailed product breakdown for a specific category
 * @route GET /v1/dashboard/category-products/:categoryId
 */
const getCategoryProducts = catchAsync(async (req, res) => {
  const aggScope = buildAggregateScope(req);
  const { categoryId } = req.params;
  const isUncategorized = categoryId === 'uncategorized';
  const { startDate, endDate } = resolveDashboardDateRange(req.query);

  const products = await Invoice.aggregate([
    {
      $match: {
        ...aggScope,
        ...buildDateMatch('invoiceDate', startDate, endDate),
        status: { $ne: 'cancelled' },
      },
    },
    { $unwind: '$items' },
    {
      $match: {
        $expr: {
          $or: [
            { $eq: [{ $type: '$items.productId' }, 'objectId'] },
            {
              $and: [
                { $eq: [{ $type: '$items.productId' }, 'string'] },
                { $regexMatch: { input: '$items.productId', regex: /^[a-fA-F0-9]{24}$/ } },
              ],
            },
          ],
        },
      },
    },
    {
      $addFields: {
        productLookupId: {
          $convert: {
            input: '$items.productId',
            to: 'objectId',
            onError: null,
            onNull: null,
          },
        },
      },
    },
    { $match: { productLookupId: { $ne: null } } },
    {
      $lookup: {
        from: 'products',
        localField: 'productLookupId',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $unwind: '$product' },
    {
      $match: isUncategorized
        ? {
            $or: [
              { 'product.categories': { $exists: false } },
              { 'product.categories': { $size: 0 } },
            ],
          }
        : {
            'product.categories._id': new mongoose.Types.ObjectId(categoryId)
          }
    },
    {
      $lookup: {
        from: 'customers',
        localField: 'customerId',
        foreignField: '_id',
        as: 'customer'
      }
    },
    {
      $addFields: {
        customerName: {
          $cond: {
            if: { $gt: [{ $size: '$customer' }, 0] },
            then: { $arrayElemAt: ['$customer.name', 0] },
            else: 'Walk-in Customer'
          }
        },
        itemCost: { $multiply: ['$items.quantity', '$product.cost'] },
        calculatedUnitPrice: {
          $cond: {
            if: { $and: [{ $gt: ['$items.price', 0] }, { $ne: ['$items.price', null] }] },
            then: '$items.price',
            else: {
              $cond: {
                if: { $gt: ['$items.quantity', 0] },
                then: { $divide: ['$items.subtotal', '$items.quantity'] },
                else: 0
              }
            }
          }
        }
      }
    },
    {
      $project: {
        _id: 0,
        invoiceId: '$_id',
        invoiceNo: '$invoiceNumber',
        invoiceDate: 1,
        customerName: 1,
        productId: '$items.productId',
        productName: '$product.name',
        productImage: '$product.image',
        quantity: '$items.quantity',
        unitPrice: '$calculatedUnitPrice',
        revenue: '$items.subtotal',
        cost: '$itemCost',
        profit: { $subtract: ['$items.subtotal', '$itemCost'] },
        trackImei: '$product.trackImei',
        trackSerial: '$product.trackSerial',
      }
    },
    { $sort: { invoiceDate: -1 } }
  ]);

  res.status(httpStatus.OK).send(products);
});

/**
 * Get detailed product breakdown for a specific brand
 * @route GET /v1/dashboard/brand-products/:brandId
 */
const getBrandProducts = catchAsync(async (req, res) => {
  const aggScope = buildAggregateScope(req);
  const { brandId } = req.params;
  const { startDate, endDate } = resolveDashboardDateRange(req.query);

  const products = await Invoice.aggregate([
    {
      $match: {
        ...aggScope,
        ...buildDateMatch('invoiceDate', startDate, endDate),
        status: { $ne: 'cancelled' },
      },
    },
    { $unwind: '$items' },
    {
      $match: {
        $expr: {
          $or: [
            { $eq: [{ $type: '$items.productId' }, 'objectId'] },
            {
              $and: [
                { $eq: [{ $type: '$items.productId' }, 'string'] },
                { $regexMatch: { input: '$items.productId', regex: /^[a-fA-F0-9]{24}$/ } },
              ],
            },
          ],
        },
      },
    },
    {
      $addFields: {
        productLookupId: {
          $convert: {
            input: '$items.productId',
            to: 'objectId',
            onError: null,
            onNull: null,
          },
        },
      },
    },
    { $match: { productLookupId: { $ne: null } } },
    {
      $lookup: {
        from: 'products',
        localField: 'productLookupId',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $unwind: '$product' },
    {
      $match: {
        'product.brandId': new mongoose.Types.ObjectId(brandId)
      }
    },
    {
      $lookup: {
        from: 'customers',
        localField: 'customerId',
        foreignField: '_id',
        as: 'customer'
      }
    },
    {
      $addFields: {
        customerName: {
          $cond: {
            if: { $gt: [{ $size: '$customer' }, 0] },
            then: { $arrayElemAt: ['$customer.name', 0] },
            else: 'Walk-in Customer'
          }
        },
        itemCost: { $multiply: ['$items.quantity', '$product.cost'] },
        calculatedUnitPrice: {
          $cond: {
            if: { $and: [{ $gt: ['$items.price', 0] }, { $ne: ['$items.price', null] }] },
            then: '$items.price',
            else: {
              $cond: {
                if: { $gt: ['$items.quantity', 0] },
                then: { $divide: ['$items.subtotal', '$items.quantity'] },
                else: 0
              }
            }
          }
        }
      }
    },
    {
      $project: {
        _id: 0,
        invoiceId: '$_id',
        invoiceNo: '$invoiceNumber',
        invoiceDate: 1,
        customerName: 1,
        productId: '$items.productId',
        productName: '$product.name',
        productImage: '$product.image',
        quantity: '$items.quantity',
        unitPrice: '$calculatedUnitPrice',
        revenue: '$items.subtotal',
        cost: '$itemCost',
        profit: { $subtract: ['$items.subtotal', '$itemCost'] },
        trackImei: '$product.trackImei',
        trackSerial: '$product.trackSerial',
      }
    },
    { $sort: { invoiceDate: -1 } }
  ]);

  res.status(httpStatus.OK).send(products);
});

module.exports = {
  getDashboardStats,
  getRevenueData,
  getTopProducts,
  getTopCustomers,
  getLowStockProducts,
  getRecentActivities,
  getProductsByCategory,
  getProductsByBrand,
  getCategoryProducts,
  getBrandProducts,
  getProductsBySubCategory,
  getSubCategoryProducts,
};
