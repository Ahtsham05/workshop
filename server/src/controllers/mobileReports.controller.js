const mongoose = require('mongoose');
const catchAsync = require('../utils/catchAsync');
const { Expense, Invoice, LoadPurchase, LoadTransaction, Wallet, WalletEntry, RepairJob, ServiceInvoice, CashWithdrawal, SimSale, Purchase, CashBookEntry } = require('../models');
const { resolveCashInHandBalance } = require('../services/wallet.service');
const { isValidObjectId } = mongoose;

const { parseBusinessDateBoundary: parseDateBoundary, toBusinessCalendarDate, eachBusinessCalendarDate, BUSINESS_TZ } = require('../utils/businessTimezone');

const businessDateGroup = (field = '$date') => ({
  $dateToString: { format: '%Y-%m-%d', date: field, timezone: BUSINESS_TZ },
});

const toCalendarDateKey = (value) => toBusinessCalendarDate(new Date(value));

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

// Friendly title per CashBookEntry.source, for the rows a cash-type Bank Account
// pulls in from Cash Book (see getWalletBalanceStatement) that have no more specific
// referenceModel-based title below. Mirrors CASH_MODULE_LABELS' referenceModel-keyed
// map in cashBook.service.js, but keyed by `source` since that's what's on every row.
const CASH_BOOK_SOURCE_TITLES = {
  sale: 'Sale Payment',
  load: 'Load Transaction',
  repair: 'Repair Payment',
  service: 'Service Payment',
  purchase: 'Purchase Payment',
  expense: 'Expense',
  other: 'Cash Transaction',
  sales_return: 'Sales Return',
  purchase_return: 'Purchase Return',
  bill_payment: 'Bill Payment',
  opening_balance: 'Opening Balance',
  installment: 'Installment Payment',
  wallet: 'Wallet Transaction',
  used_phone_buyback: 'Used Phone Buyback',
  commission_payment: 'Commission Payment',
  partner_share_payment: 'Partner Share Payment',
  payment_voucher: 'Payment Voucher',
  receipt_voucher: 'Receipt Voucher',
};

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
  const currentBalance =
    wallet && wallet.accountType === 'cash'
      ? await resolveCashInHandBalance(organizationId, branchId)
      : wallet
        ? wallet.balance
        : 0;

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

  // A cash-type Bank Account (e.g. the default "Cash in Hand") has no WalletEntry trail
  // of its own for most modules — Invoice/Purchase/Expense/etc. post its cash leg straight
  // to CashBookEntry instead (CashBookEntry carries no walletType; it's the org/branch's
  // single cash ledger, same scoping resolveCashInHandBalance already uses). Only the
  // voucher/ledger sources (Payment/Receipt Voucher, Supplier/Customer Ledger) post BOTH —
  // a WalletEntry for the balance move *and* a CashBookEntry mirror for Cash Book visibility
  // — so those must be excluded here by (referenceId, referenceModel) to avoid double-counting
  // the same movement twice into the after-end correction.
  const isCashWallet = !!(wallet && wallet.accountType === 'cash');
  let cashBookImpactAfterEnd = 0;
  if (isCashWallet) {
    const [walletEntryAfterEndDocs, cashBookAfterEndDocs] = await Promise.all([
      WalletEntry.find({ organizationId, ...(branchId ? { branchId } : {}), walletType, date: { $gt: end } })
        .select('referenceId referenceModel')
        .lean(),
      // paymentMethod: 'cash' matches getCashInHandSummary's own filter exactly (see
      // cashBook.service.js) — the live balance this page's currentBalance/closingAtEnd
      // are built from only ever counts 'cash'-tagged rows, so the detail list must use
      // the identical filter or the two would silently disagree.
      CashBookEntry.find({ organizationId, ...(branchId ? { branchId } : {}), paymentMethod: 'cash', date: { $gt: end } })
        .select('referenceId referenceModel type amount')
        .lean(),
    ]);
    const walletEntryAfterEndKeys = new Set(
      walletEntryAfterEndDocs
        .filter((e) => e.referenceId && e.referenceModel)
        .map((e) => `${e.referenceId}:${e.referenceModel}`)
    );
    cashBookImpactAfterEnd = cashBookAfterEndDocs.reduce((sum, entry) => {
      const key = entry.referenceId && entry.referenceModel ? `${entry.referenceId}:${entry.referenceModel}` : null;
      if (key && walletEntryAfterEndKeys.has(key)) return sum;
      return sum + (entry.type === 'income' ? Number(entry.amount || 0) : -Number(entry.amount || 0));
    }, 0);
  }

  // closingAtEnd = currentBalance - (all wallet impacts after end)
  const totalImpactAfterEnd =
    -totalLoadAfter +
    totalWithdrawalsAfter -
    totalDepositsAfter -
    totalSimSaleLoadAfter +
    totalLoadPurchaseAfter +
    totalWalletInAfter -
    totalWalletOutAfter +
    cashBookImpactAfterEnd;
  const closingAtEnd = currentBalance - totalImpactAfterEnd;

  // ── 3. Daily aggregation within range ──
  const [dailyLoad, dailyCash, dailySimSale, dailyLoadPurchase, loadDetails, cashDetails, simSaleDetails, loadPurchaseDetails, walletEntriesInRange, cashBookEntriesInRange] = await Promise.all([
    LoadTransaction.aggregate([
      { $match: { ...txBaseMatch, date: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: businessDateGroup('$date'),
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
          _id: businessDateGroup('$date'),
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
          _id: businessDateGroup('$date'),
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
          _id: businessDateGroup('$date'),
          totalPurchased: { $sum: '$amount' },
          totalPurchaseProfit: { $sum: '$profit' },
          purchaseTransactions: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    LoadTransaction.find({ ...txBaseMatch, date: { $gte: start, $lte: end } })
      .sort({ date: 1, createdAt: 1 })
      .select('date createdAt mobileNumber customerName network amount receivedAmount extraCharge profit paymentMethod paymentWalletType notes type')
      .lean(),
    CashWithdrawal.find({ ...txBaseMatch, date: { $gte: start, $lte: end } })
      .sort({ date: 1, createdAt: 1 })
      .select('date createdAt transactionType customerNumber customerName customerAccountType amount cashAmount extraCharge profit notes')
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
    isCashWallet
      ? CashBookEntry.find({ organizationId, ...(branchId ? { branchId } : {}), paymentMethod: 'cash', date: { $gte: start, $lte: end } })
        .sort({ date: 1, createdAt: 1 })
        .select('date createdAt type source amount referenceId referenceModel description notes')
        .lean()
      : Promise.resolve([]),
  ]);

  // Voucher/ledger sources post both a WalletEntry (balance move) and a CashBookEntry
  // (Cash Book mirror) for a cash-type account — same (referenceId, referenceModel) pair
  // in both, per module 2f/2c/3's sync services. Everything else (Invoice/Purchase/Expense/
  // RepairJob/BillPayment/...) only ever posts the CashBookEntry side for a cash-type
  // account, so it's excluded from this set and passes through untouched below.
  const walletEntryRefKeys = new Set(
    walletEntriesInRange
      .filter((entry) => entry.referenceId && entry.referenceModel)
      .map((entry) => `${entry.referenceId}:${entry.referenceModel}`)
  );
  const cashBookOnlyEntries = cashBookEntriesInRange.filter((entry) => {
    const key = entry.referenceId && entry.referenceModel ? `${entry.referenceId}:${entry.referenceModel}` : null;
    return !key || !walletEntryRefKeys.has(key);
  });

  const invoiceRefIds = [
    ...walletEntriesInRange
      .filter((entry) => entry.referenceModel === 'Invoice' && entry.referenceId)
      .map((entry) => entry.referenceId),
    ...cashBookOnlyEntries
      .filter((entry) => entry.referenceModel === 'Invoice' && entry.referenceId)
      .map((entry) => entry.referenceId),
  ];
  const purchaseRefIds = [
    ...walletEntriesInRange
      .filter((entry) => entry.referenceModel === 'Purchase' && entry.referenceId)
      .map((entry) => entry.referenceId),
    ...cashBookOnlyEntries
      .filter((entry) => entry.referenceModel === 'Purchase' && entry.referenceId)
      .map((entry) => entry.referenceId),
  ];

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
    const dateKey = toCalendarDateKey(item.date);
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
      paymentMethod: formatPaymentMethodLabel(item.paymentMethod, item.paymentWalletType),
      notes: item.notes || '',
    });
  });

  cashDetails.forEach((item) => {
    const dateKey = toCalendarDateKey(item.date);
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
      network: item.customerAccountType || '',
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
    const dateKey = toCalendarDateKey(item.date);
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
    const dateKey = toCalendarDateKey(item.date);
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
    const dateKey = toCalendarDateKey(entry.date);
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
    } else if (entry.referenceModel === 'LoadTransaction') {
      title = entry.type === 'in' ? 'Load Sale Wallet Payment Received' : 'Load Sale Wallet Payment Sent';
    } else if (entry.referenceModel === 'CustomerLedger') {
      title = entry.type === 'in' ? 'Customer Wallet Receipt' : 'Customer Wallet Payment';
    } else if (entry.referenceModel === 'SupplierLedger') {
      title = entry.type === 'out' ? 'Supplier Wallet Payment' : 'Supplier Wallet Receipt';
    } else if (entry.referenceModel === 'WalletTransfer') {
      title = entry.type === 'in' ? 'Transfer from My Personal Account' : 'Transfer to My Personal Account';
      customerName = 'My Personal Account';
    } else if (entry.referenceModel === 'PaymentVoucher') {
      title = 'Payment Voucher';
    } else if (entry.referenceModel === 'ReceiptVoucher') {
      title = 'Receipt Voucher';
    } else if (entry.referenceModel === 'EmployeeLedger') {
      title = 'Employee Payment';
    } else if (entry.referenceModel === 'SalesmanCommissionPayment') {
      title = 'Commission Payment';
    } else if (entry.referenceModel === 'PartnerPayment') {
      title = 'Partner Share Payment';
    }

    ensureBucket(dateKey).push({
      id: String(entry._id),
      date: entry.date,
      createdAt: entry.createdAt,
      source: 'wallet_entry',
      referenceModel: entry.referenceModel || '',
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

  cashBookOnlyEntries.forEach((entry) => {
    const dateKey = toCalendarDateKey(entry.date);
    const impact = entry.type === 'income' ? Number(entry.amount || 0) : -Number(entry.amount || 0);
    let title = CASH_BOOK_SOURCE_TITLES[entry.source] || 'Cash Transaction';
    let accountNumber = '';
    let customerName = '';
    let notes = entry.description || entry.notes || '';

    if (entry.referenceModel === 'Invoice') {
      const inv = invoiceRefMap[String(entry.referenceId)];
      title = entry.type === 'income' ? 'Sale Payment Received' : 'Sale Refund Paid';
      accountNumber = inv?.invoiceNumber || '';
      customerName =
        inv?.customerName ||
        inv?.walkInCustomerName ||
        (inv?.customerId && customerMap[String(inv.customerId)] ? customerMap[String(inv.customerId)].name : '') ||
        '';
    } else if (entry.referenceModel === 'Purchase') {
      const pur = purchaseRefMap[String(entry.referenceId)];
      title = entry.type === 'expense' ? 'Purchase Payment Sent' : 'Purchase Refund Received';
      accountNumber = pur?.invoiceNumber || '';
      customerName = pur?.supplier?.name || '';
    } else if (entry.referenceModel === 'SupplierLedger') {
      title = entry.type === 'expense' ? 'Supplier Payment' : 'Supplier Refund';
    } else if (entry.referenceModel === 'CustomerLedger') {
      title = entry.type === 'income' ? 'Customer Receipt' : 'Customer Refund';
    }

    ensureBucket(dateKey).push({
      id: String(entry._id),
      date: entry.date,
      createdAt: entry.createdAt,
      source: 'cash_book',
      referenceModel: entry.referenceModel || '',
      transactionType: entry.type === 'income' ? 'cash_in' : 'cash_out',
      title,
      accountNumber,
      customerName,
      network: '',
      amount: Number(entry.amount || 0),
      walletImpact: impact,
      cashAmount: Number(entry.amount || 0),
      extraCharge: 0,
      profit: 0,
      paymentMethod: 'cash',
      notes,
    });
  });

  // ── 4. Build every calendar date in range (Pakistan timezone) ──
  const rows = [];
  eachBusinessCalendarDate(start, end).forEach((key) => {
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
      totalSold: ldTotalSold + ssTotalSimSaleLoad,
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
  });

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
