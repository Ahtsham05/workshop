const mongoose = require('mongoose');
const { Branch, Invoice, Purchase, Expense, Customer, Membership, Product } = require('../models');
const cashBookService = require('./cashBook.service');
const { buildDateMatch } = require('../utils/dashboardDateRange');
const { toBusinessCalendarDate } = require('../utils/businessTimezone');

const toObjectId = (id) => (mongoose.Types.ObjectId.isValid(String(id)) ? new mongoose.Types.ObjectId(String(id)) : id);

/** Groups a metric aggregation's rows by branchId string for O(1) lookup while merging. */
const byBranchId = (rows) => new Map(rows.map((row) => [String(row._id), row]));

/**
 * Org-wide, per-branch snapshot for the super-admin "Branch Performance" dashboard.
 * Unlike every other report/dashboard aggregation in this codebase, this one is
 * intentionally NOT scoped to a single req.branchId — it groups by branchId instead
 * of matching one, so a superAdmin can view every branch at once regardless of which
 * branch is currently active in their header.
 */
const getBranchOverviewSummary = async ({ organizationId, startDate, endDate }) => {
  const orgId = toObjectId(organizationId);
  const invoiceDateFilter = buildDateMatch('invoiceDate', startDate, endDate);
  const purchaseDateFilter = buildDateMatch('purchaseDate', startDate, endDate);
  const expenseDateFilter = buildDateMatch('date', startDate, endDate);

  const [branches, salesRows, purchaseRows, expenseRows, customerRows, staffRows, lowStockRows] = await Promise.all([
    Branch.find({ organizationId: orgId }).select('name nameUrdu isDefault isActive').sort({ isDefault: -1, name: 1 }).lean(),
    Invoice.aggregate([
      { $match: { organizationId: orgId, ...invoiceDateFilter, status: { $ne: 'cancelled' } } },
      {
        $group: {
          _id: '$branchId',
          totalSales: { $sum: '$total' },
          totalProfit: { $sum: { $ifNull: ['$totalProfit', 0] } },
          invoiceCount: { $sum: 1 },
        },
      },
    ]),
    Purchase.aggregate([
      { $match: { organizationId: orgId, ...purchaseDateFilter } },
      { $group: { _id: '$branchId', totalPurchases: { $sum: '$totalAmount' } } },
    ]),
    Expense.aggregate([
      { $match: { organizationId: orgId, ...expenseDateFilter, isPaid: { $ne: false } } },
      { $group: { _id: '$branchId', totalExpenses: { $sum: '$amount' } } },
    ]),
    Customer.aggregate([
      { $match: { organizationId: orgId } },
      { $group: { _id: '$branchId', customerCount: { $sum: 1 } } },
    ]),
    Membership.aggregate([
      { $match: { organizationId: orgId, isActive: true } },
      { $group: { _id: '$branchId', staffCount: { $sum: 1 } } },
    ]),
    Product.aggregate([
      { $match: { organizationId: orgId, hasVariants: { $ne: true }, stockQuantity: { $lte: 10 } } },
      { $group: { _id: '$branchId', lowStockCount: { $sum: 1 } } },
    ]),
  ]);

  const salesById = byBranchId(salesRows);
  const purchaseById = byBranchId(purchaseRows);
  const expenseById = byBranchId(expenseRows);
  const customerById = byBranchId(customerRows);
  const staffById = byBranchId(staffRows);
  const lowStockById = byBranchId(lowStockRows);

  // Cash-in-hand is a running-balance calc, not a simple sum, so it can't be grouped
  // like the aggregations above — resolve it one branch at a time (mirrors how
  // dashboard.controller.js's getDashboardStats calls it for a single active branch).
  const cashInHandAsOf = toBusinessCalendarDate(new Date());
  const cashInHandByBranch = await Promise.all(
    branches.map((branch) =>
      cashBookService
        .getCashInHandSummary({ organizationId: orgId, branchId: branch._id, endDate: cashInHandAsOf })
        .then((summary) => summary.closingBalance)
    )
  );

  const branchRows = branches.map((branch, index) => {
    const id = String(branch._id);
    const totalSales = salesById.get(id)?.totalSales || 0;
    const totalProfit = salesById.get(id)?.totalProfit || 0;
    const invoiceCount = salesById.get(id)?.invoiceCount || 0;
    const totalPurchases = purchaseById.get(id)?.totalPurchases || 0;
    const totalExpenses = expenseById.get(id)?.totalExpenses || 0;

    return {
      branchId: id,
      branchName: branch.name,
      branchNameUrdu: branch.nameUrdu || '',
      isDefault: !!branch.isDefault,
      isActive: !!branch.isActive,
      totalSales,
      totalProfit,
      invoiceCount,
      totalPurchases,
      totalExpenses,
      netProfit: totalProfit - totalExpenses,
      cashInHand: cashInHandByBranch[index] || 0,
      customerCount: customerById.get(id)?.customerCount || 0,
      staffCount: staffById.get(id)?.staffCount || 0,
      lowStockCount: lowStockById.get(id)?.lowStockCount || 0,
    };
  });

  const totalSales = branchRows.reduce((sum, b) => sum + b.totalSales, 0);
  branchRows.forEach((b) => {
    b.revenueSharePct = totalSales > 0 ? parseFloat(((b.totalSales / totalSales) * 100).toFixed(1)) : 0;
  });
  branchRows.sort((a, b) => b.totalSales - a.totalSales);

  const totals = branchRows.reduce(
    (acc, b) => ({
      totalSales: acc.totalSales + b.totalSales,
      totalProfit: acc.totalProfit + b.totalProfit,
      totalPurchases: acc.totalPurchases + b.totalPurchases,
      totalExpenses: acc.totalExpenses + b.totalExpenses,
      netProfit: acc.netProfit + b.netProfit,
      cashInHand: acc.cashInHand + b.cashInHand,
      invoiceCount: acc.invoiceCount + b.invoiceCount,
    }),
    { totalSales: 0, totalProfit: 0, totalPurchases: 0, totalExpenses: 0, netProfit: 0, cashInHand: 0, invoiceCount: 0 }
  );

  return {
    branches: branchRows,
    totals: {
      ...totals,
      branchCount: branchRows.length,
      bestBranchName: branchRows[0]?.branchName || null,
    },
  };
};

module.exports = { getBranchOverviewSummary };
