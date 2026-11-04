const mongoose = require('mongoose');
const setupTestDB = require('../utils/setupTestDB');
const { FeePayment, FeeVoucher, SchoolClass, SchoolTransaction, Student } = require('../../src/models');
const position = require('../../src/services/feePosition.service');
const { getDashboardStats } = require('../../src/services/schoolDashboard.service');
const {
  getCategoryWiseReport,
  getDailyCollection,
  getMonthlyIncomeExpense,
  getReceivableSummary,
  getVouchersByStatus,
  getProfitAndLoss,
} = require('../../src/services/schoolReports.service');
const collection = require('../../src/services/feeCollectionReport.service');
const { getAccountingDashboard } = require('../../src/services/schoolAccounting.service');
const { getStudentFeeSummary } = require('../../src/services/feeVoucher.service');
const { checkStudentPendingFees } = require('../../src/services/student.service');

// Starting the in-memory database can pass Jest's 5s hook limit on a busy machine.
jest.setTimeout(30000);

setupTestDB();

const id = () => new mongoose.Types.ObjectId();
const organizationId = id();
const branchId = id();
const scope = { organizationId, branchId };
const classFour = id();
const classFive = id();
const ali = id();
const sara = id();
const zain = id();
const noon = (y, m, d) => new Date(Date.UTC(y, m, d, 7));

// organizationId + expenseNumber is unique, and raw inserts skip the hook that fills the number.
const paymentRow = (fields) => ({ organizationId, branchId, type: 'INCOME', expenseNumber: String(id()), ...fields });

// Raw inserts: amounts below are exactly what the assertions expect, and the model's
// save hooks would otherwise recompute status from the real clock.
const voucher = (studentId, classId, month, year, items, extra = {}) => {
  const total = items.reduce((s, i) => s + i.amount, 0);
  return {
    _id: id(),
    organizationId,
    branchId,
    studentId,
    classId,
    month,
    year,
    feeItems: items,
    totalAmount: total,
    discount: 0,
    fine: 0,
    netAmount: total - (extra.discount || 0) + (extra.fine || 0),
    paidAmount: 0,
    status: 'unpaid',
    voucherType: 'monthly',
    dueDate: noon(year, position.MONTH_ORDER.indexOf(month), 10),
    ...extra,
  };
};

const tuition = (amount) => ({ name: 'Tuition Fee', amount });
const paper = (amount) => ({ name: 'Paper Fund', amount });

const seed = async () => {
  await SchoolClass.collection.insertMany([
    { _id: classFour, organizationId, branchId, name: 'Class 4', order: 4 },
    { _id: classFive, organizationId, branchId, name: 'Class 5', order: 5 },
  ]);
  await Student.collection.insertMany([
    {
      _id: ali,
      organizationId,
      branchId,
      firstName: 'Ali',
      lastName: 'Khan',
      admissionNumber: 'A1',
      rollNumber: '1',
      classId: classFive,
      status: 'active',
      creditBalance: 500,
      parent: { fatherName: 'Imran' },
    },
    {
      _id: sara,
      organizationId,
      branchId,
      firstName: 'Sara',
      admissionNumber: 'A2',
      rollNumber: '2',
      classId: classFive,
      status: 'active',
    },
    {
      _id: zain,
      organizationId,
      branchId,
      firstName: 'Zain',
      admissionNumber: 'A3',
      rollNumber: '1',
      classId: classFour,
      status: 'active',
    },
  ]);
};

describe('voucherHeads', () => {
  test('adds up to the net, takes the discount off the largest head, keeps fine separate', () => {
    const heads = position.voucherHeads({
      feeItems: [paper(500), tuition(3000)],
      discount: 1000,
      fine: 200,
      netAmount: 2700,
    });
    expect(heads).toEqual([
      { name: 'Tuition Fee', amount: 2000 },
      { name: 'Paper Fund', amount: 500 },
      { name: 'Fine', amount: 200 },
    ]);
  });

  test('merges the same head whatever its case, and falls back to the voucher type', () => {
    expect(position.voucherHeads({ feeItems: [paper(100), { name: ' paper fund ', amount: 50 }], netAmount: 150 })).toEqual([
      { name: 'Paper Fund', amount: 150 },
    ]);
    expect(position.voucherHeads({ feeItems: [], netAmount: 900, voucherType: 'exam' })).toEqual([
      { name: 'Exam Fee', amount: 900 },
    ]);
  });

  test('uses items when a stale voucher has netAmount 0', () => {
    expect(position.voucherHeads({ feeItems: [tuition(1000)], discount: 100, netAmount: 0 })).toEqual([
      { name: 'Tuition Fee', amount: 900 },
    ]);
  });

  test('a fully discounted voucher has no heads', () => {
    expect(position.voucherHeads({ feeItems: [tuition(1000)], discount: 1000, netAmount: 0 })).toEqual([]);
  });
});

describe('getFeePosition', () => {
  beforeEach(seed);

  const seedScenario = async () => {
    const [aliOct] = [
      voucher(ali, classFive, 'October', 2026, [tuition(3000), paper(1000)], { status: 'partial', paidAmount: 1000 }),
    ];
    await FeeVoucher.collection.insertMany([
      aliOct,
      // last year's dues must not be forgotten
      voucher(sara, classFive, 'December', 2025, [tuition(2000)]),
      voucher(ali, classFive, 'November', 2026, [tuition(3000)]),
      voucher(ali, classFive, 'November', 2026, [paper(500)], { feeStructureId: id(), periodKey: '2026' }),
      voucher(sara, classFive, 'November', 2026, [tuition(3000)], { status: 'paid', paidAmount: 3000 }),
      // Later than the selected month: neither previous nor this month
      voucher(sara, classFive, 'December', 2026, [tuition(3000)]),
      // Never counted anywhere
      voucher(zain, classFour, 'October', 2026, [tuition(9999)], { status: 'cancelled' }),
      // A different branch never leaks in
      voucher(zain, classFour, 'October', 2026, [tuition(7777)], { branchId: id() }),
    ]);
    // Collected in November: 1,000 of October's dues
    await FeePayment.collection.insertOne({
      _id: id(),
      organizationId,
      branchId,
      studentId: ali,
      paymentDate: noon(2026, 10, 5),
      totalAmount: 1000,
      status: 'completed',
      allocations: [{ voucherId: aliOct._id, month: 'October', year: 2026, amount: 1000 }],
    });
  };

  test('summary obeys the two sums and counts arrears from earlier years', async () => {
    await seedScenario();
    const { summary } = await position.getFeePosition(scope, { month: 'November', year: 2026 });
    expect(summary).toEqual({
      previousDue: 6000, // Ali Oct 3,000 left + 1,000 recovered + Sara Dec-2025 2,000
      previousPending: 5000,
      previousReceived: 1000,
      currentFee: 6500,
      currentReceived: 3000,
      currentPending: 3500,
      laterPending: 3000,
      totalExpected: 12500,
      totalReceived: 4000,
      totalPending: 8500,
      collectionRate: 32,
      advanceCredit: 500,
    });
    expect(summary.totalExpected - summary.totalReceived).toBe(summary.totalPending);
  });

  test('a late payment moves into Received without changing Expected', async () => {
    await seedScenario();
    const before = await position.getFeePosition(scope, { month: 'November', year: 2026 });
    const oct = await FeeVoucher.findOne({ studentId: ali, month: 'October' }).lean();
    await FeeVoucher.collection.updateOne({ _id: oct._id }, { $set: { paidAmount: 2000 } });
    await FeePayment.collection.insertOne({
      _id: id(),
      organizationId,
      branchId,
      studentId: ali,
      paymentDate: noon(2026, 10, 6),
      totalAmount: 1000,
      status: 'completed',
      allocations: [{ voucherId: oct._id, month: 'October', year: 2026, amount: 1000 }],
    });
    const after = await position.getFeePosition(scope, { month: 'November', year: 2026 });
    expect(after.summary.totalExpected).toBe(before.summary.totalExpected);
    expect(after.summary.totalReceived).toBe(before.summary.totalReceived + 1000);
    expect(after.summary.totalPending).toBe(before.summary.totalPending - 1000);
  });

  test('a cancelled receipt does not count as received', async () => {
    await seedScenario();
    await FeePayment.collection.updateMany({ organizationId }, { $set: { status: 'cancelled' } });
    const { summary } = await position.getFeePosition(scope, { month: 'November', year: 2026 });
    expect(summary.previousReceived).toBe(0);
  });

  test('January shows December of the year before as previous', async () => {
    await seedScenario();
    const { summary } = await position.getFeePosition(scope, { month: 'January', year: 2027 });
    // Ali Oct 3,000 + Nov 3,500 + Sara Dec-25 2,000 + Dec-26 3,000
    expect(summary.previousPending).toBe(11500);
    expect(summary.currentFee).toBe(0);
  });

  test('heads keep Paper Fund separate and add up to the summary', async () => {
    await seedScenario();
    const { summary, heads } = await position.getFeePosition(scope, { month: 'November', year: 2026 });
    const paperHead = heads.find((h) => h.name === 'Paper Fund');
    expect(paperHead.currentFee).toBe(500);
    // Ali's October voucher owes 3,000 of 4,000: a quarter of it is Paper Fund
    expect(paperHead.previousPending).toBe(750);
    expect(paperHead.previousReceived).toBe(250);
    expect(paperHead.totalPending).toBe(1250);
    ['previousPending', 'previousReceived', 'currentFee', 'currentReceived', 'totalExpected', 'totalPending'].forEach(
      (field) => {
        expect(heads.reduce((s, h) => s + h[field], 0)).toBeCloseTo(summary[field], 2);
      }
    );
  });

  test('a partial payment splits into whole rupees across fee types', async () => {
    await FeeVoucher.collection.insertOne(
      voucher(ali, classFive, 'November', 2026, [tuition(3500), { name: 'Computer Lab', amount: 500 }], {
        status: 'partial',
        paidAmount: 1000,
      })
    );
    const { heads } = await position.getFeePosition(scope, { month: 'November', year: 2026 });
    expect(heads.map((h) => h.currentReceived)).toEqual([875, 125]);
    await FeeVoucher.collection.updateOne({ studentId: ali }, { $set: { paidAmount: 1001 } });
    const after = await position.getFeePosition(scope, { month: 'November', year: 2026 });
    expect(after.heads.map((h) => h.currentReceived)).toEqual([876, 125]);
    expect(after.summary.currentReceived).toBe(1001);
  });

  test('student rows carry one line per student including those with only old dues', async () => {
    await seedScenario();
    const { students, classes, summary } = await position.getFeePosition(scope, {
      month: 'November',
      year: 2026,
      detail: 'students',
    });
    const aliRow = students.find((s) => s.name === 'Ali Khan');
    expect(aliRow).toMatchObject({
      previousPending: 3000,
      previousReceived: 1000,
      currentFee: 3500,
      totalPending: 6500,
      previousMonths: ['October 2026'],
      fatherName: 'Imran',
      className: 'Class 5',
    });
    const saraRow = students.find((s) => s.name === 'Sara');
    expect(saraRow.previousMonths).toEqual(['December 2025']);
    expect(classes.reduce((s, c) => s + c.totalPending, 0)).toBe(summary.totalPending);
  });

  test('a student with a voucher only for the month does not show empty previous months', async () => {
    await seedScenario();
    const { students } = await position.getFeePosition(scope, { month: 'October', year: 2026, detail: 'students' });
    expect(students.find((s) => s.name === 'Ali Khan').previousMonths).toEqual([]);
  });

  test('class filter follows the student, so a promoted student keeps old dues', async () => {
    await FeeVoucher.collection.insertMany([
      voucher(ali, classFour, 'March', 2026, [tuition(1500)]), // billed while in Class 4, now in Class 5
      voucher(zain, classFour, 'March', 2026, [tuition(1000)]),
    ]);
    const five = await position.getFeePosition(scope, { month: 'November', year: 2026, classId: classFive });
    const four = await position.getFeePosition(scope, { month: 'November', year: 2026, classId: classFour });
    expect(five.summary.previousPending).toBe(1500);
    expect(four.summary.previousPending).toBe(1000);
  });

  test('payment time zone: 00:30 PKT on 1 Dec belongs to December', async () => {
    const oct = voucher(ali, classFive, 'October', 2026, [tuition(1000)], { status: 'partial', paidAmount: 400 });
    await FeeVoucher.collection.insertOne(oct);
    await FeePayment.collection.insertOne({
      _id: id(),
      organizationId,
      branchId,
      studentId: ali,
      paymentDate: new Date(Date.UTC(2026, 10, 30, 19, 30)),
      totalAmount: 400,
      status: 'completed',
      allocations: [{ voucherId: oct._id, month: 'October', year: 2026, amount: 400 }],
    });
    const nov = await position.getFeePosition(scope, { month: 'November', year: 2026 });
    const dec = await position.getFeePosition(scope, { month: 'December', year: 2026 });
    expect(nov.summary.previousReceived).toBe(0);
    expect(dec.summary.previousReceived).toBe(400);
  });

  test('empty school gives zeros, not NaN', async () => {
    const { summary, heads } = await position.getFeePosition(scope, { month: 'November', year: 2026 });
    expect(summary.totalExpected).toBe(0);
    expect(summary.collectionRate).toBe(0);
    expect(heads).toEqual([]);
  });
});

describe('getFeePositionYear', () => {
  beforeEach(seed);

  test('rows match the single-month figures and totals do not double count', async () => {
    const jan = voucher(ali, classFive, 'January', 2026, [tuition(1000)], { status: 'partial', paidAmount: 400 });
    await FeeVoucher.collection.insertMany([
      jan,
      voucher(ali, classFive, 'December', 2025, [tuition(700)]),
      voucher(ali, classFive, 'February', 2026, [tuition(1000)]),
    ]);
    await FeePayment.collection.insertOne({
      _id: id(),
      organizationId,
      branchId,
      studentId: ali,
      paymentDate: noon(2026, 2, 5), // Jan's fee collected in March
      totalAmount: 400,
      status: 'completed',
      allocations: [{ voucherId: jan._id, month: 'January', year: 2026, amount: 400 }],
    });

    const { rows, totals } = await position.getFeePositionYear(scope, { year: 2026 });
    for (const month of ['January', 'February', 'March']) {
      const single = await position.getFeePosition(scope, { month, year: 2026 });
      const { month: _m, year: _y, ...row } = rows.find((r) => r.month === month);
      const { advanceCredit, ...summary } = single.summary;
      expect(row).toEqual(summary);
    }
    expect(totals).toMatchObject({
      previousPending: 700,
      currentFee: 2000,
      currentReceived: 400,
      totalExpected: 2700,
      totalReceived: 400,
      totalPending: 2300,
    });
  });
});

describe('figures on other screens', () => {
  beforeEach(seed);

  const seedPending = () =>
    FeeVoucher.collection.insertMany([
      voucher(ali, classFive, 'October', 2026, [tuition(1000)]),
      voucher(ali, classFive, 'November', 2026, [tuition(1000), paper(200)]),
      voucher(sara, classFive, 'November', 2026, [tuition(1000)], { status: 'cancelled' }),
    ]);

  test('school dashboard Pending Fees is real money, split previous / this month', async () => {
    jest.useFakeTimers({
      now: noon(2026, 10, 15),
      doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'hrtime', 'performance', 'queueMicrotask'],
    });
    try {
      await seedPending();
      const { pendingFees } = await getDashboardStats(scope);
      expect(pendingFees).toMatchObject({ count: 2, amount: 2200, previous: 1000, current: 1200, later: 0 });
    } finally {
      jest.useRealTimers();
    }
  });

  test('accounting dashboard carries the position and splits its top students', async () => {
    await seedPending();
    const dashboard = await getAccountingDashboard(scope, 'November', 2026);
    expect(dashboard.feePosition.summary).toMatchObject({ previousPending: 1000, currentFee: 1200, totalPending: 2200 });
    expect(dashboard.feePosition.heads.map((h) => h.name)).toEqual(['Tuition Fee', 'Paper Fund']);
    expect(dashboard.topPendingStudents[0]).toMatchObject({
      totalPending: 2200,
      previousPending: 1000,
      currentPending: 1200,
    });
  });

  test('receivable summary keeps last year in arrears and later months out of it', async () => {
    await seedPending();
    await FeeVoucher.collection.insertMany([
      voucher(sara, classFive, 'December', 2025, [tuition(300)]),
      voucher(sara, classFive, 'December', 2026, [tuition(5000)]),
    ]);
    const r = await getReceivableSummary(scope, 2026, 'November');
    expect(r).toMatchObject({
      previousArrears: 1300,
      arrearsVouchers: 2,
      thisMonthReceivable: 1200,
      totalReceivable: 2500,
      laterPending: 5000,
    });
  });

  test('voucher report names the fee type and counts each student once for previous dues', async () => {
    await seedPending();
    await FeeVoucher.collection.insertOne(
      voucher(ali, classFive, 'November', 2026, [paper(400)], { feeStructureId: id(), periodKey: 'x' })
    );
    const { data, summary } = await getVouchersByStatus(scope, null, 2026, 'November');
    const rows = data.filter((v) => String(v.studentId) === String(ali));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.feeType).sort()).toEqual(['Paper Fund', 'Tuition Fee, Paper Fund']);
    expect(rows.reduce((s, r) => s + r.previousPending, 0)).toBe(1000);
    expect(summary).toMatchObject({
      totalVouchers: 2,
      totalAmount: 1600,
      previousPending: 1000,
      totalPendingWithPrevious: 2600,
    });
  });

  test('profit and loss adds previous and total pending per month', async () => {
    await seedPending();
    const { data, summary } = await getProfitAndLoss(scope, 2026);
    const nov = data.find((m) => m.month === 'November');
    expect(nov).toMatchObject({ feePreviousPending: 1000, feeExpected: 1200, feeTotalPending: 2200 });
    expect(summary.feeTotalPending).toBe(2200);
  });

  test('student summary splits pending for the month asked about', async () => {
    await seedPending();
    const s = await getStudentFeeSummary(ali, scope, { month: 'November', year: 2026 });
    expect(s).toMatchObject({ totalPending: 2200, previousPending: 1000, currentPending: 1200, laterPending: 0 });
    expect(s.pendingHeads.map((h) => h.name)).toEqual(['Tuition Fee', 'Paper Fund']);
  });

  test('promotion check splits pending too', async () => {
    jest.useFakeTimers({
      now: noon(2026, 10, 15),
      doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'hrtime', 'performance', 'queueMicrotask'],
    });
    try {
      await seedPending();
      const map = await checkStudentPendingFees([ali], scope);
      expect(map[String(ali)]).toMatchObject({
        pendingAmount: 2200,
        pendingCount: 2,
        previousPending: 1000,
        currentPending: 1200,
      });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('income split by fund', () => {
  beforeEach(seed);

  const paidOn = noon(2026, 8, 5);

  // September: a monthly fee, a Paper Fund voucher, and a voucher carrying both
  const seedSeptember = async () => {
    const fee = voucher(ali, classFive, 'September', 2026, [tuition(3000)], {
      status: 'paid',
      paidAmount: 3000,
      paidDate: paidOn,
    });
    const fund = voucher(ali, classFive, 'September', 2026, [paper(2000)], {
      status: 'paid',
      paidAmount: 2000,
      paidDate: paidOn,
      feeStructureId: id(),
      periodKey: '2026',
    });
    const both = voucher(sara, classFive, 'September', 2026, [tuition(3000), paper(1000)], {
      status: 'partial',
      paidAmount: 2000,
      paidDate: paidOn,
    });
    await FeeVoucher.collection.insertMany([fee, fund, both]);
    const categoryId = id();
    await SchoolTransaction.collection.insertMany(
      [
        { referenceId: fee._id, amount: 3000 },
        { referenceId: fund._id, amount: 2000 },
        { referenceId: both._id, amount: 2000 },
      ].map((t) => paymentRow({ ...t, categoryId, date: paidOn, referenceModel: 'FeeVoucher' }))
    );
    await FeeVoucher.collection.updateMany({ organizationId }, { $set: { transactionId: id() } });
    await SchoolTransaction.collection.insertOne(paymentRow({ categoryId: id(), amount: 700, date: paidOn }));
    await FeePayment.collection.insertOne({
      _id: id(),
      organizationId,
      branchId,
      studentId: ali,
      receiptNumber: 'REC-1',
      paymentDate: paidOn,
      totalAmount: 5000,
      status: 'completed',
      allocations: [
        { voucherId: fee._id, month: 'September', year: 2026, amount: 3000 },
        { voucherId: fund._id, month: 'September', year: 2026, amount: 2000 },
      ],
    });
  };

  test('monthly income shows Paper Fund apart from tuition and still adds up', async () => {
    await seedSeptember();
    const { data, summary, fundNames } = await getMonthlyIncomeExpense(scope, 2026);
    const sep = data.find((m) => m.month === 'September');
    // Sara's 2,000 on 3,000 + 1,000 is 1,500 tuition and 500 Paper Fund
    expect(sep.funds).toEqual({ 'Tuition Fee': 4500, 'Paper Fund': 2500 });
    expect(fundNames).toEqual(['Tuition Fee', 'Paper Fund']);
    expect(sep.feeCollected).toBe(7000);
    expect(Object.values(sep.funds).reduce((a, b) => a + b, 0) + sep.otherIncome).toBe(sep.income);
    expect(summary.funds).toEqual({ 'Tuition Fee': 4500, 'Paper Fund': 2500 });
  });

  test('monthly income shows what is still pending per fund and in total', async () => {
    await seedSeptember();
    await FeeVoucher.collection.insertMany([
      voucher(zain, classFour, 'October', 2026, [{ name: 'Sports Fund', amount: 300 }]),
      voucher(zain, classFour, 'October', 2026, [paper(100)], { status: 'cancelled', feeStructureId: id(), periodKey: 'c' }),
    ]);
    const { data, summary, fundNames } = await getMonthlyIncomeExpense(scope, 2026);
    const sep = data.find((m) => m.month === 'September');
    // Sara still owes 2,000 of 3,000 + 1,000
    expect(sep.pendingFunds).toEqual({ 'Tuition Fee': 1500, 'Paper Fund': 500 });
    expect(sep.feePending).toBe(2000);
    expect(data.find((m) => m.month === 'October').pendingFunds).toEqual({ 'Sports Fund': 300 });
    expect(summary.feePending).toBe(2300);
    expect(summary.pendingFunds).toEqual({ 'Tuition Fee': 1500, 'Paper Fund': 500, 'Sports Fund': 300 });
    // A fund nothing has been collected for yet still gets its column
    expect(fundNames).toContain('Sports Fund');
    // Income itself is untouched by what is pending
    expect(summary.income).toBe(7700);
  });

  test('monthly income carries unpaid fees from earlier years as the opening balance', async () => {
    await FeeVoucher.collection.insertMany([
      voucher(ali, classFive, 'December', 2025, [tuition(700), paper(300)]),
      voucher(sara, classFive, 'March', 2024, [paper(200)], { status: 'partial', paidAmount: 50 }),
      voucher(zain, classFour, 'June', 2025, [tuition(9999)], { status: 'cancelled' }),
      voucher(zain, classFour, 'July', 2025, [tuition(5000)], { status: 'paid', paidAmount: 5000 }),
    ]);
    const { summary, fundNames } = await getMonthlyIncomeExpense(scope, 2026);
    expect(summary.openingPending).toBe(1150);
    expect(summary.openingPendingFunds).toEqual({ 'Tuition Fee': 700, 'Paper Fund': 450 });
    expect(fundNames).toEqual(expect.arrayContaining(['Tuition Fee', 'Paper Fund']));
    // Older dues are not this year's income or this year's pending
    expect(summary.income).toBe(0);
    expect(summary.feePending).toBe(0);
  });

  test('daily collection splits the same way', async () => {
    await seedSeptember();
    const { data, summary } = await getDailyCollection(scope, 2026, 'September');
    const day = data.find((d) => d.day === 5);
    expect(day.funds).toEqual({ 'Tuition Fee': 4500, 'Paper Fund': 2500 });
    expect(day.amount).toBe(7700);
    expect(summary.otherIncome).toBe(700);
  });

  test('profit and loss carries the fund columns', async () => {
    await seedSeptember();
    const { data, fundNames } = await getProfitAndLoss(scope, 2026);
    expect(fundNames).toContain('Paper Fund');
    expect(data.find((m) => m.month === 'September').funds['Paper Fund']).toBe(2500);
  });

  test('category report files fee money by fund, not under the default category', async () => {
    await seedSeptember();
    const { summary, data } = await getCategoryWiseReport(scope, '2026-09-01', '2026-09-30');
    const income = data.income || data;
    const byName = Object.fromEntries(income.map((c) => [c.name, c.total]));
    expect(byName['Tuition Fee']).toBe(4500);
    expect(byName['Paper Fund']).toBe(2500);
    expect(summary.totalIncome).toBe(7700);
  });

  test('collection reports split by fund and totals still match', async () => {
    await seedSeptember();
    const filters = { startDate: '2026-09-01', endDate: '2026-09-30' };
    const monthly = await collection.getMonthlyCollectionReport(scope, filters);
    expect(monthly.rows[0].funds).toEqual({ 'Tuition Fee': 3000, 'Paper Fund': 2000 });
    expect(monthly.totals.totalCollected).toBe(5000);
    const daily = await collection.getDailyCollectionReport(scope, filters);
    expect(daily.days[0].funds).toEqual({ 'Tuition Fee': 3000, 'Paper Fund': 2000 });
    const yearly = await collection.getYearlyCollectionReport(scope, { year: 2026 });
    expect(yearly.rows.find((r) => r.month === 'September').funds['Paper Fund']).toBe(2000);
    expect(yearly.fundNames).toContain('Paper Fund');
    const dash = await collection.getDashboardSummary(scope, filters);
    expect(dash.collectionFunds).toEqual({ 'Tuition Fee': 3000, 'Paper Fund': 2000 });
  });
});

describe('funds report', () => {
  beforeEach(seed);

  const txn = (v, date, amount) =>
    paymentRow({ categoryId: id(), amount, date, referenceId: v._id, referenceModel: 'FeeVoucher' });

  // Paper Fund billed in September: Ali pays 600 in Sep and 400 in Oct, Sara pays nothing.
  const seedPaperFund = async () => {
    const aliPaper = voucher(ali, classFive, 'September', 2026, [paper(1000)], {
      status: 'paid',
      paidAmount: 1000,
      feeStructureId: id(),
      periodKey: '2026',
    });
    const saraPaper = voucher(sara, classFive, 'September', 2026, [paper(1000)], {
      feeStructureId: id(),
      periodKey: '2026',
    });
    const aliSep = voucher(ali, classFive, 'September', 2026, [tuition(3000)], { status: 'paid', paidAmount: 3000 });
    const aliOct = voucher(ali, classFive, 'October', 2026, [tuition(3000)], { status: 'partial', paidAmount: 1000 });
    const oldDues = voucher(zain, classFour, 'December', 2025, [tuition(500)]);
    // Older data with a paid amount but no payment record
    const legacy = voucher(zain, classFour, 'August', 2026, [tuition(800)], {
      status: 'paid',
      paidAmount: 800,
      paidDate: noon(2026, 7, 20),
    });
    const gone = voucher(zain, classFour, 'September', 2026, [paper(9999)], {
      status: 'cancelled',
      feeStructureId: id(),
      periodKey: 'x',
    });
    await FeeVoucher.collection.insertMany([aliPaper, saraPaper, aliSep, aliOct, oldDues, legacy, gone]);
    await SchoolTransaction.collection.insertMany([
      txn(aliPaper, noon(2026, 8, 5), 600),
      txn(aliPaper, noon(2026, 9, 5), 400),
      txn(aliSep, noon(2026, 9, 6), 3000), // September's tuition, paid in October
      txn(aliOct, noon(2026, 9, 6), 1000),
    ]);
  };

  test('each fund shows billed, the month money arrived and what is pending', async () => {
    await seedPaperFund();
    const { funds, fundNames } = await position.getFundReport(scope, { year: 2026 });
    expect(fundNames).toEqual(expect.arrayContaining(['Paper Fund', 'Tuition Fee']));
    expect(funds.find((f) => f.name === 'Paper Fund')).toEqual({
      name: 'Paper Fund',
      beforeYear: 0,
      billed: 2000,
      collected: 1000,
      pending: 1000,
      collectedByMonth: { September: 600, October: 400 },
      methods: { other: 1000 },
      collectionRate: 50,
    });
    expect(funds.find((f) => f.name === 'Tuition Fee')).toMatchObject({
      beforeYear: 500,
      billed: 6800,
      collected: 4800,
      pending: 2500,
      collectedByMonth: { August: 800, October: 4000 },
    });
  });

  test('each month separates fees for that month from earlier months and adds up', async () => {
    await seedPaperFund();
    const { months, totals } = await position.getFundReport(scope, { year: 2026 });
    const oct = months.find((m) => m.month === 'October');
    expect(oct).toMatchObject({
      forThisMonth: 1000,
      forPreviousMonths: 3400,
      total: 4400,
      billed: 3000,
      stillPending: 2000,
    });
    expect(oct.funds).toEqual({ 'Tuition Fee': 4000, 'Paper Fund': 400 });
    expect(months.find((m) => m.month === 'September')).toMatchObject({
      forThisMonth: 600,
      forPreviousMonths: 0,
      total: 600,
    });
    months.forEach((m) => {
      expect(m.forThisMonth + m.forPreviousMonths + m.forLaterMonths).toBeCloseTo(m.total, 2);
      expect(Object.values(m.funds).reduce((a, b) => a + b, 0)).toBeCloseTo(m.total, 2);
    });
    expect(totals.collected).toBe(5800);
    expect(totals.forThisMonth + totals.forPreviousMonths).toBe(5800);
  });

  test('late payments show the month received, the fund and the fee month they settled', async () => {
    await seedPaperFund();
    const { months } = await position.getFundReport(scope, { year: 2026 });
    const oct = months.find((m) => m.month === 'October');
    expect(oct.byFund).toEqual({
      'Tuition Fee': { current: 1000, previous: 3000, later: 0 },
      'Paper Fund': { current: 0, previous: 400, later: 0 },
    });
    // 3,000 of September's tuition and 400 of its Paper Fund, both received in October
    expect(oct.paidFor).toEqual([
      { label: 'September 2026', timing: 'previous', funds: { 'Tuition Fee': 3000, 'Paper Fund': 400 }, total: 3400 },
    ]);
    const sep = months.find((m) => m.month === 'September');
    expect(sep.byFund).toEqual({ 'Paper Fund': { current: 600, previous: 0, later: 0 } });
    expect(sep.paidFor).toEqual([]);
    // The same money from September's side: which months its fees came in
    expect(sep.collectedIn).toEqual([
      { label: 'September 2026', funds: { 'Paper Fund': 600 }, total: 600 },
      { label: 'October 2026', funds: { 'Tuition Fee': 3000, 'Paper Fund': 400 }, total: 3400 },
    ]);
  });

  test('a voucher carrying several funds shares each payment across them', async () => {
    const both = voucher(ali, classFive, 'September', 2026, [tuition(3000), paper(1000)], {
      status: 'paid',
      paidAmount: 4000,
    });
    await FeeVoucher.collection.insertOne(both);
    await SchoolTransaction.collection.insertMany([txn(both, noon(2026, 8, 5), 1000), txn(both, noon(2026, 9, 5), 3000)]);
    const { funds } = await position.getFundReport(scope, { year: 2026 });
    expect(funds.find((f) => f.name === 'Paper Fund').collectedByMonth).toEqual({ September: 250, October: 750 });
    expect(funds.find((f) => f.name === 'Tuition Fee').collectedByMonth).toEqual({ September: 750, October: 2250 });
  });

  test('fund detail lists the fee month, collection months and each student', async () => {
    await seedPaperFund();
    const detail = await position.getFundDetail(scope, { year: 2026, fund: 'paper fund' });
    expect(detail.fund).toBe('Paper Fund');
    expect(detail.collectionMonths).toEqual(['September 2026', 'October 2026']);
    expect(detail.byFeeMonth).toEqual([
      {
        label: 'September 2026',
        billed: 2000,
        collected: 1000,
        pending: 1000,
        students: 2,
        collectedIn: { 'September 2026': 600, 'October 2026': 400 },
      },
    ]);
    expect(detail.totals).toEqual({ billed: 2000, collected: 1000, pending: 1000 });
    const saraRow = detail.students.find((s) => s.name === 'Sara');
    expect(saraRow).toMatchObject({ billed: 1000, collected: 0, pending: 1000, collections: {} });
    expect(detail.students.find((s) => s.name === 'Ali Khan').collections).toEqual({
      'September 2026': 600,
      'October 2026': 400,
    });
    expect(detail.byClass).toEqual([{ className: 'Class 5', students: 2, billed: 2000, collected: 1000, pending: 1000 }]);
  });

  test('collection type splits by payment method, per month, per fund and per student', async () => {
    const both = voucher(ali, classFive, 'September', 2026, [tuition(3000), paper(1000)], {
      status: 'paid',
      paidAmount: 4000,
    });
    const legacy = voucher(sara, classFive, 'September', 2026, [paper(500)], {
      status: 'paid',
      paidAmount: 500,
      paidDate: noon(2026, 8, 9),
      paymentMethod: 'cheque',
      feeStructureId: id(),
      periodKey: 'x',
    });
    await FeeVoucher.collection.insertMany([both, legacy]);
    await SchoolTransaction.collection.insertMany([
      { ...txn(both, noon(2026, 8, 5), 1000), paymentMethod: 'cash' },
      { ...txn(both, noon(2026, 9, 5), 3000), paymentMethod: 'bank_transfer' },
    ]);
    const { months, funds, methodNames, totals } = await position.getFundReport(scope, { year: 2026 });
    const detail = await position.getFundDetail(scope, { year: 2026, fund: 'Paper Fund' });
    expect(methodNames).toEqual(['bank_transfer', 'cash', 'cheque']);
    expect(months.find((m) => m.month === 'September').methods).toEqual({ cash: 1000, cheque: 500 });
    expect(months.find((m) => m.month === 'October').methods).toEqual({ bank_transfer: 3000 });
    expect(funds.find((f) => f.name === 'Paper Fund').methods).toEqual({ cash: 250, bank_transfer: 750, cheque: 500 });
    expect(totals.methods).toEqual({ cash: 1000, bank_transfer: 3000, cheque: 500 });
    expect(detail.methods).toEqual({ cash: 250, bank_transfer: 750, cheque: 500 });
    const aliRow = detail.students.find((s) => s.name === 'Ali Khan');
    expect(aliRow.methods).toEqual({ cash: 250, bank_transfer: 750 });
    expect(Object.keys(aliRow.collections)).toEqual(['September 2026', 'October 2026']);
  });

  test('year-wise view separates fees of that year from older dues, and adds up', async () => {
    const old = voucher(ali, classFive, 'December', 2025, [tuition(1000)], { status: 'paid', paidAmount: 1000 });
    const paperOld = voucher(sara, classFive, 'March', 2025, [paper(400)]);
    const current = voucher(ali, classFive, 'January', 2026, [tuition(2000), paper(500)], {
      status: 'partial',
      paidAmount: 1000,
    });
    const cancelled = voucher(sara, classFive, 'January', 2026, [paper(9999)], {
      status: 'cancelled',
      feeStructureId: id(),
      periodKey: 'c',
    });
    await FeeVoucher.collection.insertMany([old, paperOld, current, cancelled]);
    await SchoolTransaction.collection.insertMany([
      { ...txn(old, noon(2026, 0, 5), 1000), paymentMethod: 'cash' }, // 2025 fee paid in 2026
      { ...txn(current, noon(2026, 0, 6), 1000), paymentMethod: 'online' },
    ]);
    const report = await position.getFundYears(scope, {});
    const y25 = report.years.find((r) => r.year === 2025);
    const y26 = report.years.find((r) => r.year === 2026);
    expect(y25).toMatchObject({ billed: 1400, pending: 400, total: 0 });
    expect(y26).toMatchObject({ billed: 2500, pending: 1500, forThisYear: 1000, forPreviousYears: 1000, total: 2000 });
    expect(y26.methods).toEqual({ cash: 1000, online: 1000 });
    expect(y26.funds).toEqual({ 'Tuition Fee': 1800, 'Paper Fund': 200 });
    const paperRow = report.funds.find((f) => f.name === 'Paper Fund');
    expect(paperRow).toMatchObject({ billed: 900, collected: 200, pending: 700 });
    expect(paperRow.pendingByYear).toEqual({ 2025: 400, 2026: 300 });
    expect(report.totals).toMatchObject({ billed: 3900, collected: 2000, pending: 1900 });
    expect(report.totals.billed - report.totals.collected).toBe(report.totals.pending);
  });

  test('class filter limits the report', async () => {
    await seedPaperFund();
    const { funds } = await position.getFundReport(scope, { year: 2026, classId: classFour });
    expect(funds.map((f) => f.name)).toEqual(['Tuition Fee']);
    expect(funds[0]).toMatchObject({ beforeYear: 500, billed: 800, collected: 800, pending: 500 });
  });

  test('empty school gives an empty report', async () => {
    const report = await position.getFundReport(scope, { year: 2026 });
    expect(report.funds).toEqual([]);
    expect(report.totals.collected).toBe(0);
    const detail = await position.getFundDetail(scope, { year: 2026, fund: 'Paper Fund' });
    expect(detail.students).toEqual([]);
  });
});

describe('heavy reports stay light on the database', () => {
  beforeEach(seed);

  // Many students on the same fee, plus a few that differ, spread over months.
  const seedLargeSchool = async () => {
    const students = Array.from({ length: 200 }, (_, i) => ({
      _id: id(),
      organizationId,
      branchId,
      firstName: `Student ${i}`,
      admissionNumber: `L${i}`,
      classId: classFive,
      status: 'active',
    }));
    await Student.collection.insertMany(students);
    const vouchers = [];
    const txns = [];
    students.forEach((student, i) => {
      ['September', 'October', 'November'].forEach((month, m) => {
        const items = i % 10 === 0 ? [tuition(3000), paper(500)] : [tuition(3000)];
        const net = items.reduce((sum, item) => sum + item.amount, 0);
        const paid = m === 0 ? net : i % 4 === 0 ? 1000 : 0;
        const v = voucher(student._id, classFive, month, 2026, items, {
          paidAmount: paid,
          status: paid >= net ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
          paidDate: paid ? noon(2026, 8 + m, 5) : undefined,
          paymentMethod: paid ? 'cash' : '',
        });
        vouchers.push(v);
        if (paid) {
          txns.push(
            paymentRow({
              amount: paid,
              date: noon(2026, 8 + m, 5),
              referenceId: v._id,
              referenceModel: 'FeeVoucher',
              paymentMethod: 'cash',
            })
          );
        }
      });
    });
    await FeeVoucher.collection.insertMany(vouchers);
    await SchoolTransaction.collection.insertMany(txns);
    return vouchers;
  };

  test('grouped figures match adding up every voucher one by one', async () => {
    const vouchers = await seedLargeSchool();
    const groups = await position.loadVoucherGroups({ organizationId, branchId });
    expect(groups.length).toBeLessThan(vouchers.length / 10);
    expect(groups.reduce((sum, g) => sum + g.count, 0)).toBe(vouchers.length);

    const { summary } = await position.getFeePosition(scope, { month: 'November', year: 2026 });
    const { students, summary: perVoucher } = await position.getFeePosition(scope, {
      month: 'November',
      year: 2026,
      detail: 'students',
    });
    expect(summary).toEqual(perVoucher);
    expect(students.reduce((sum, s) => sum + s.totalPending, 0)).toBe(summary.totalPending);

    const report = await position.getFundReport(scope, { year: 2026 });
    const billedByHand = vouchers.reduce((sum, v) => sum + v.netAmount, 0);
    const paidByHand = vouchers.reduce((sum, v) => sum + v.paidAmount, 0);
    expect(report.totals.billed).toBe(billedByHand);
    expect(report.totals.collected).toBe(paidByHand);
    expect(report.totals.pending).toBe(billedByHand - paidByHand);

    const detail = await position.getFundDetail(scope, { year: 2026, fund: 'Paper Fund' });
    const paperRow = report.funds.find((f) => f.name === 'Paper Fund');
    expect(detail.totals.billed).toBe(paperRow.billed);
    expect(detail.totals.collected).toBe(paperRow.collected);

    const years = await position.getFundYears(scope, {});
    expect(years.totals.collected).toBe(paidByHand);
  });

  test('a fund detail skips vouchers that do not carry the fund, even with a fine', async () => {
    await FeeVoucher.collection.insertMany([
      voucher(ali, classFive, 'September', 2026, [tuition(1000)], { fine: 100, netAmount: 1100 }),
      voucher(sara, classFive, 'September', 2026, [paper(500)], { feeStructureId: id(), periodKey: 'p' }),
    ]);
    const paperDetail = await position.getFundDetail(scope, { year: 2026, fund: 'Paper Fund' });
    expect(paperDetail.students.map((s) => s.name)).toEqual(['Sara']);
    const fineDetail = await position.getFundDetail(scope, { year: 2026, fund: 'Fine' });
    expect(fineDetail.totals.billed).toBe(100);
  });
});
