const mongoose = require('mongoose');
const setupTestDB = require('../../utils/setupTestDB');
const { Wallet, Customer, CustomerLedger, CustomerPayment, WalletEntry, CashBookEntry, PaymentVoucher } = require('../../../src/models');
const cashBookService = require('../../../src/services/cashBook.service');
const customerPaymentService = require('../../../src/services/customerPayment.service');
const service = require('../../../src/services/paymentVoucher.service');

/**
 * Payment Voucher "Customer" lines — cash handed to a customer (refund of their advance, or money
 * paid out on account). Pinned against a real in-memory MongoDB: the customer ledger, bank and
 * Cash Book move together, the customer's advance credit is used up (and given back exactly on
 * edit / delete), and nothing is left half-posted.
 */
setupTestDB();
jest.setTimeout(60000);

const ORG = new mongoose.Types.ObjectId();
const BRANCH = new mongoose.Types.ObjectId();
const USER = new mongoose.Types.ObjectId();
const EDITOR = new mongoose.Types.ObjectId();
const scope = { organizationId: ORG, branchId: BRANCH };
const user = { id: USER, name: 'Tester' };

const makeWallet = (type, balance, accountType = 'bank') => Wallet.create({ ...scope, type, accountType, balance });
const balanceOf = async (wallet) => (await Wallet.findById(wallet._id)).balance;
const customerBalance = async (customer) => (await Customer.findById(customer._id)).balance;
const creditOf = (customer) => customerPaymentService.getCustomerCreditBalance({ ...scope, customer: customer._id });
const tillBalance = async () => (await cashBookService.getCashInHandSummary(scope)).closingBalance;

const create = (bank, lines) => service.createVoucher({ ...scope, bankAccountId: bank._id, lines }, USER, { user });
const edit = (voucher, lines) =>
  service.updateVoucher(voucher._id, scope, { bankAccountId: voucher.bankAccountId, lines }, EDITOR, { user });

/** A customer who paid `advance` into HBL with no invoice to settle — held as credit. */
const seedCustomer = async ({ advance = 0 } = {}) => {
  await makeWallet('Cash in Hand', 0, 'cash');
  const hbl = await makeWallet('HBL', 10000);
  const ali = await Customer.create({ ...scope, name: 'Ali Khan' });
  if (advance > 0) {
    await customerPaymentService.createPayment(
      { ...scope, customer: ali._id, amount: advance, paymentMethod: 'wallet', walletType: 'HBL' },
      user
    );
  }
  return { hbl, ali };
};

describe('paymentVoucher.service — customer lines', () => {
  test('paying a customer debits their ledger (Payment Made), takes the money out of the bank, settles nothing', async () => {
    const { hbl, ali } = await seedCustomer();

    const voucher = await create(hbl, [{ payeeType: 'customer', customerId: ali._id, amount: 1500, description: 'Loan' }]);

    const [line] = voucher.lines;
    expect(line.payeeName).toBe('Ali Khan');
    expect(line.customerName).toBe('Ali Khan');
    expect(line.customerLedgerEntryId).toBeDefined();
    expect(line.creditDraws).toBeUndefined();

    const entry = await CustomerLedger.findById(line.customerLedgerEntryId);
    expect(entry.transactionType).toBe('payment_made');
    expect(entry.debit).toBe(1500);
    expect(entry.credit).toBe(0);
    expect(entry.reference).toBe(voucher.voucherNumber);
    expect(entry.paymentMethod).toBe('Wallet (HBL)');

    expect(await customerBalance(ali)).toBe(1500); // they now owe us
    expect(await balanceOf(hbl)).toBe(8500);
    // Exactly one bank movement — the ledger owns it, the voucher must not post a second one.
    expect(await WalletEntry.countDocuments({ ...scope, type: 'out' })).toBe(1);
    expect(await WalletEntry.countDocuments({ referenceModel: 'PaymentVoucher' })).toBe(0);
  });

  test('a refund uses up the advance credit the customer was holding', async () => {
    const { hbl, ali } = await seedCustomer({ advance: 3000 });
    expect(await creditOf(ali)).toBe(3000);
    expect(await customerBalance(ali)).toBe(-3000);

    const voucher = await create(hbl, [{ payeeType: 'customer', customerId: ali._id, amount: 2000 }]);

    expect(await creditOf(ali)).toBe(1000);
    expect(await customerBalance(ali)).toBe(-1000);
    const [line] = voucher.lines;
    expect(line.creditDraws).toHaveLength(1);
    expect(line.creditDraws[0].amount).toBe(2000);
    const source = await CustomerPayment.findById(line.creditDraws[0].paymentId);
    expect(source.history.some((h) => h.action === 'refunded' && h.amount === 2000)).toBe(true);
  });

  test('paying more than the advance uses all of it and leaves the rest as a receivable', async () => {
    const { hbl, ali } = await seedCustomer({ advance: 1000 });

    await create(hbl, [{ payeeType: 'customer', customerId: ali._id, amount: 2500 }]);

    expect(await creditOf(ali)).toBe(0);
    expect(await customerBalance(ali)).toBe(1500);
  });

  test('deleting the voucher gives the money, the ledger row and the exact advance back', async () => {
    const { hbl, ali } = await seedCustomer({ advance: 3000 });
    const voucher = await create(hbl, [{ payeeType: 'customer', customerId: ali._id, amount: 2000 }]);

    await service.deleteVoucherById(voucher._id, scope);

    expect(await PaymentVoucher.countDocuments()).toBe(0);
    expect(await CustomerLedger.countDocuments({ transactionType: 'payment_made' })).toBe(0);
    expect(await creditOf(ali)).toBe(3000);
    expect(await customerBalance(ali)).toBe(-3000);
    expect(await balanceOf(hbl)).toBe(13000); // 10,000 + the 3,000 advance still held
  });

  test('editing the amount re-posts the line and re-draws the advance by the new amount only', async () => {
    const { hbl, ali } = await seedCustomer({ advance: 3000 });
    const voucher = await create(hbl, [{ payeeType: 'customer', customerId: ali._id, amount: 2000 }]);
    const [line] = voucher.lines;

    const updated = await edit(voucher, [{ id: String(line._id), payeeType: 'customer', customerId: String(ali._id), amount: 500 }]);

    expect(updated.lines[0].amount).toBe(500);
    expect(await creditOf(ali)).toBe(2500);
    expect(await customerBalance(ali)).toBe(-2500);
    expect(await balanceOf(hbl)).toBe(12500);
    expect(await CustomerLedger.countDocuments({ transactionType: 'payment_made' })).toBe(1);
  });

  test('a wording-only edit keeps the same ledger row and does not touch the advance', async () => {
    const { hbl, ali } = await seedCustomer({ advance: 3000 });
    const voucher = await create(hbl, [{ payeeType: 'customer', customerId: ali._id, amount: 2000 }]);
    const [line] = voucher.lines;

    const updated = await edit(voucher, [
      { id: String(line._id), payeeType: 'customer', customerId: String(ali._id), amount: 2000, description: 'Advance returned' },
    ]);

    expect(String(updated.lines[0].customerLedgerEntryId)).toBe(String(line.customerLedgerEntryId));
    expect(updated.lines[0].creditDraws).toHaveLength(1);
    expect((await CustomerLedger.findById(line.customerLedgerEntryId)).description).toMatch(/Advance returned/);
    expect(await creditOf(ali)).toBe(1000);
    expect(await balanceOf(hbl)).toBe(11000);
  });

  test('switching a customer line to an expense reverses the customer side completely', async () => {
    const { hbl, ali } = await seedCustomer({ advance: 3000 });
    const voucher = await create(hbl, [{ payeeType: 'customer', customerId: ali._id, amount: 2000 }]);
    const [line] = voucher.lines;

    await edit(voucher, [{ id: String(line._id), payeeType: 'expense', category: 'Rent', amount: 2000 }]);

    expect(await CustomerLedger.countDocuments({ transactionType: 'payment_made' })).toBe(0);
    expect(await creditOf(ali)).toBe(3000);
    expect(await customerBalance(ali)).toBe(-3000);
    expect(await balanceOf(hbl)).toBe(11000);
  });

  test('paid out of Cash in Hand: shows in the Cash Book once and comes out of the till', async () => {
    await makeWallet('HBL', 0);
    const cash = await makeWallet('Cash in Hand', 0, 'cash');
    await cashBookService.setOpeningBalance(scope, 5000);
    const ali = await Customer.create({ ...scope, name: 'Ali Khan' });

    await create(cash, [{ payeeType: 'customer', customerId: ali._id, amount: 1200 }]);

    expect(await tillBalance()).toBe(3800);
    const rows = await CashBookEntry.find({ ...scope, type: 'expense' }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(1200);
    expect(rows[0].paymentMethod).toBe('cash');
  });

  test('an unaffordable customer payout is refused before anything is written', async () => {
    await makeWallet('Cash in Hand', 0, 'cash');
    const hbl = await makeWallet('HBL', 100);
    const ali = await Customer.create({ ...scope, name: 'Ali Khan' });

    await expect(create(hbl, [{ payeeType: 'customer', customerId: ali._id, amount: 500 }])).rejects.toThrow(/insufficient/i);

    expect(await PaymentVoucher.countDocuments()).toBe(0);
    expect(await CustomerLedger.countDocuments()).toBe(0);
    expect(await balanceOf(hbl)).toBe(100);
  });

  test("another organization's customer is rejected", async () => {
    const { hbl } = await seedCustomer();
    const stranger = await Customer.create({ organizationId: new mongoose.Types.ObjectId(), branchId: BRANCH, name: 'Stranger' });

    await expect(create(hbl, [{ payeeType: 'customer', customerId: stranger._id, amount: 100 }])).rejects.toThrow(/Customer not found/);
    expect(await balanceOf(hbl)).toBe(10000);
  });
});
