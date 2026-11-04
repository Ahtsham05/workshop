const { FeePayment, FeeVoucher, SchoolClass, SchoolTransaction, Section, Student } = require('../models');
const mongoose = require('mongoose');
const {
  BUSINESS_TZ,
  parseBusinessDateBoundary,
  toBusinessCalendarDate,
  getBusinessDayRange,
} = require('../utils/businessTimezone');

/**
 * Fee position — the one place that answers "what does this school/class/student
 * owe, as at a given fee month?", so the dashboard, reports and portals can't
 * disagree. Every figure obeys the same two sums:
 *
 *   Total Expected = Previous Pending + This Month's Fee
 *   Total Pending  = Total Expected - Received
 *
 * "Previous" means any earlier fee month, including earlier years — arrears never
 * expire, so January still shows December's unpaid fees.
 *
 * Previous Pending (`previousDue`) splits into what is still unpaid today
 * (`previousPending`) and what was recovered during the selected month
 * (`previousReceived`). Counting the recovered part stops a late payment from
 * shrinking Expected: Rs 5,000 of old dues collected moves into Received rather
 * than vanishing. Balances are as of today (vouchers keep no balance history), so
 * for a past month `previousDue` leaves out dues recovered after that month.
 */

const MONTH_ORDER = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const VOUCHER_TYPE_LABELS = {
  monthly: 'Monthly Fee',
  admission: 'Admission Fee',
  exam: 'Exam Fee',
  misc: 'Other Fee',
};

const FINE_HEAD = 'Fine';
const PAYABLE_STATUSES = ['unpaid', 'partial', 'overdue'];
const VOUCHER_FIELDS =
  'studentId classId month year feeItems.name feeItems.amount discount fine netAmount paidAmount status voucherType';

const getTenantFilter = (scope = {}) => {
  const filter = {};
  if (scope.organizationId) filter.organizationId = scope.organizationId;
  if (scope.branchId) filter.branchId = scope.branchId;
  return filter;
};

const periodIndex = (month, year) => {
  const mi = MONTH_ORDER.indexOf(month);
  const y = Number(year);
  if (!Number.isFinite(y)) return 0;
  return y * 12 + (mi < 0 ? 0 : mi);
};

const effectiveNet = (v) => {
  if (v.netAmount && v.netAmount > 0) return v.netAmount;
  const t = (v.feeItems || []).reduce((s, fi) => s + (fi.amount || 0), 0);
  return Math.max(0, t - (v.discount || 0) + (v.fine || 0));
};

const outstandingOf = (v) => Math.max(0, effectiveNet(v) - (v.paidAmount || 0));
const toCents = (n) => Math.round((n || 0) * 100);
const round2 = (n) => Math.round((n || 0) * 100) / 100;

/**
 * Shares `amount` across `weights` so the parts always add back to `amount` exactly.
 * A whole amount stays in whole rupees, so a partial payment never shows as Rs 642.86.
 */
const splitByWeight = (amount, weights) => {
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  if (totalWeight <= 0 || amount <= 0) return weights.map(() => 0);
  const unit = toCents(amount) % 100 === 0 ? 100 : 1;
  const target = toCents(amount) / unit;
  const exact = weights.map((w) => (target * w) / totalWeight);
  const parts = exact.map(Math.floor);
  let left = target - parts.reduce((s, c) => s + c, 0);
  const byRemainder = exact.map((e, i) => ({ i, remainder: e - Math.floor(e) })).sort((x, y) => y.remainder - x.remainder);
  for (let k = 0; left > 0 && k < byRemainder.length; k += 1, left -= 1) {
    parts[byRemainder[k].i] += 1;
  }
  return parts.map((c) => (c * unit) / 100);
};

/**
 * Breaks a voucher's net amount into fee heads (Tuition, Paper Fund, Fine…) that add
 * up to the net exactly. A discount comes off the largest head first, so a tuition
 * concession doesn't eat into a small fund billed on the same voucher. Fee items with
 * the same name (any case) merge into one head.
 */
const voucherHeads = (v) => {
  const merged = new Map();
  (v.feeItems || []).forEach((item) => {
    const name = String(item.name || '').trim();
    if (!name || !(item.amount > 0)) return;
    const key = name.toLowerCase();
    const existing = merged.get(key);
    if (existing) existing.cents += toCents(item.amount);
    else merged.set(key, { name, cents: toCents(item.amount) });
  });
  const heads = [...merged.values()].sort((a, b) => b.cents - a.cents);
  const net = toCents(effectiveNet(v));
  const fine = Math.min(toCents(v.fine), net);

  // Whatever separates the items from the net (normally the discount) comes off the
  // largest heads first; a net higher than the items (edited voucher) lands on the first.
  let excess = heads.reduce((s, h) => s + h.cents, 0) - (net - fine);
  heads.forEach((h) => {
    const cut = Math.min(h.cents, Math.max(0, excess));
    h.cents -= cut;
    excess -= cut;
  });
  if (excess < 0 && heads.length) heads[0].cents -= excess;

  const result = heads.filter((h) => h.cents > 0).map((h) => ({ name: h.name, amount: h.cents / 100 }));
  if (!heads.length && net - fine > 0) {
    result.push({ name: VOUCHER_TYPE_LABELS[v.voucherType] || 'Other Fee', amount: (net - fine) / 100 });
  }
  if (fine > 0) result.push({ name: FINE_HEAD, amount: fine / 100 });
  return result;
};

/** A voucher's heads with `amount` (a payment or balance) shared across them by size. */
const shareAcrossHeads = (heads, amount) => {
  const shares = splitByWeight(
    amount,
    heads.map((h) => h.amount)
  );
  return heads.map((h, i) => ({ name: h.name, amount: shares[i] }));
};

/** A payment on a voucher as shares per fund. A missing or empty voucher still accounts for the money. */
const paidByHead = (v, amount) => {
  const heads = v ? voucherHeads(v) : [];
  if (!heads.length) return [{ name: VOUCHER_TYPE_LABELS[v?.voucherType] || 'Other Fee', amount }];
  return shareAcrossHeads(heads, amount);
};

/**
 * Adds fund shares into per-row buckets ({ 'Paper Fund': 2000 }), with one spelling per
 * fund across every row. `names()` gives the column order: largest first, Fine last.
 */
const createFundTally = () => {
  const totals = new Map();
  return {
    /** `countTowardTotal: false` fills the bucket under the shared spelling, leaving the fund's total alone. */
    add(bucket, shares, { countTowardTotal = true } = {}) {
      shares.forEach(({ name, amount }) => {
        const key = String(name).trim().toLowerCase();
        if (!totals.has(key)) totals.set(key, { name, amount: 0 });
        const entry = totals.get(key);
        if (countTowardTotal) entry.amount += amount;
        bucket[entry.name] = round2((bucket[entry.name] || 0) + amount);
      });
    },
    names() {
      return [...totals.values()]
        .sort((a, b) => {
          if (a.name === FINE_HEAD) return 1;
          if (b.name === FINE_HEAD) return -1;
          return b.amount - a.amount || a.name.localeCompare(b.name);
        })
        .map((entry) => entry.name);
    },
    totals() {
      return Object.fromEntries([...totals.values()].map((entry) => [entry.name, round2(entry.amount)]));
    },
  };
};

const emptyTotals = () => ({
  previousPending: 0,
  previousReceived: 0,
  currentFee: 0,
  currentReceived: 0,
  currentPending: 0,
  laterPending: 0,
});

const finishTotals = (t) => {
  const previousDue = t.previousPending + t.previousReceived;
  const totalExpected = previousDue + t.currentFee;
  const totalReceived = t.previousReceived + t.currentReceived;
  const totalPending = t.previousPending + t.currentPending;
  return {
    previousDue: round2(previousDue),
    previousPending: round2(t.previousPending),
    previousReceived: round2(t.previousReceived),
    currentFee: round2(t.currentFee),
    currentReceived: round2(t.currentReceived),
    currentPending: round2(t.currentPending),
    laterPending: round2(t.laterPending),
    totalExpected: round2(totalExpected),
    totalReceived: round2(totalReceived),
    totalPending: round2(totalPending),
    collectionRate: totalExpected > 0 ? Math.round((totalReceived / totalExpected) * 100) : 0,
  };
};

const headKey = (name) => String(name).trim().toLowerCase();

const addToHead = (headMap, name, field, amount) => {
  if (!amount) return;
  const key = headKey(name);
  if (!headMap.has(key)) headMap.set(key, { name, ...emptyTotals() });
  headMap.get(key)[field] += amount;
};

/** Heads as display rows: largest first, with Fine always last. */
const finishHeads = (headMap) =>
  [...headMap.values()]
    .map((h) => ({ name: h.name, ...finishTotals(h) }))
    .sort((a, b) => {
      if (a.name === FINE_HEAD) return 1;
      if (b.name === FINE_HEAD) return -1;
      return b.totalExpected - a.totalExpected || a.name.localeCompare(b.name);
    });

/** A voucher's heads with how much of each is paid and still owed. Adds up to net and paid exactly. */
const voucherHeadBalances = (v) => {
  const heads = voucherHeads(v);
  const paid = shareAcrossHeads(heads, Math.min(v.paidAmount || 0, effectiveNet(v)));
  return heads.map((h, i) => ({
    name: h.name,
    amount: h.amount,
    paid: paid[i].amount,
    pending: round2(h.amount - paid[i].amount),
  }));
};

/** Adds one voucher's position to `totals` (and `heads`), relative to period `selected`. */
const applyVoucher = (v, selected, totals, heads) => {
  const period = periodIndex(v.month, v.year);
  const count = v.count || 1;
  const net = effectiveNet(v);
  const paid = Math.min(v.paidAmount || 0, net);
  const outstanding = outstandingOf(v);
  const isPayable = PAYABLE_STATUSES.includes(v.status);

  if (period === selected) {
    totals.currentFee += net * count;
    totals.currentReceived += paid * count;
    totals.currentPending += (net - paid) * count;
    if (heads) {
      voucherHeadBalances(v).forEach((h) => {
        addToHead(heads, h.name, 'currentFee', h.amount * count);
        addToHead(heads, h.name, 'currentReceived', h.paid * count);
        addToHead(heads, h.name, 'currentPending', h.pending * count);
      });
    }
    return;
  }
  if (!isPayable || outstanding <= 0) return;

  const field = period < selected ? 'previousPending' : 'laterPending';
  totals[field] += outstanding * count;
  if (heads) voucherHeadBalances(v).forEach((h) => addToHead(heads, h.name, field, h.pending * count));
};

const toObjectIds = (ids) => ids.map((id) => new mongoose.Types.ObjectId(String(id)));

const getAggTenantFilter = (scope = {}) => {
  const filter = {};
  if (scope.organizationId) filter.organizationId = new mongoose.Types.ObjectId(String(scope.organizationId));
  if (scope.branchId) filter.branchId = new mongoose.Types.ObjectId(String(scope.branchId));
  return filter;
};

const yearMonthOf = (dateField) => ({
  $dateToString: { date: dateField, format: '%Y-%m', timezone: BUSINESS_TZ, onNull: null },
});

const yearMonthToPeriod = (text) => {
  const [y, m] = text.split('-').map(Number);
  return y * 12 + (m - 1);
};

/**
 * Vouchers that would calculate identically, counted by the database instead of sent one by
 * one. Reports add up thousands of vouchers, most of them the same fee with the same status,
 * so this replaces megabytes from the database with a few dozen rows; a report that pulled
 * every voucher over a slow link ran into the request time limit. Each row is a voucher plus
 * `count`, so totals must multiply by it. Not for per-student figures, which need each voucher.
 * `withPayments` also keeps each voucher's payments, as month and collection type.
 */
const loadVoucherGroups = async (match, { withPayments = false } = {}) => {
  const groupFields = {
    month: '$month',
    year: '$year',
    feeItems: '$items',
    discount: '$discount',
    fine: '$fine',
    netAmount: '$netAmount',
    paidAmount: '$paidAmount',
    status: '$status',
    voucherType: '$voucherType',
  };
  const pipeline = [
    { $match: match },
    {
      $addFields: {
        items: {
          $map: { input: { $ifNull: ['$feeItems', []] }, as: 'item', in: { name: '$$item.name', amount: '$$item.amount' } },
        },
      },
    },
  ];
  if (withPayments) {
    pipeline.push(
      {
        $lookup: {
          from: SchoolTransaction.collection.name,
          localField: '_id',
          foreignField: 'referenceId',
          pipeline: [
            { $match: { referenceModel: 'FeeVoucher', type: 'INCOME' } },
            { $sort: { date: 1 } },
            { $project: { _id: 0, amount: 1, method: '$paymentMethod', paidMonth: yearMonthOf('$date') } },
          ],
          as: 'txns',
        },
      },
      { $addFields: { paidMonth: yearMonthOf('$paidDate') } }
    );
    Object.assign(groupFields, { txns: '$txns', paidMonth: '$paidMonth', paymentMethod: '$paymentMethod' });
  }
  pipeline.push({ $group: { _id: groupFields, count: { $sum: 1 } } });
  const groups = await FeeVoucher.aggregate(pipeline);
  return groups.map((g) => ({ ...g._id, count: g.count }));
};

/** First and last instant of a fee month, in the business timezone. */
const monthBounds = (month, year) => {
  const mi = Math.max(0, MONTH_ORDER.indexOf(month));
  const pad = (n) => String(n).padStart(2, '0');
  const lastDay = new Date(Date.UTC(Number(year), mi + 1, 0)).getUTCDate();
  return {
    start: parseBusinessDateBoundary(`${year}-${pad(mi + 1)}-01`, false),
    end: parseBusinessDateBoundary(`${year}-${pad(mi + 1)}-${pad(lastDay)}`, true),
  };
};

/**
 * Students a class/section filter refers to. Filtering by the student's current class
 * rather than the voucher's keeps a promoted student's old dues on them: arrears billed
 * in Class 4 are chased while they sit in Class 5.
 */
const resolveStudentIds = async (scope, { classId, sectionId, studentIds }) => {
  if (studentIds) return studentIds;
  if (!classId && !sectionId) return undefined;
  const filter = { ...getTenantFilter(scope) };
  if (classId) filter.classId = classId;
  if (sectionId) filter.sectionId = sectionId;
  const students = await Student.find(filter).select('_id').lean();
  return students.map((s) => s._id);
};

/**
 * Receipts collected in [start, end] whose allocations settle an earlier fee month than
 * the month they were collected in. Returns one row per allocation, with the voucher.
 */
const loadLateAllocations = async (scope, studentIds, { start, end }) => {
  const filter = { ...getTenantFilter(scope), status: 'completed', paymentDate: { $gte: start, $lte: end } };
  if (studentIds) filter.studentId = { $in: studentIds };
  const receipts = await FeePayment.find(filter).select('studentId paymentDate allocations').lean();

  const rows = [];
  receipts.forEach((r) => {
    const [y, m] = toBusinessCalendarDate(r.paymentDate).split('-').map(Number);
    const paidPeriod = y * 12 + (m - 1);
    (r.allocations || []).forEach((a) => {
      if (a.amount > 0) rows.push({ studentId: r.studentId, voucherId: a.voucherId, amount: a.amount, paidPeriod });
    });
  });
  if (!rows.length) return [];

  const vouchers = await FeeVoucher.find({ _id: { $in: [...new Set(rows.map((r) => String(r.voucherId)))] } })
    .select(VOUCHER_FIELDS)
    .lean();
  const byId = new Map(vouchers.map((v) => [String(v._id), v]));
  return rows
    .map((r) => ({ ...r, voucher: byId.get(String(r.voucherId)) }))
    .filter((r) => r.voucher && r.voucher.status !== 'cancelled');
};

/**
 * Totals of receipts in [start, end] per collection month and fee month, worked out by the
 * database. For month-by-month figures that don't need to know which fund or student paid.
 */
const loadLateAllocationTotals = async (scope, studentIds, { start, end }) => {
  const rows = await FeePayment.aggregate([
    {
      $match: {
        ...getAggTenantFilter(scope),
        status: 'completed',
        paymentDate: { $gte: start, $lte: end },
        ...(studentIds ? { studentId: { $in: toObjectIds(studentIds) } } : {}),
      },
    },
    { $unwind: '$allocations' },
    { $match: { 'allocations.amount': { $gt: 0 } } },
    {
      $lookup: {
        from: FeeVoucher.collection.name,
        localField: 'allocations.voucherId',
        foreignField: '_id',
        pipeline: [{ $project: { month: 1, year: 1, status: 1 } }],
        as: 'voucher',
      },
    },
    { $unwind: '$voucher' },
    { $match: { 'voucher.status': { $ne: 'cancelled' } } },
    {
      $group: {
        _id: { paidMonth: yearMonthOf('$paymentDate'), month: '$voucher.month', year: '$voucher.year' },
        amount: { $sum: '$allocations.amount' },
      },
    },
  ]);
  return rows.map((r) => ({
    paidPeriod: yearMonthToPeriod(r._id.paidMonth),
    voucher: { month: r._id.month, year: r._id.year },
    amount: r.amount,
  }));
};

const studentLabel = (s) => (s ? `${s.firstName || ''} ${s.lastName || ''}`.trim() : 'Unknown student');

/**
 * Fee position for one fee month.
 * `detail`: 'summary' (default), 'classes' (adds class rows) or 'students' (adds student rows too).
 */
const getFeePosition = async (scope, { month, year, classId, sectionId, studentIds, detail = 'summary' } = {}) => {
  const y = Number(year);
  const selected = periodIndex(month, y);
  const resolvedIds = await resolveStudentIds(scope, { classId, sectionId, studentIds });
  const tenant = getTenantFilter(scope);
  const studentFilter = resolvedIds ? { studentId: { $in: resolvedIds } } : {};

  const voucherScope = { status: { $ne: 'cancelled' }, $or: [{ status: { $in: PAYABLE_STATUSES } }, { month, year: y }] };
  const [vouchers, lateAllocations, creditAgg] = await Promise.all([
    detail === 'summary'
      ? loadVoucherGroups({
          ...getAggTenantFilter(scope),
          ...(resolvedIds ? { studentId: { $in: toObjectIds(resolvedIds) } } : {}),
          ...voucherScope,
        })
      : FeeVoucher.find({ ...tenant, ...studentFilter, ...voucherScope })
          .select(VOUCHER_FIELDS)
          .lean(),
    loadLateAllocations(scope, resolvedIds, monthBounds(month, y)),
    Student.find({ ...tenant, ...(resolvedIds ? { _id: { $in: resolvedIds } } : {}), creditBalance: { $gt: 0 } })
      .select('creditBalance')
      .lean(),
  ]);

  const totals = emptyTotals();
  const heads = new Map();
  const byStudent = new Map();
  const studentEntry = (id) => {
    const key = String(id);
    if (!byStudent.has(key)) {
      byStudent.set(key, {
        studentId: key,
        heads: new Map(),
        previousMonths: new Set(),
        voucherClassId: null,
        ...emptyTotals(),
      });
    }
    return byStudent.get(key);
  };

  vouchers.forEach((v) => {
    applyVoucher(v, selected, totals, heads);
    if (detail === 'summary') return;
    const entry = studentEntry(v.studentId);
    applyVoucher(v, selected, entry, entry.heads);
    entry.voucherClassId = v.classId;
    if (periodIndex(v.month, v.year) < selected && outstandingOf(v) > 0) {
      entry.previousMonths.add(periodIndex(v.month, v.year));
    }
  });

  lateAllocations.forEach(({ voucher, amount, paidPeriod, studentId }) => {
    if (paidPeriod !== selected || periodIndex(voucher.month, voucher.year) >= selected) return;
    const shares = shareAcrossHeads(voucherHeads(voucher), amount);
    totals.previousReceived += amount;
    shares.forEach((h) => addToHead(heads, h.name, 'previousReceived', h.amount));
    if (detail === 'summary') return;
    const entry = studentEntry(studentId);
    entry.previousReceived += amount;
    shares.forEach((h) => addToHead(entry.heads, h.name, 'previousReceived', h.amount));
    if (!entry.voucherClassId) entry.voucherClassId = voucher.classId;
  });

  const result = {
    month,
    year: y,
    summary: {
      ...finishTotals(totals),
      advanceCredit: round2(creditAgg.reduce((s, c) => s + (c.creditBalance || 0), 0)),
    },
    heads: finishHeads(heads),
  };
  if (detail === 'summary') return result;

  const entries = [...byStudent.values()];
  const students = await Student.find({ ...tenant, _id: { $in: entries.map((e) => e.studentId) } })
    .select('firstName lastName admissionNumber rollNumber parent classId sectionId status creditBalance')
    .lean();
  const studentById = new Map(students.map((s) => [String(s._id), s]));
  const classIds = [
    ...new Set(entries.map((e) => String(studentById.get(e.studentId)?.classId || e.voucherClassId || ''))),
  ].filter(Boolean);
  const sectionIds = [...new Set(students.map((s) => String(s.sectionId || '')))].filter(Boolean);
  const [classDocs, sectionDocs] = await Promise.all([
    SchoolClass.find({ _id: { $in: classIds } })
      .select('name order')
      .lean(),
    Section.find({ _id: { $in: sectionIds } })
      .select('name')
      .lean(),
  ]);
  const classById = new Map(classDocs.map((c) => [String(c._id), c]));
  const sectionById = new Map(sectionDocs.map((s) => [String(s._id), s]));

  const studentRows = entries.map((e) => {
    const s = studentById.get(e.studentId);
    const cid = String(s?.classId || e.voucherClassId || '');
    const figures = finishTotals(e);
    let status = 'unpaid';
    if (figures.totalPending <= 0) status = 'paid';
    else if (figures.totalReceived > 0) status = 'partial';
    return {
      studentId: e.studentId,
      name: studentLabel(s),
      admissionNumber: s?.admissionNumber || '',
      rollNumber: s?.rollNumber || '',
      fatherName: s?.parent?.fatherName || '',
      phone: s?.parent?.phone || '',
      classId: cid,
      className: classById.get(cid)?.name || '',
      classOrder: classById.get(cid)?.order ?? 0,
      section: sectionById.get(String(s?.sectionId || ''))?.name || '',
      studentStatus: s?.status || '',
      status,
      advanceCredit: s?.creditBalance || 0,
      previousMonths: [...e.previousMonths].sort((a, b) => a - b).map((p) => `${MONTH_ORDER[p % 12]} ${Math.floor(p / 12)}`),
      // Only this month's fee per head: the table needs nothing else, and this is sent per student.
      heads: finishHeads(e.heads).map((h) => ({ name: h.name, currentFee: h.currentFee })),
      ...figures,
    };
  });
  studentRows.sort(
    (a, b) =>
      a.classOrder - b.classOrder ||
      a.className.localeCompare(b.className) ||
      String(a.rollNumber).localeCompare(String(b.rollNumber), undefined, { numeric: true }) ||
      a.name.localeCompare(b.name)
  );

  const classMap = new Map();
  studentRows.forEach((row) => {
    if (!classMap.has(row.classId)) {
      classMap.set(row.classId, {
        classId: row.classId,
        className: row.className || 'Unassigned',
        studentCount: 0,
        ...emptyTotals(),
      });
    }
    const c = classMap.get(row.classId);
    c.studentCount += 1;
    ['previousPending', 'previousReceived', 'currentFee', 'currentReceived', 'currentPending', 'laterPending'].forEach(
      (k) => {
        c[k] += row[k];
      }
    );
  });
  result.classes = [...classMap.values()].map((c) => ({
    classId: c.classId,
    className: c.className,
    studentCount: c.studentCount,
    ...finishTotals(c),
  }));
  if (detail === 'students') result.students = studentRows;
  return result;
};

/**
 * Twelve month rows for a year, each using the same sums as getFeePosition. `totals`
 * is the year as a whole: dues from before January, plus everything billed in the
 * year, less everything received. It isn't the sum of the rows: a fee unpaid in March
 * is "previous" in every later month, so adding the rows would count it repeatedly.
 */
const getFeePositionYear = async (scope, { year, classId, sectionId } = {}) => {
  const y = Number(year);
  const resolvedIds = await resolveStudentIds(scope, { classId, sectionId });
  const firstPeriod = periodIndex(MONTH_ORDER[0], y);

  const [vouchers, lateAllocations] = await Promise.all([
    loadVoucherGroups({
      ...getAggTenantFilter(scope),
      ...(resolvedIds ? { studentId: { $in: toObjectIds(resolvedIds) } } : {}),
      status: { $ne: 'cancelled' },
      $or: [{ year: y }, { status: { $in: PAYABLE_STATUSES } }],
    }),
    loadLateAllocationTotals(scope, resolvedIds, {
      start: monthBounds(MONTH_ORDER[0], y).start,
      end: monthBounds(MONTH_ORDER[11], y).end,
    }),
  ]);

  const rows = MONTH_ORDER.map((month) => {
    const selected = periodIndex(month, y);
    const t = emptyTotals();
    vouchers.forEach((v) => applyVoucher(v, selected, t));
    lateAllocations.forEach(({ voucher, amount, paidPeriod }) => {
      if (paidPeriod === selected && periodIndex(voucher.month, voucher.year) < selected) t.previousReceived += amount;
    });
    return { month, year: y, ...finishTotals(t) };
  });

  const yearTotals = emptyTotals();
  vouchers.forEach((v) => {
    const period = periodIndex(v.month, v.year);
    const net = effectiveNet(v) * v.count;
    if (period < firstPeriod) {
      yearTotals.previousPending += outstandingOf(v) * v.count;
    } else if (period <= firstPeriod + 11) {
      const paid = Math.min(v.paidAmount || 0, effectiveNet(v)) * v.count;
      yearTotals.currentFee += net;
      yearTotals.currentReceived += paid;
      yearTotals.currentPending += net - paid;
    } else if (PAYABLE_STATUSES.includes(v.status)) {
      yearTotals.laterPending += outstandingOf(v) * v.count;
    }
  });
  lateAllocations.forEach(({ voucher, amount }) => {
    if (periodIndex(voucher.month, voucher.year) < firstPeriod) yearTotals.previousReceived += amount;
  });

  return { year: y, rows, totals: finishTotals(yearTotals) };
};

const periodLabel = (period) => `${MONTH_ORDER[period % 12]} ${Math.floor(period / 12)}`;

/**
 * When a voucher's money arrived, per fund. Dated payment records come first, capped at
 * what the voucher shows as paid; anything without a record (seeded or older data) falls
 * on its paid date, or else its own fee month. Shares are worked out on the running total
 * so a fund's collections always add up to its share of the voucher's paid amount.
 */
const voucherCollections = (v) => {
  const heads = voucherHeads(v);
  let left = Math.min(v.paidAmount || 0, effectiveNet(v));
  const dated = [];
  (v.txns || []).forEach((t) => {
    const take = Math.min(left, t.amount || 0);
    if (take <= 0) return;
    dated.push({ period: yearMonthToPeriod(t.paidMonth), amount: take, method: t.method || 'other' });
    left -= take;
  });
  if (left > 0.004) {
    dated.push({
      period: v.paidMonth ? yearMonthToPeriod(v.paidMonth) : periodIndex(v.month, v.year),
      amount: left,
      method: v.paymentMethod || 'not_recorded',
    });
  }

  const weights = heads.map((h) => h.amount);
  let running = 0;
  let before = heads.map(() => 0);
  return dated.map((c) => {
    running += c.amount;
    const now = splitByWeight(running, weights);
    const shares = heads.map((h, i) => ({ name: h.name, amount: round2(now[i] - before[i]) }));
    before = now;
    return { ...c, shares };
  });
};

const addAmount = (bucket, key, amount) => {
  if (!amount) return;
  bucket[key] = round2((bucket[key] || 0) + amount);
};

/** Vouchers a year's fund figures depend on: that year's, older unpaid ones, and any other year's paid during or after it. */
const fundYearScope = (y) => ({
  status: { $ne: 'cancelled' },
  $or: [
    { year: y },
    { year: { $lt: y }, status: { $in: PAYABLE_STATUSES } },
    { year: { $ne: y }, paidAmount: { $gt: 0 }, paidDate: { $gte: monthBounds(MONTH_ORDER[0], y).start } },
  ],
});

const scaleShares = (shares, count) => shares.map((share) => ({ name: share.name, amount: share.amount * count }));

const sortedKeysByAmount = (bucket) => Object.keys(bucket).sort((a, b) => bucket[b] - bucket[a]);

/**
 * Funds report for a year: for each fund, what was billed, which month the money actually
 * arrived in and what is still owed. Months here are the month money was RECEIVED, unlike
 * the income report, which counts money under the fee month it belongs to.
 * `fund` adds the drill-down for one fund: by fee month, by class and by student.
 */
const getFundReport = async (scope, { year, classId, sectionId } = {}) => {
  const y = Number(year);
  const firstPeriod = periodIndex(MONTH_ORDER[0], y);
  const lastPeriod = periodIndex(MONTH_ORDER[11], y);
  const resolvedIds = await resolveStudentIds(scope, { classId, sectionId });

  const vouchers = await loadVoucherGroups(
    {
      ...getAggTenantFilter(scope),
      ...(resolvedIds ? { studentId: { $in: toObjectIds(resolvedIds) } } : {}),
      ...fundYearScope(y),
    },
    { withPayments: true }
  );

  const tally = createFundTally();
  const fundRows = new Map();
  const fundRow = (name) => {
    const key = headKey(name);
    if (!fundRows.has(key)) {
      fundRows.set(key, { name, beforeYear: 0, billed: 0, collected: 0, pending: 0, collectedByMonth: {}, methods: {} });
    }
    return fundRows.get(key);
  };
  const months = MONTH_ORDER.map((month) => ({
    month,
    year: y,
    billed: 0,
    stillPending: 0,
    forThisMonth: 0,
    forPreviousMonths: 0,
    forLaterMonths: 0,
    funds: {},
    methods: {},
    total: 0,
    byFund: {},
    paidFor: {},
    collectedIn: {},
  }));
  const methodTotals = {};

  vouchers.forEach((v) => {
    const period = periodIndex(v.month, v.year);
    const isThisYear = period >= firstPeriod && period <= lastPeriod;

    voucherHeadBalances(v).forEach((h) => {
      const row = fundRow(h.name);
      if (isThisYear) row.billed += h.amount * v.count;
      if (period <= lastPeriod) row.pending += h.pending * v.count;
      if (period < firstPeriod) row.beforeYear += h.pending * v.count;
    });
    if (isThisYear) {
      const monthRow = months[period - firstPeriod];
      monthRow.billed += effectiveNet(v) * v.count;
      monthRow.stillPending += outstandingOf(v) * v.count;
    }

    voucherCollections(v).forEach((c) => {
      const amount = c.amount * v.count;
      const shares = scaleShares(c.shares, v.count);
      // This fee month, from the other side: which months its money came in.
      if (isThisYear) {
        const feeMonth = months[period - firstPeriod];
        if (!feeMonth.collectedIn[c.period]) {
          feeMonth.collectedIn[c.period] = { period: c.period, label: periodLabel(c.period), funds: {}, total: 0 };
        }
        const received = feeMonth.collectedIn[c.period];
        shares.forEach((share) => addAmount(received.funds, share.name, share.amount));
        received.total = round2(received.total + amount);
      }
      if (c.period < firstPeriod || c.period > lastPeriod) return;
      const monthRow = months[c.period - firstPeriod];
      if (period === c.period) monthRow.forThisMonth += amount;
      else if (period < c.period) monthRow.forPreviousMonths += amount;
      else monthRow.forLaterMonths += amount;
      monthRow.total += amount;
      addAmount(monthRow.methods, c.method, amount);
      addAmount(methodTotals, c.method, amount);
      tally.add(monthRow.funds, shares);
      // For this month's fee or an older one, per fund, and which fee month a late payment settled.
      const timing = period === c.period ? 'current' : period < c.period ? 'previous' : 'later';
      if (timing !== 'current' && !monthRow.paidFor[period])
        monthRow.paidFor[period] = { period, label: periodLabel(period), timing, funds: {}, total: 0 };
      shares.forEach((share) => {
        if (!monthRow.byFund[share.name]) monthRow.byFund[share.name] = { current: 0, previous: 0, later: 0 };
        monthRow.byFund[share.name][timing] = round2(monthRow.byFund[share.name][timing] + share.amount);
        if (timing !== 'current') {
          addAmount(monthRow.paidFor[period].funds, share.name, share.amount);
          monthRow.paidFor[period].total = round2(monthRow.paidFor[period].total + share.amount);
        }
      });
      shares.forEach((share) => {
        const row = fundRow(share.name);
        row.collected += share.amount;
        addAmount(row.collectedByMonth, MONTH_ORDER[c.period - firstPeriod], share.amount);
        addAmount(row.methods, c.method, share.amount);
        if (period < firstPeriod) row.beforeYear += share.amount;
      });
    });
  });

  // Fund rows follow the column order; a fund with nothing collected yet still gets a row.
  const fundNames = [
    ...tally.names(),
    ...[...fundRows.values()].map((r) => r.name).filter((name) => !tally.names().some((n) => headKey(n) === headKey(name))),
  ];
  const funds = fundNames.map((name) => {
    const row = fundRow(name);
    const expected = row.beforeYear + row.billed;
    return {
      name: row.name,
      beforeYear: round2(row.beforeYear),
      billed: round2(row.billed),
      collected: round2(row.collected),
      pending: round2(row.pending),
      collectedByMonth: row.collectedByMonth,
      methods: row.methods,
      collectionRate: expected > 0 ? Math.round((row.collected / expected) * 100) : 0,
    };
  });
  const sum = (rows, field) => round2(rows.reduce((total, r) => total + (r[field] || 0), 0));

  return {
    year: y,
    fundNames,
    methodNames: sortedKeysByAmount(methodTotals),
    funds,
    months: months.map((m) => ({
      ...m,
      billed: round2(m.billed),
      stillPending: round2(m.stillPending),
      forThisMonth: round2(m.forThisMonth),
      forPreviousMonths: round2(m.forPreviousMonths),
      forLaterMonths: round2(m.forLaterMonths),
      total: round2(m.total),
      paidFor: Object.values(m.paidFor)
        .sort((a, b) => a.period - b.period)
        .map(({ period, ...row }) => row),
      collectedIn: Object.values(m.collectedIn)
        .sort((a, b) => a.period - b.period)
        .map(({ period, ...row }) => row),
    })),
    totals: {
      beforeYear: sum(funds, 'beforeYear'),
      billed: sum(funds, 'billed'),
      collected: sum(funds, 'collected'),
      pending: sum(funds, 'pending'),
      forThisMonth: sum(months, 'forThisMonth'),
      forPreviousMonths: sum(months, 'forPreviousMonths'),
      forLaterMonths: sum(months, 'forLaterMonths'),
      monthBilled: sum(months, 'billed'),
      monthStillPending: sum(months, 'stillPending'),
      collectedByMonth: Object.fromEntries(
        MONTH_ORDER.map((m) => [
          m,
          sum(
            funds.map((f) => ({ v: f.collectedByMonth[m] || 0 })),
            'v'
          ),
        ])
      ),
      funds: tally.totals(),
      methods: methodTotals,
    },
  };
};

/**
 * One fund in full: by fee month, by class and by student. Only that fund's vouchers are
 * loaded, one by one, because the per-student figures can't use voucher groups.
 */
const getFundDetail = async (scope, { year, classId, sectionId, fund } = {}) => {
  const y = Number(year);
  const tenant = getTenantFilter(scope);
  const wanted = headKey(fund);
  const resolvedIds = await resolveStudentIds(scope, { classId, sectionId });
  const namePattern = new RegExp(
    `^\\s*${String(fund)
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`,
    'i'
  );
  const scopeFilter = fundYearScope(y);

  const vouchers = await FeeVoucher.find({
    ...tenant,
    ...(resolvedIds ? { studentId: { $in: resolvedIds } } : {}),
    status: scopeFilter.status,
    $and: [
      { $or: scopeFilter.$or },
      // Vouchers with no items take their fund name from the voucher type; a fine is a head of its own.
      { $or: [{ 'feeItems.name': namePattern }, { feeItems: { $size: 0 } }, { fine: { $gt: 0 } }] },
    ],
  })
    .select(`${VOUCHER_FIELDS} paidDate paymentMethod`)
    .lean();
  const txns = await SchoolTransaction.find({
    ...tenant,
    referenceModel: 'FeeVoucher',
    type: 'INCOME',
    referenceId: { $in: vouchers.map((v) => v._id) },
  })
    .select('referenceId amount date paymentMethod')
    .sort({ date: 1 })
    .lean();
  const txnsByVoucher = new Map();
  txns.forEach((t) => {
    const key = String(t.referenceId);
    if (!txnsByVoucher.has(key)) txnsByVoucher.set(key, []);
    txnsByVoucher.get(key).push({
      amount: t.amount,
      method: t.paymentMethod,
      paidMonth: toBusinessCalendarDate(new Date(t.date)).slice(0, 7),
    });
  });

  const billingRows = new Map();
  const detailStudents = new Map();
  const collectionPeriods = new Set();
  const detailMethods = {};
  let fundName = null;

  vouchers.forEach((voucher) => {
    const v = {
      ...voucher,
      txns: txnsByVoucher.get(String(voucher._id)) || [],
      paidMonth: voucher.paidDate ? toBusinessCalendarDate(new Date(voucher.paidDate)).slice(0, 7) : null,
    };
    const head = voucherHeadBalances(v).find((h) => headKey(h.name) === wanted);
    if (!head) return;
    fundName = fundName || head.name;
    const period = periodIndex(v.month, v.year);
    const collections = voucherCollections(v);
    if (!billingRows.has(period)) {
      billingRows.set(period, {
        period,
        label: periodLabel(period),
        billed: 0,
        collected: 0,
        pending: 0,
        students: new Set(),
        collectedIn: {},
      });
    }
    const billing = billingRows.get(period);
    billing.billed += head.amount;
    billing.collected += head.paid;
    billing.pending += head.pending;
    billing.students.add(String(v.studentId));

    const sid = String(v.studentId);
    if (!detailStudents.has(sid)) {
      detailStudents.set(sid, {
        studentId: sid,
        billed: 0,
        collected: 0,
        pending: 0,
        collections: {},
        methods: {},
        feeMonths: new Set(),
        voucherClassId: v.classId,
      });
    }
    const student = detailStudents.get(sid);
    student.billed += head.amount;
    student.collected += head.paid;
    student.pending += head.pending;
    student.feeMonths.add(period);
    collections.forEach((c) => {
      const share = c.shares.find((x) => headKey(x.name) === wanted);
      if (!share || !share.amount) return;
      collectionPeriods.add(c.period);
      addAmount(billing.collectedIn, periodLabel(c.period), share.amount);
      addAmount(student.collections, c.period, share.amount);
      addAmount(student.methods, c.method, share.amount);
      addAmount(detailMethods, c.method, share.amount);
    });
  });
  const sum = (rows, field) => round2(rows.reduce((total, r) => total + (r[field] || 0), 0));

  const studentDocs = await Student.find({ ...tenant, _id: { $in: [...detailStudents.keys()] } })
    .select('firstName lastName admissionNumber rollNumber parent classId status')
    .lean();
  const studentById = new Map(studentDocs.map((s) => [String(s._id), s]));
  const classIds = [
    ...new Set(
      [...detailStudents.values()].map((e) => String(studentById.get(e.studentId)?.classId || e.voucherClassId || ''))
    ),
  ].filter(Boolean);
  const classDocs = await SchoolClass.find({ _id: { $in: classIds } })
    .select('name order')
    .lean();
  const classById = new Map(classDocs.map((c) => [String(c._id), c]));

  const students = [...detailStudents.values()]
    .map((e) => {
      const doc = studentById.get(e.studentId);
      const cid = String(doc?.classId || e.voucherClassId || '');
      return {
        studentId: e.studentId,
        name: studentLabel(doc),
        admissionNumber: doc?.admissionNumber || '',
        rollNumber: doc?.rollNumber || '',
        fatherName: doc?.parent?.fatherName || '',
        phone: doc?.parent?.phone || '',
        className: classById.get(cid)?.name || 'Unassigned',
        classOrder: classById.get(cid)?.order ?? 0,
        feeMonths: [...e.feeMonths].sort((a, b) => a - b).map(periodLabel),
        billed: round2(e.billed),
        collected: round2(e.collected),
        pending: round2(e.pending),
        // Number keys sort numerically, so these read oldest month first.
        collections: Object.fromEntries(
          Object.entries(e.collections).map(([period, amount]) => [periodLabel(Number(period)), amount])
        ),
        methods: e.methods,
      };
    })
    .sort(
      (a, b) =>
        a.classOrder - b.classOrder ||
        a.className.localeCompare(b.className) ||
        String(a.rollNumber).localeCompare(String(b.rollNumber), undefined, { numeric: true }) ||
        a.name.localeCompare(b.name)
    );

  const classRows = new Map();
  students.forEach((s) => {
    if (!classRows.has(s.className))
      classRows.set(s.className, { className: s.className, students: 0, billed: 0, collected: 0, pending: 0 });
    const row = classRows.get(s.className);
    row.students += 1;
    row.billed += s.billed;
    row.collected += s.collected;
    row.pending += s.pending;
  });

  return {
    fund: fundName || fund,
    methods: detailMethods,
    methodNames: sortedKeysByAmount(detailMethods),
    collectionMonths: [...collectionPeriods].sort((a, b) => a - b).map(periodLabel),
    byFeeMonth: [...billingRows.values()]
      .sort((a, b) => a.period - b.period)
      .map(({ period, students: ids, ...row }) => ({
        ...row,
        billed: round2(row.billed),
        collected: round2(row.collected),
        pending: round2(row.pending),
        students: ids.size,
      })),
    byClass: [...classRows.values()].map((row) => ({
      ...row,
      billed: round2(row.billed),
      collected: round2(row.collected),
      pending: round2(row.pending),
    })),
    students,
    totals: { billed: sum(students, 'billed'), collected: sum(students, 'collected'), pending: sum(students, 'pending') },
  };
};

/**
 * Year-by-year view of every fund across all years on record. Rows use the year money was
 * received, split into fees of that year and of other years; `pending` is what is unpaid
 * today on that year's fees.
 */
const getFundYears = async (scope, { classId, sectionId } = {}) => {
  const resolvedIds = await resolveStudentIds(scope, { classId, sectionId });
  const vouchers = await loadVoucherGroups(
    {
      ...getAggTenantFilter(scope),
      ...(resolvedIds ? { studentId: { $in: toObjectIds(resolvedIds) } } : {}),
      status: { $ne: 'cancelled' },
    },
    { withPayments: true }
  );

  const tally = createFundTally();
  const methodTotals = {};
  const yearRows = new Map();
  const yearRow = (year) => {
    if (!yearRows.has(year)) {
      yearRows.set(year, {
        year,
        billed: 0,
        pending: 0,
        forThisYear: 0,
        forPreviousYears: 0,
        forLaterYears: 0,
        total: 0,
        funds: {},
        methods: {},
      });
    }
    return yearRows.get(year);
  };
  const fundRows = new Map();
  const fundRow = (name) => {
    const key = headKey(name);
    if (!fundRows.has(key)) {
      fundRows.set(key, {
        name,
        billed: 0,
        collected: 0,
        pending: 0,
        billedByYear: {},
        collectedByYear: {},
        pendingByYear: {},
        methods: {},
      });
    }
    return fundRows.get(key);
  };

  vouchers.forEach((v) => {
    const feeYear = Number(v.year);
    const row = yearRow(feeYear);
    row.billed += effectiveNet(v) * v.count;
    row.pending += outstandingOf(v) * v.count;
    voucherHeadBalances(v).forEach((h) => {
      const fund = fundRow(h.name);
      fund.billed += h.amount * v.count;
      fund.pending += h.pending * v.count;
      addAmount(fund.billedByYear, feeYear, h.amount * v.count);
      addAmount(fund.pendingByYear, feeYear, h.pending * v.count);
    });
    voucherCollections(v).forEach((c) => {
      const paidYear = Math.floor(c.period / 12);
      const paidRow = yearRow(paidYear);
      const amount = c.amount * v.count;
      const shares = scaleShares(c.shares, v.count);
      if (paidYear === feeYear) paidRow.forThisYear += amount;
      else if (feeYear < paidYear) paidRow.forPreviousYears += amount;
      else paidRow.forLaterYears += amount;
      paidRow.total += amount;
      addAmount(paidRow.methods, c.method, amount);
      addAmount(methodTotals, c.method, amount);
      tally.add(paidRow.funds, shares);
      shares.forEach((share) => {
        const fund = fundRow(share.name);
        fund.collected += share.amount;
        addAmount(fund.collectedByYear, paidYear, share.amount);
        addAmount(fund.methods, c.method, share.amount);
      });
    });
  });

  const years = [...yearRows.values()]
    .sort((a, b) => a.year - b.year)
    .map((row) => ({
      ...row,
      billed: round2(row.billed),
      pending: round2(row.pending),
      forThisYear: round2(row.forThisYear),
      forPreviousYears: round2(row.forPreviousYears),
      forLaterYears: round2(row.forLaterYears),
      total: round2(row.total),
    }));
  const fundNames = [
    ...tally.names(),
    ...[...fundRows.values()].map((r) => r.name).filter((name) => !tally.names().some((n) => headKey(n) === headKey(name))),
  ];
  const sum = (field) => round2(years.reduce((total, r) => total + r[field], 0));
  return {
    years,
    fundNames,
    methodNames: sortedKeysByAmount(methodTotals),
    funds: fundNames.map((name) => {
      const fund = fundRow(name);
      return { ...fund, billed: round2(fund.billed), collected: round2(fund.collected), pending: round2(fund.pending) };
    }),
    totals: {
      billed: sum('billed'),
      pending: sum('pending'),
      forThisYear: sum('forThisYear'),
      forPreviousYears: sum('forPreviousYears'),
      forLaterYears: sum('forLaterYears'),
      collected: sum('total'),
      funds: tally.totals(),
      methods: methodTotals,
    },
  };
};

/**
 * Previous / this month / later split of one student's or many students' unpaid vouchers,
 * for callers that already hold the vouchers. Keyed by the month being viewed.
 */
const splitPending = (vouchers, month, year) => {
  const selected = periodIndex(month, year);
  const totals = emptyTotals();
  const heads = new Map();
  vouchers.forEach((v) => {
    if (!PAYABLE_STATUSES.includes(v.status) && periodIndex(v.month, v.year) !== selected) return;
    if (v.status === 'cancelled') return;
    applyVoucher(v, selected, totals, heads);
  });
  const figures = finishTotals(totals);
  return {
    previousPending: figures.previousPending,
    currentPending: figures.currentPending,
    laterPending: figures.laterPending,
    totalPending: round2(figures.totalPending + figures.laterPending),
    heads: finishHeads(heads),
  };
};

/** The fee month "today" belongs to, in the business timezone. */
const currentFeeMonth = (date = new Date()) => {
  const [y, m] = getBusinessDayRange(date).calendarDate.split('-').map(Number);
  return { month: MONTH_ORDER[m - 1], year: y };
};

module.exports = {
  MONTH_ORDER,
  getFeePosition,
  getFeePositionYear,
  getFundReport,
  getFundDetail,
  getFundYears,
  loadVoucherGroups,
  scaleShares,
  getAggTenantFilter,
  splitPending,
  currentFeeMonth,
  voucherHeads,
  paidByHead,
  voucherHeadBalances,
  createFundTally,
  VOUCHER_FIELDS,
  periodIndex,
  effectiveNet,
  resolveStudentIds,
  PAYABLE_STATUSES,
};
