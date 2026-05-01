const mongoose = require('mongoose');
const catchAsync = require('../utils/catchAsync');
const { Expense, Invoice, LoadPurchase, LoadTransaction, Wallet, WalletEntry, RepairJob, ServiceInvoice, CashWithdrawal, SimSale, Purchase } = require('../models');
const { isValidObjectId } = mongoose;

const parseDateBoundary = (value, isEnd = false) => {
  if (!value) return null;
  const raw = String(value);
  const datePart = raw.slice(0, 10);
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);

  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]) - 1;
    const day = Number(dateOnlyMatch[3]);
    return isEnd
      ? new Date(Date.UTC(year, month, day, 23, 59, 59, 999))
      : new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  if (isEnd) parsed.setUTCHours(23, 59, 59, 999);
  else parsed.setUTCHours(0, 0, 0, 0);
  return parsed;
};

const getRange = (query) => {
  const now = new Date();
  const range = query.range === 'monthly' ? 'monthly' : 'daily';
  let startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (range === 'monthly') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  if (query.startDate) {
    startDate = new Date(query.startDate);
  }

  const endDate = query.endDate ? new Date(query.endDate) : now;

  return { range, startDate, endDate };
};

const getDateGrouping = (range, field) => {
  if (range === 'monthly') {
    return { $dateToString: { format: '%Y-%m', date: field } };
  }

  return { $dateToString: { format: '%Y-%m-%d', date: field } };
};

const getScopedMatch = (req, startDate, endDate, field = 'date') => ({
  organizationId: req.organizationId || req.user.organizationId,
  ...(req.branchId ? { branchId: req.branchId } : {}),
  [field]: { $gte: startDate, $lte: endDate },
});

const getSalesReport = catchAsync(async (req, res) => {
  const { range, startDate, endDate } = getRange(req.query);
  const data = await Invoice.aggregate([
    {
      $match: {
        ...getScopedMatch(req, startDate, endDate, 'invoiceDate'),
        status: { $ne: 'cancelled' },
      },
    },
    {
      $group: {
        _id: getDateGrouping(range, '$invoiceDate'),
        totalSales: { $sum: '$total' },
        totalProfit: { $sum: '$totalProfit' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.send({ range, data });
});

const getLoadReport = catchAsync(async (req, res) => {
  const { range, startDate, endDate } = getRange(req.query);
  const sold = await LoadTransaction.aggregate([
    { $match: getScopedMatch(req, startDate, endDate) },
    {
      $group: {
        _id: getDateGrouping(range, '$date'),
        totalLoadSold: { $sum: '$amount' },
        totalProfit: { $sum: '$profit' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const purchased = await LoadPurchase.aggregate([
    { $match: getScopedMatch(req, startDate, endDate) },
    {
      $group: {
        _id: getDateGrouping(range, '$date'),
        totalLoadPurchased: { $sum: '$amount' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.send({ range, sold, purchased });
});

const getProfitReport = catchAsync(async (req, res) => {
  const { range, startDate, endDate } = getRange(req.query);
  const [salesProfit, loadProfit, repairProfit, serviceProfit] = await Promise.all([
    Invoice.aggregate([
      {
        $match: {
          ...getScopedMatch(req, startDate, endDate, 'invoiceDate'),
          status: { $ne: 'cancelled' },
        },
      },
      {
        $group: {
          _id: getDateGrouping(range, '$invoiceDate'),
          amount: { $sum: '$totalProfit' },
        },
      },
    ]),
    LoadTransaction.aggregate([
      { $match: getScopedMatch(req, startDate, endDate) },
      {
        $group: {
          _id: getDateGrouping(range, '$date'),
          amount: { $sum: '$profit' },
        },
      },
    ]),
    RepairJob.aggregate([
      { $match: getScopedMatch(req, startDate, endDate) },
      {
        $group: {
          _id: getDateGrouping(range, '$date'),
          amount: { $sum: '$charges' },
        },
      },
    ]),
    ServiceInvoice.aggregate([
      {
        $match: {
          ...getScopedMatch(req, startDate, endDate),
        },
      },
      {
        $group: {
          _id: getDateGrouping(range, '$date'),
          amount: { $sum: '$totalAmount' },
        },
      },
    ]),
  ]);

  res.send({ range, salesProfit, loadProfit, repairProfit, serviceProfit });
});

const getExpenseReport = catchAsync(async (req, res) => {
  const { range, startDate, endDate } = getRange(req.query);
  const [expenses, loadPurchases] = await Promise.all([
    Expense.aggregate([
      { $match: getScopedMatch(req, startDate, endDate) },
      {
        $group: {
          _id: getDateGrouping(range, '$date'),
          totalExpense: { $sum: '$amount' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    LoadPurchase.aggregate([
      { $match: getScopedMatch(req, startDate, endDate) },
      {
        $group: {
          _id: getDateGrouping(range, '$date'),
          totalLoadPurchaseExpense: { $sum: '$amount' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  res.send({ range, expenses, loadPurchases });
});

/**
 * Wallet Balance Statement
 * Returns day-by-day opening balance → sold → profit → closing balance.
 * Every date in the range is included; days with no sales show zero sold/profit.
 */
const getWalletBalanceStatement = catchAsync(async (req, res) => {
  const { walletType, startDate: rawStart, endDate: rawEnd } = req.query;
  if (!walletType) {
    return res.status(400).json({ message: 'walletType is required' });
  }

  const organizationId = new mongoose.Types.ObjectId(String(req.organizationId));
  const branchId = req.branchId ? new mongoose.Types.ObjectId(String(req.branchId)) : null;
  const formatPaymentMethodLabel = (paymentMethod, paymentWalletType) => {
    const method = String(paymentMethod || '').toLowerCase();
    if (method === 'wallet') {
      return paymentWalletType ? `wallet (${paymentWalletType})` : 'wallet';
    }
    return paymentMethod || '';
  };

  const end = parseDateBoundary(rawEnd, true) || new Date();
  const start =
    parseDateBoundary(rawStart, false) ||
    new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

  // ── 1. Current wallet balance ──
  const walletMatch = { organizationId, type: walletType };
  if (branchId) walletMatch.branchId = branchId;
  const wallet = await Wallet.findOne(walletMatch);
  const currentBalance = wallet ? wallet.balance : 0;

  const txBaseMatch = { organizationId, walletType };
  if (branchId) txBaseMatch.branchId = branchId;

  // ── 2. Net change AFTER end date (to back-calculate closing balance at end) ──
  // Load sales DECREASE balance; SimSale load DECREASES balance; cash withdrawals INCREASE balance; cash deposits DECREASE balance
  const [loadAfterRes, cashAfterRes, simSaleAfterRes, loadPurchaseAfterRes, walletEntryAfterRes] = await Promise.all([
    LoadTransaction.aggregate([
      { $match: { ...txBaseMatch, date: { $gt: end } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    CashWithdrawal.aggregate([
      { $match: { ...txBaseMatch, date: { $gt: end } } },
      {
        $group: {
          _id: null,
          totalWithdrawals: { $sum: { $cond: [{ $eq: ['$transactionType', 'withdrawal'] }, '$amount', 0] } },
          totalDeposits: { $sum: { $cond: [{ $eq: ['$transactionType', 'deposit'] }, '$amount', 0] } },
        },
      },
    ]),
    SimSale.aggregate([
      { $match: { ...txBaseMatch, date: { $gt: end } } },
      { $group: { _id: null, total: { $sum: '$loadAmount' } } },
    ]),
    LoadPurchase.aggregate([
      { $match: { ...txBaseMatch, date: { $gt: end } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    WalletEntry.aggregate([
      {
        $match: {
          organizationId,
          ...(branchId ? { branchId } : {}),
          walletType,
          date: { $gt: end },
        },
      },
      {
        $group: {
          _id: null,
          totalIn: { $sum: { $cond: [{ $eq: ['$type', 'in'] }, '$amount', 0] } },
          totalOut: { $sum: { $cond: [{ $eq: ['$type', 'out'] }, '$amount', 0] } },
        },
      },
    ]),
  ]);

  const totalLoadAfter = loadAfterRes[0] ? loadAfterRes[0].total : 0;
  const totalWithdrawalsAfter = cashAfterRes[0] ? cashAfterRes[0].totalWithdrawals : 0;
  const totalDepositsAfter = cashAfterRes[0] ? cashAfterRes[0].totalDeposits : 0;
  const totalSimSaleLoadAfter = simSaleAfterRes[0] ? simSaleAfterRes[0].total : 0;
  const totalLoadPurchaseAfter = loadPurchaseAfterRes[0] ? loadPurchaseAfterRes[0].total : 0;
  const totalWalletInAfter = walletEntryAfterRes[0] ? walletEntryAfterRes[0].totalIn : 0;
  const totalWalletOutAfter = walletEntryAfterRes[0] ? walletEntryAfterRes[0].totalOut : 0;

  // closingAtEnd = currentBalance - (all wallet impacts after end)
  const totalImpactAfterEnd =
    -totalLoadAfter +
    totalWithdrawalsAfter -
    totalDepositsAfter -
    totalSimSaleLoadAfter +
    totalLoadPurchaseAfter +
    totalWalletInAfter -
    totalWalletOutAfter;
  const closingAtEnd = currentBalance - totalImpactAfterEnd;

  // ── 3. Daily aggregation within range ──
  const [dailyLoad, dailyCash, dailySimSale, dailyLoadPurchase, loadDetails, cashDetails, simSaleDetails, loadPurchaseDetails, walletEntriesInRange] = await Promise.all([
    LoadTransaction.aggregate([
      { $match: { ...txBaseMatch, date: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          totalSold: { $sum: '$amount' },
          loadProfit: { $sum: '$profit' },
          loadTransactions: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    CashWithdrawal.aggregate([
      { $match: { ...txBaseMatch, date: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          totalWithdrawals: { $sum: { $cond: [{ $eq: ['$transactionType', 'withdrawal'] }, '$amount', 0] } },
          totalDeposits: { $sum: { $cond: [{ $eq: ['$transactionType', 'deposit'] }, '$amount', 0] } },
          cashProfit: { $sum: '$profit' },
          cashTransactions: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    SimSale.aggregate([
      { $match: { ...txBaseMatch, date: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          totalSimSaleLoad: { $sum: '$loadAmount' },
          simSaleCommission: { $sum: '$commission' },
          simSaleTransactions: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    LoadPurchase.aggregate([
      { $match: { ...txBaseMatch, date: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          totalPurchased: { $sum: '$amount' },
          totalPurchaseProfit: { $sum: '$profit' },
          purchaseTransactions: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    LoadTransaction.find({ ...txBaseMatch, date: { $gte: start, $lte: end } })
      .sort({ date: 1, createdAt: 1 })
      .select('date createdAt mobileNumber customerName network amount receivedAmount extraCharge profit paymentMethod notes type')
      .lean(),
    CashWithdrawal.find({ ...txBaseMatch, date: { $gte: start, $lte: end } })
      .sort({ date: 1, createdAt: 1 })
      .select('date createdAt transactionType customerNumber customerName amount cashAmount extraCharge profit notes')
      .lean(),
    SimSale.find({ ...txBaseMatch, date: { $gte: start, $lte: end } })
      .sort({ date: 1, createdAt: 1 })
      .select('date createdAt customerMobile customerName productName loadAmount simAmount saleAmount commission paymentMethod paymentWalletType notes')
      .lean(),
    LoadPurchase.find({ ...txBaseMatch, date: { $gte: start, $lte: end } })
      .sort({ date: 1, createdAt: 1 })
      .select('date createdAt supplierName amount profit paymentMethod paymentWalletType notes')
      .lean(),
    WalletEntry.find({
      organizationId,
      ...(branchId ? { branchId } : {}),
      walletType,
      date: { $gte: start, $lte: end },
    })
      .sort({ date: 1, createdAt: 1 })
      .select('date createdAt type amount referenceId referenceModel description')
      .lean(),
  ]);

  const invoiceRefIds = walletEntriesInRange
    .filter((entry) => entry.referenceModel === 'Invoice' && entry.referenceId)
    .map((entry) => entry.referenceId);
  const purchaseRefIds = walletEntriesInRange
    .filter((entry) => entry.referenceModel === 'Purchase' && entry.referenceId)
    .map((entry) => entry.referenceId);

  const [invoiceRefs, purchaseRefs] = await Promise.all([
    invoiceRefIds.length > 0
      ? Invoice.find({ _id: { $in: invoiceRefIds } })
        .select('invoiceNumber customerName walkInCustomerName customerId')
        .lean()
      : Promise.resolve([]),
    purchaseRefIds.length > 0
      ? Purchase.find({ _id: { $in: purchaseRefIds } })
        .select('invoiceNumber supplier')
        .populate('supplier', 'name')
        .lean()
      : Promise.resolve([]),
  ]);

  const invoiceRefMap = {};
  invoiceRefs.forEach((inv) => {
    invoiceRefMap[String(inv._id)] = inv;
  });
  const purchaseRefMap = {};
  purchaseRefs.forEach((pur) => {
    purchaseRefMap[String(pur._id)] = pur;
  });

  const customerObjectIds = invoiceRefs
    .map((inv) => inv.customerId)
    .filter((id) => typeof id === 'string' ? isValidObjectId(id) : id && isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(String(id)));

  const customerDocs = customerObjectIds.length > 0
    ? await mongoose.model('Customer').find({ _id: { $in: customerObjectIds } }).select('name').lean()
    : [];
  const customerMap = {};
  customerDocs.forEach((customer) => {
    customerMap[String(customer._id)] = customer;
  });

  const loadMap = dailyLoad.reduce((acc, d) => {
    acc[d._id] = d;
    return acc;
  }, {});
  const cashMap = dailyCash.reduce((acc, d) => {
    acc[d._id] = d;
    return acc;
  }, {});
  const simSaleMap = dailySimSale.reduce((acc, d) => {
    acc[d._id] = d;
    return acc;
  }, {});
  const loadPurchaseMap = dailyLoadPurchase.reduce((acc, d) => {
    acc[d._id] = d;
    return acc;
  }, {});
  const detailMap = {};
  const ensureBucket = (key) => {
    if (!detailMap[key]) detailMap[key] = [];
    return detailMap[key];
  };

  loadDetails.forEach((item) => {
    const dateKey = new Date(item.date).toISOString().slice(0, 10);
    ensureBucket(dateKey).push({
      id: String(item._id),
      date: item.date,
      createdAt: item.createdAt,
      source: 'load',
      transactionType: 'load_sale',
      title: item.type === 'package' ? 'Package Load Sale' : 'Load Sale',
      accountNumber: item.mobileNumber || '',
      customerName: item.customerName || '',
      network: item.network || '',
      amount: Number(item.amount || 0),
      walletImpact: -Number(item.amount || 0),
      cashAmount: Number(item.receivedAmount || 0),
      extraCharge: Number(item.extraCharge || 0),
      profit: Number(item.profit || 0),
      paymentMethod: item.paymentMethod || '',
      notes: item.notes || '',
    });
  });

  cashDetails.forEach((item) => {
    const dateKey = new Date(item.date).toISOString().slice(0, 10);
    const isWithdrawal = item.transactionType === 'withdrawal';
    ensureBucket(dateKey).push({
      id: String(item._id),
      date: item.date,
      createdAt: item.createdAt,
      source: 'cash_withdrawal',
      transactionType: item.transactionType,
      title: isWithdrawal ? 'Cash Withdrawal' : 'Cash Deposit',
      accountNumber: item.customerNumber || '',
      customerName: item.customerName || '',
      network: '',
      amount: Number(item.amount || 0),
      walletImpact: isWithdrawal ? Number(item.amount || 0) : -Number(item.amount || 0),
      cashAmount: Number(item.cashAmount || 0),
      extraCharge: Number(item.extraCharge || 0),
      profit: Number(item.profit || 0),
      paymentMethod: item.paymentMethod || 'cash',
      notes: item.notes || '',
    });
  });

  simSaleDetails.forEach((item) => {
    const dateKey = new Date(item.date).toISOString().slice(0, 10);
    ensureBucket(dateKey).push({
      id: String(item._id),
      date: item.date,
      createdAt: item.createdAt,
      source: 'sim_sale',
      transactionType: 'sim_sale_load',
      title: 'SIM Sale Load',
      accountNumber: item.customerMobile || '',
      customerName: item.customerName || '',
      network: '',
      amount: Number(item.loadAmount || 0),
      walletImpact: -Number(item.loadAmount || 0),
      cashAmount: Number(item.saleAmount || 0),
      extraCharge: 0,
      // SIM sale commission is excluded from wallet balance statement profit.
      profit: 0,
      paymentMethod: formatPaymentMethodLabel(item.paymentMethod, item.paymentWalletType),
      notes: item.notes || item.productName || '',
    });
  });
  loadPurchaseDetails.forEach((item) => {
    const dateKey = new Date(item.date).toISOString().slice(0, 10);
    ensureBucket(dateKey).push({
      id: String(item._id),
      date: item.date,
      createdAt: item.createdAt,
      source: 'load_purchase',
      transactionType: 'load_purchase',
      title: 'Load Purchase',
      accountNumber: item.supplierName || '',
      customerName: item.supplierName || '',
      network: '',
      amount: Number(item.amount || 0),
      walletImpact: Number(item.amount || 0),
      cashAmount: Number(item.amount || 0),
      extraCharge: 0,
      profit: Number(item.profit || 0),
      paymentMethod: formatPaymentMethodLabel(item.paymentMethod, item.paymentWalletType),
      notes: item.notes || '',
    });
  });

  walletEntriesInRange.forEach((entry) => {
    const dateKey = new Date(entry.date).toISOString().slice(0, 10);
    const impact = entry.type === 'in' ? Number(entry.amount || 0) : -Number(entry.amount || 0);
    let title = entry.type === 'in' ? 'Wallet Inflow' : 'Wallet Outflow';
    let accountNumber = '';
    let customerName = '';
    let notes = entry.description || '';

    if (entry.referenceModel === 'Invoice') {
      const inv = invoiceRefMap[String(entry.referenceId)];
      title = entry.type === 'in' ? 'Invoice Wallet Payment Received' : 'Invoice Wallet Payment Sent';
      accountNumber = inv?.invoiceNumber || '';
      customerName =
        inv?.customerName ||
        inv?.walkInCustomerName ||
        (inv?.customerId && customerMap[String(inv.customerId)] ? customerMap[String(inv.customerId)].name : '') ||
        '';
      notes = `${entry.description || ''}`.trim();
    } else if (entry.referenceModel === 'Purchase') {
      const pur = purchaseRefMap[String(entry.referenceId)];
      title = entry.type === 'out' ? 'Purchase Wallet Payment Sent' : 'Purchase Wallet Payment Received';
      accountNumber = pur?.invoiceNumber || '';
      customerName = pur?.supplier?.name || '';
      notes = `${entry.description || ''}`.trim();
    } else if (entry.referenceModel === 'SimSale') {
      title = entry.type === 'in' ? 'SIM Sale Wallet Payment Received' : 'SIM Sale Wallet Payment Sent';
    } else if (entry.referenceModel === 'LoadPurchase') {
      title = entry.type === 'out' ? 'Load Purchase Wallet Payment Sent' : 'Load Purchase Wallet Payment Received';
    } else if (entry.referenceModel === 'CustomerLedger') {
      title = entry.type === 'in' ? 'Customer Wallet Receipt' : 'Customer Wallet Payment';
    } else if (entry.referenceModel === 'SupplierLedger') {
      title = entry.type === 'out' ? 'Supplier Wallet Payment' : 'Supplier Wallet Receipt';
    }

    ensureBucket(dateKey).push({
      id: String(entry._id),
      date: entry.date,
      createdAt: entry.createdAt,
      source: 'wallet_entry',
      transactionType: entry.type === 'in' ? 'wallet_in' : 'wallet_out',
      title,
      accountNumber,
      customerName,
      network: '',
      amount: Number(entry.amount || 0),
      walletImpact: impact,
      cashAmount: 0,
      extraCharge: 0,
      profit: 0,
      paymentMethod: `wallet (${walletType})`,
      notes,
    });
  });

  // ── 4. Build every calendar date in range ──
  const rows = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    const ld = loadMap[key];
    const cw = cashMap[key];
    const ss = simSaleMap[key];
    const lp = loadPurchaseMap[key];
    const ldTotalSold = ld ? ld.totalSold : 0;
    const cwTotalWithdrawals = cw ? cw.totalWithdrawals : 0;
    const cwTotalDeposits = cw ? cw.totalDeposits : 0;
    const ssTotalSimSaleLoad = ss ? ss.totalSimSaleLoad : 0;
    const lpTotalPurchased = lp ? lp.totalPurchased : 0;
    const lpTotalPurchaseProfit = lp ? lp.totalPurchaseProfit : 0;
    rows.push({
      date: key,
      hasSales: !!(ld || cw || ss || lp),
      totalSold: ldTotalSold,
      totalSimSaleLoad: ssTotalSimSaleLoad,
      totalWithdrawals: cwTotalWithdrawals,
      totalDeposits: cwTotalDeposits,
      totalProfit: (ld ? ld.loadProfit : 0) + (cw ? cw.cashProfit : 0) + lpTotalPurchaseProfit,
      transactions: (ld ? ld.loadTransactions : 0) + (cw ? cw.cashTransactions : 0) + (ss ? ss.simSaleTransactions : 0) + (lp ? lp.purchaseTransactions : 0),
      detailItems: (detailMap[key] || []).sort((a, b) => {
        const aDate = new Date(a.date).getTime();
        const bDate = new Date(b.date).getTime();
        if (aDate !== bDate) return aDate - bDate;
        return new Date(a.createdAt || a.date).getTime() - new Date(b.createdAt || b.date).getTime();
      }),
    });
    rows[rows.length - 1].netWalletImpact = rows[rows.length - 1].detailItems.reduce((sum, item) => sum + Number(item.walletImpact || 0), 0);
    cursor.setDate(cursor.getDate() + 1);
  }

  // ── 5. Walk backwards to assign running balances from detailed net impact ──
  let runningClose = closingAtEnd;
  rows
    .slice()
    .reverse()
    .forEach((row, idx) => {
      const actualIdx = rows.length - 1 - idx;
      rows[actualIdx].closingBalance = runningClose;
      rows[actualIdx].openingBalance = runningClose - Number(row.netWalletImpact || 0);
      runningClose = rows[actualIdx].openingBalance;
    });

  res.send({
    walletType,
    walletBalance: currentBalance,
    periodOpeningBalance: rows.length > 0 ? rows[0].openingBalance : currentBalance,
    periodClosingBalance: rows.length > 0 ? rows[rows.length - 1].closingBalance : currentBalance,
    rows,
    period: { startDate: start.toISOString(), endDate: end.toISOString() },
  });
});

module.exports = {
  getSalesReport,
  getLoadReport,
  getProfitReport,
  getExpenseReport,
  getWalletBalanceStatement,
};
