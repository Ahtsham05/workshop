const mongoose = require('mongoose');
const setupTestDB = require('../../utils/setupTestDB');
const {
  BillPayment,
  CashWithdrawal,
  Expense,
  Invoice,
  LoadTransaction,
  RepairJob,
  SimSale,
} = require('../../../src/models');
const { getMobileDashboardSummary } = require('../../../src/services/mobileDashboard.service');

/**
 * The mobile-shop dashboard sums its figures inside MongoDB. These totals used to be summed
 * in JS over hydrated documents, where Mongoose filled in schema defaults for fields a legacy
 * row never stored — the pipeline has to count those rows the same way, or old data silently
 * drops out of Cash in Hand / profit. Rows are inserted raw (bypassing Mongoose) to reproduce
 * exactly that legacy shape.
 */
setupTestDB();
jest.setTimeout(30000);

const ORG = new mongoose.Types.ObjectId();
const BRANCH = new mongoose.Types.ObjectId();

const insertRaw = (Model, docs) =>
  Model.collection.insertMany(docs.map((doc) => ({ organizationId: ORG, branchId: BRANCH, date: new Date(), ...doc })));

const getSummary = () => getMobileDashboardSummary({ organizationId: String(ORG), branchId: String(BRANCH) });

describe('getMobileDashboardSummary', () => {
  test('a load sale saved before paymentMethod existed counts as cash', async () => {
    await insertRaw(LoadTransaction, [
      { amount: 100, profit: 5, walletType: 'jazzcash' },
      { amount: 40, profit: 1, walletType: 'jazzcash', paymentMethod: 'wallet' },
    ]);

    const summary = await getSummary();

    expect(summary.totalLoadSold).toBe(140);
    expect(summary.totalLoadSoldProfit).toBe(6);
    expect(summary.cashInHand).toBe(100);
  });

  test('invoice cash counts only cash split legs, and cash sales with no stored method', async () => {
    await insertRaw(Invoice, [
      {
        invoiceNumber: 'INV-1',
        type: 'cash',
        status: 'paid',
        total: 300,
        totalProfit: 30,
        splitPayment: [
          { method: 'cash', amount: 120 },
          { method: 'card', amount: 180 },
        ],
      },
      { invoiceNumber: 'INV-2', type: 'cash', status: 'paid', total: 200, totalProfit: 20, paymentMethod: 'wallet' },
      { invoiceNumber: 'INV-3', type: 'cash', status: 'paid', total: 150, totalProfit: 15 },
      { invoiceNumber: 'INV-4', type: 'credit', status: 'pending', total: 500, totalProfit: 50, paidAmount: 100 },
      { invoiceNumber: 'INV-5', type: 'cash', status: 'cancelled', total: 999, totalProfit: 99 },
    ]);

    const summary = await getSummary();

    expect(summary.totalSales).toBe(1150);
    expect(summary.salesProfit).toBe(115);
    expect(summary.cashInHand).toBe(270);
  });

  test('SIM sale profit: missing commission is the schema default 0, an explicit null falls back to the margin', async () => {
    await insertRaw(SimSale, [
      { jobNumber: 'SIM-1', saleAmount: 500, purchaseAmount: 400 },
      { jobNumber: 'SIM-2', saleAmount: 500, purchaseAmount: 400, commission: null },
      { jobNumber: 'SIM-3', saleAmount: 300, purchaseAmount: 250, commission: 20, loadAmount: 50 },
    ]);

    const summary = await getSummary();

    expect(summary.totalSimSale).toBe(1300);
    expect(summary.totalSimSaleProfit).toBe(120);
    expect(summary.simSaleCount).toBe(3);
    expect(summary.totalLoadSold).toBe(50);
  });

  test('bill profit follows status and netBillProfit defaults; a bill with no stored method is cash', async () => {
    const dueDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    await insertRaw(BillPayment, [
      { createdAt: new Date(), dueDate, status: 'paid', totalReceived: 1000, serviceCharge: 50 },
      { createdAt: new Date(), dueDate, status: 'paid', totalReceived: 1000, serviceCharge: 50, latePaymentLoss: 10, netBillProfit: null },
      { createdAt: new Date(), dueDate, status: 'pending', totalReceived: 500, serviceCharge: 30 },
      { createdAt: new Date(), dueDate, totalReceived: 200, serviceCharge: 20, paymentMethod: 'wallet' },
    ]);

    const summary = await getSummary();

    expect(summary.totalBillCollection).toBe(2700);
    expect(summary.billPaymentProfit).toBe(90);
    expect(summary.billLatePaymentLoss).toBe(10);
    expect(summary.cashInHand).toBe(2500);
  });

  test('expenses: missing isPaid counts as paid, missing paymentMethod counts as cash', async () => {
    await insertRaw(Expense, [
      { expenseNumber: 'EXP-1', amount: 100 },
      { expenseNumber: 'EXP-2', amount: 50, isPaid: false, paymentMethod: 'bank' },
      { expenseNumber: 'EXP-3', amount: 25, paymentMethod: 'CASH' },
    ]);

    const summary = await getSummary();

    expect(summary.totalExpenses).toBe(175);
    expect(summary.totalPaidExpenses).toBe(125);
    expect(summary.totalPendingExpenses).toBe(50);
    expect(summary.cashInHand).toBe(-125);
  });

  test('a cash transaction with no stored type is a withdrawal (Received)', async () => {
    await insertRaw(CashWithdrawal, [
      { amount: 1000, profit: 10, transactionType: 'deposit' },
      { amount: 500, profit: 5 },
    ]);

    const summary = await getSummary();

    expect(summary.totalCashSend).toBe(1000);
    expect(summary.cashSendCount).toBe(1);
    expect(summary.totalCashReceived).toBe(500);
    expect(summary.totalCashReceivedProfit).toBe(5);
    expect(summary.cashReceivedCount).toBe(1);
  });

  test('repair profit only counts completed/delivered jobs; missing status is pending', async () => {
    await insertRaw(RepairJob, [
      { charges: 1000, cost: 300, status: 'completed' },
      { charges: 800, cost: 100 },
      { charges: 400, status: 'delivered', paymentMethod: 'wallet' },
    ]);

    const summary = await getSummary();

    expect(summary.totalRepairIncome).toBe(2200);
    expect(summary.totalRepairProfit).toBe(1100);
    expect(summary.cashInHand).toBe(1800);
  });
});
