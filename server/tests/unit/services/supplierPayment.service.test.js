const mongoose = require('mongoose');
const setupTestDB = require('../../utils/setupTestDB');
const { Organization, Branch, Supplier, Purchase, SupplierLedger, CashBookEntry, SupplierPayment, Wallet, PurchaseReturn } = require('../../../src/models');
const supplierPaymentService = require('../../../src/services/supplierPayment.service');
const supplierLedgerService = require('../../../src/services/supplierLedger.service');
const purchaseService = require('../../../src/services/purchase.service');

/**
 * Supplier payment allocation, end-to-end against real (in-memory Mongo) documents — the
 * service layer directly, no HTTP/auth, same level as taxCalculator.service.test.js and for
 * the same reason (app.js can't be require()d under Jest in this repo).
 *
 * These scenarios are the ones the feature exists for: one payment spilling across several
 * invoices oldest-first, the part-paid invoice a later payment has to finish before moving
 * on, over-payment turning into supplier credit, and every one of those being reversible.
 */
setupTestDB();
jest.setTimeout(30000);

const user = { id: new mongoose.Types.ObjectId(), name: 'Test Buyer' };

let org;
let branch;
let supplier;

/** Five invoices totalling 5000, oldest first — the worked example from the spec. */
const INVOICE_AMOUNTS = [1000, 1200, 700, 900, 1200];

const createPurchase = async (amount, dayOffset, overrides = {}) => {
  const purchaseDate = new Date(2026, 0, 1 + dayOffset);
  return Purchase.create({
    organizationId: org._id,
    branchId: branch._id,
    supplier: supplier._id,
    invoiceNumber: `INV-${1000 + dayOffset}`,
    items: [],
    purchaseDate,
    totalAmount: amount,
    paidAmount: 0,
    balance: amount,
    type: 'credit',
    ...overrides,
  });
};

const seedInvoices = async () => {
  const purchases = [];
  for (let index = 0; index < INVOICE_AMOUNTS.length; index += 1) {
    purchases.push(await createPurchase(INVOICE_AMOUNTS[index], index));
  }
  return purchases;
};

/** Remaining balance per invoice number, straight from the database. */
const outstandingByInvoice = async () => {
  const purchases = await Purchase.find({ supplier: supplier._id }).sort({ purchaseDate: 1 }).lean();
  return purchases.reduce((map, purchase) => {
    map[purchase.invoiceNumber] = purchase.totalAmount - (purchase.paidAmount || 0) - (purchase.allocatedAmount || 0);
    return map;
  }, {});
};

const pay = (amount, overrides = {}) =>
  supplierPaymentService.createPayment(
    {
      organizationId: org._id,
      branchId: branch._id,
      supplier: supplier._id,
      amount,
      paymentMethod: 'cash',
      allocationMode: 'fifo',
      ...overrides,
    },
    user
  );

beforeEach(async () => {
  org = await Organization.create({ name: 'Test Org', owner: new mongoose.Types.ObjectId(), baseCurrency: 'PKR' });
  branch = await Branch.create({ organizationId: org._id, name: 'Main Branch' });
  supplier = await Supplier.create({ organizationId: org._id, branchId: branch._id, name: 'Acme Traders' });
});

describe('supplierPaymentService — FIFO allocation', () => {
  test('2200 against 1000/1200/700/900/1200 clears the first two invoices exactly', async () => {
    await seedInvoices();

    const payment = await pay(2200);

    expect(payment.allocations.map((allocation) => [allocation.invoiceNumber, allocation.amount])).toEqual([
      ['INV-1000', 1000],
      ['INV-1001', 1200],
    ]);
    expect(payment.allocatedTotal).toBe(2200);
    expect(payment.unappliedAmount).toBe(0);

    const outstanding = await outstandingByInvoice();
    expect(outstanding).toEqual({ 'INV-1000': 0, 'INV-1001': 0, 'INV-1002': 700, 'INV-1003': 900, 'INV-1004': 1200 });

    const summary = await supplierPaymentService.getSupplierAccountSummary({
      organizationId: org._id,
      branchId: branch._id,
      supplier: supplier._id,
    });
    expect(summary.totalOutstanding).toBe(2800);
    expect(summary.openInvoiceCount).toBe(3);
  });

  test('1500 leaves the second invoice partially paid, and the next payment finishes it before moving on', async () => {
    await seedInvoices();

    const first = await pay(1500);
    expect(first.allocations.map((allocation) => [allocation.invoiceNumber, allocation.amount])).toEqual([
      ['INV-1000', 1000],
      ['INV-1001', 500],
    ]);
    expect((await outstandingByInvoice())['INV-1001']).toBe(700);

    const second = await pay(1000);
    expect(second.allocations.map((allocation) => [allocation.invoiceNumber, allocation.amount])).toEqual([
      ['INV-1001', 700],
      ['INV-1002', 300],
    ]);

    const outstanding = await outstandingByInvoice();
    expect(outstanding['INV-1001']).toBe(0);
    expect(outstanding['INV-1002']).toBe(400);
  });

  test('repeated part-payments settle an odd total exactly, with no floating-point crumb left behind', async () => {
    await createPurchase(99.99, 0);

    await pay(33.33);
    await pay(33.33);
    const third = await pay(33.33);

    expect(third.unappliedAmount).toBe(0);
    expect((await outstandingByInvoice())['INV-1000']).toBe(0);

    const open = await supplierPaymentService.getOpenInvoicesForSupplier({
      organizationId: org._id,
      branchId: branch._id,
      supplier: supplier._id,
    });
    expect(open).toHaveLength(0);
  });

  test('payment made at purchase time counts toward settlement, so allocation only covers the rest', async () => {
    await createPurchase(1000, 0, { paidAmount: 400, balance: 600 });

    const payment = await pay(1000);

    expect(payment.allocations[0].amount).toBe(600);
    expect(payment.unappliedAmount).toBe(400);
  });
});

describe('supplierPaymentService — over-payment, credit and refunds', () => {
  test('paying more than is owed keeps the excess as supplier credit', async () => {
    await seedInvoices();

    const payment = await pay(6000);

    expect(payment.allocatedTotal).toBe(5000);
    expect(payment.unappliedAmount).toBe(1000);
    expect(
      await supplierPaymentService.getSupplierCreditBalance({
        organizationId: org._id,
        branchId: branch._id,
        supplier: supplier._id,
      })
    ).toBe(1000);
  });

  test('held credit can be applied to an invoice raised later, without moving any more money', async () => {
    await pay(1000, { allocationMode: 'none' });
    await createPurchase(600, 5);

    const result = await supplierPaymentService.applyCredit(
      { organizationId: org._id, branchId: branch._id, supplier: supplier._id },
      user
    );

    expect(result.appliedAmount).toBe(600);
    expect(result.remainingCredit).toBe(400);
    expect((await outstandingByInvoice())['INV-1005']).toBe(0);
    // One payment, one ledger entry — applying credit must not bank a second cash movement.
    expect(await SupplierLedger.countDocuments({ supplier: supplier._id, transactionType: 'payment_made' })).toBe(1);
  });

  test('a refund draws the credit back down and cannot exceed what the supplier holds', async () => {
    await pay(1000, { allocationMode: 'none' });

    await pay(400, { direction: 'refund' });
    expect(
      await supplierPaymentService.getSupplierCreditBalance({
        organizationId: org._id,
        branchId: branch._id,
        supplier: supplier._id,
      })
    ).toBe(600);

    await expect(pay(900, { direction: 'refund' })).rejects.toThrow(/unapplied credit/i);
  });
});

describe('supplierPaymentService — manual and due-date allocation', () => {
  test('manual allocation applies exactly what was typed per invoice', async () => {
    const purchases = await seedInvoices();

    const payment = await pay(1500, {
      allocationMode: 'manual',
      allocations: [
        { purchaseId: String(purchases[2]._id), amount: 700 },
        { purchaseId: String(purchases[4]._id), amount: 800 },
      ],
    });

    expect(payment.allocations.map((allocation) => [allocation.invoiceNumber, allocation.amount])).toEqual([
      ['INV-1002', 700],
      ['INV-1004', 800],
    ]);
    const outstanding = await outstandingByInvoice();
    expect(outstanding['INV-1000']).toBe(1000);
    expect(outstanding['INV-1002']).toBe(0);
    expect(outstanding['INV-1004']).toBe(400);
  });

  test('manual allocation refuses to put more on an invoice than it still owes', async () => {
    const purchases = await seedInvoices();

    await expect(
      pay(5000, { allocationMode: 'manual', allocations: [{ purchaseId: String(purchases[0]._id), amount: 2500 }] })
    ).rejects.toThrow(/still outstanding/i);
  });

  test('due-date mode pays the earliest due invoice first, not the oldest invoice', async () => {
    await createPurchase(1000, 0, { dueDate: new Date(2026, 5, 1) });
    await createPurchase(1000, 1, { dueDate: new Date(2026, 1, 1) });

    const payment = await pay(1000, { allocationMode: 'due_date' });

    expect(payment.allocations[0].invoiceNumber).toBe('INV-1001');
  });
});

describe('supplierPaymentService — reversal and downstream records', () => {
  test('a cash payment posts one supplier-ledger debit and one cash-book entry', async () => {
    await seedInvoices();

    const payment = await pay(2200);

    const ledgerEntries = await SupplierLedger.find({ supplier: supplier._id, transactionType: 'payment_made' });
    expect(ledgerEntries).toHaveLength(1);
    expect(ledgerEntries[0].debit).toBe(2200);
    expect(String(payment.supplierLedgerEntryId)).toBe(String(ledgerEntries[0]._id));

    const cashEntries = await CashBookEntry.find({ referenceId: ledgerEntries[0]._id, referenceModel: 'SupplierLedger' });
    expect(cashEntries).toHaveLength(1);
    expect(cashEntries[0].amount).toBe(2200);
    expect(cashEntries[0].type).toBe('expense');
  });

  test('voiding hands every allocated rupee back and removes the money legs', async () => {
    await seedInvoices();
    const payment = await pay(2200);
    const ledgerEntryId = payment.supplierLedgerEntryId;

    const voided = await supplierPaymentService.voidPayment(payment._id, { reason: 'wrong supplier' }, user);

    expect(voided.status).toBe('void');
    expect(voided.allocatedTotal).toBe(0);
    expect(await outstandingByInvoice()).toEqual({
      'INV-1000': 1000,
      'INV-1001': 1200,
      'INV-1002': 700,
      'INV-1003': 900,
      'INV-1004': 1200,
    });
    expect(await SupplierLedger.findById(ledgerEntryId)).toBeNull();
    expect(await CashBookEntry.countDocuments({ referenceId: ledgerEntryId })).toBe(0);
    // The record itself survives — an ERP voids a posted payment, it never deletes it.
    expect(await SupplierPayment.countDocuments({ _id: payment._id })).toBe(1);
    expect(voided.history.some((entry) => entry.action === 'voided')).toBe(true);
  });

  test('re-allocating moves the same money to different invoices without touching the ledger', async () => {
    const purchases = await seedInvoices();
    const payment = await pay(1000);
    const ledgerEntryId = String(payment.supplierLedgerEntryId);

    const reallocated = await supplierPaymentService.reallocatePayment(
      payment._id,
      { allocationMode: 'manual', allocations: [{ purchaseId: String(purchases[3]._id), amount: 900 }] },
      user
    );

    expect(reallocated.allocations.map((allocation) => allocation.invoiceNumber)).toEqual(['INV-1003']);
    expect(reallocated.unappliedAmount).toBe(100);
    const outstanding = await outstandingByInvoice();
    expect(outstanding['INV-1000']).toBe(1000);
    expect(outstanding['INV-1003']).toBe(0);
    expect(String(reallocated.supplierLedgerEntryId)).toBe(ledgerEntryId);
    expect(await SupplierLedger.countDocuments({ _id: ledgerEntryId })).toBe(1);
  });

  test('deleting an invoice returns the money applied to it as supplier credit', async () => {
    const purchases = await seedInvoices();
    await pay(2200);

    await supplierPaymentService.detachPurchaseAllocations(purchases[0]._id);

    const payment = await SupplierPayment.findOne({ supplier: supplier._id });
    expect(payment.allocations.map((allocation) => allocation.invoiceNumber)).toEqual(['INV-1001']);
    expect(payment.allocatedTotal).toBe(1200);
    expect(payment.unappliedAmount).toBe(1000);
  });
});

describe('supplierPaymentService — payments recorded on the Supplier Ledger screen', () => {
  test('a standalone "Cash Paid" ledger entry settles open invoices FIFO, without a second ledger row', async () => {
    await seedInvoices();

    const entry = await supplierLedgerService.createLedgerEntry({
      organizationId: org._id,
      branchId: branch._id,
      supplier: supplier._id,
      transactionType: 'payment_made',
      transactionDate: new Date(2026, 1, 1),
      description: 'cash',
      debit: 2200,
      credit: 0,
      paymentMethod: 'Cash',
    });

    const outstanding = await outstandingByInvoice();
    expect(outstanding).toEqual({ 'INV-1000': 0, 'INV-1001': 0, 'INV-1002': 700, 'INV-1003': 900, 'INV-1004': 1200 });

    // One ledger row, one cash movement — the allocation attaches to the entry that already
    // exists rather than posting its own.
    expect(await SupplierLedger.countDocuments({ supplier: supplier._id, transactionType: 'payment_made' })).toBe(1);
    const payment = await SupplierPayment.findOne({ supplierLedgerEntryId: entry._id });
    expect(payment.allocatedTotal).toBe(2200);
    expect(payment.allocations.map((allocation) => allocation.invoiceNumber)).toEqual(['INV-1000', 'INV-1001']);
    expect(entry.$locals.invoiceAllocation.invoices).toEqual([
      { invoiceNumber: 'INV-1000', amount: 1000, fullySettled: true },
      { invoiceNumber: 'INV-1001', amount: 1200, fullySettled: true },
    ]);
  });

  test('a wallet-funded ledger payment keeps its bank account on the allocation record', async () => {
    await seedInvoices();
    // The ledger debits the real bank account, so it has to exist and hold the money —
    // same guard any wallet-funded supplier payment already hits.
    await Wallet.create({ organizationId: org._id, branchId: branch._id, type: 'HBL Main', balance: 5000 });

    await supplierLedgerService.createLedgerEntry({
      organizationId: org._id,
      branchId: branch._id,
      supplier: supplier._id,
      transactionType: 'payment_made',
      transactionDate: new Date(2026, 1, 1),
      description: 'bank transfer',
      debit: 1000,
      credit: 0,
      paymentMethod: 'Wallet (HBL Main)',
    });

    const payment = await SupplierPayment.findOne({ supplier: supplier._id });
    expect(payment.paymentMethod).toBe('wallet');
    expect(payment.walletType).toBe('HBL Main');
  });

  test('a ledger payment already tied to a purchase is left alone — that invoice is paid by its own record', async () => {
    const purchases = await seedInvoices();

    await supplierLedgerService.createLedgerEntry({
      organizationId: org._id,
      branchId: branch._id,
      supplier: supplier._id,
      transactionType: 'payment_made',
      transactionDate: new Date(2026, 1, 1),
      description: 'Payment made for Purchase #INV-1000',
      referenceId: purchases[0]._id,
      debit: 1000,
      credit: 0,
      paymentMethod: 'Cash',
    });

    expect(await SupplierPayment.countDocuments({ supplier: supplier._id })).toBe(0);
    expect((await outstandingByInvoice())['INV-1000']).toBe(1000);
  });

  test('deleting the ledger entry puts the invoices back to outstanding and voids the payment', async () => {
    await seedInvoices();
    const entry = await supplierLedgerService.createLedgerEntry({
      organizationId: org._id,
      branchId: branch._id,
      supplier: supplier._id,
      transactionType: 'payment_made',
      transactionDate: new Date(2026, 1, 1),
      description: 'cash',
      debit: 2200,
      credit: 0,
      paymentMethod: 'Cash',
    });

    await supplierLedgerService.deleteLedgerEntry(entry._id);

    expect(await outstandingByInvoice()).toEqual({
      'INV-1000': 1000,
      'INV-1001': 1200,
      'INV-1002': 700,
      'INV-1003': 900,
      'INV-1004': 1200,
    });
    const payment = await SupplierPayment.findOne({ supplierLedgerEntryId: entry._id });
    expect(payment.status).toBe('void');
    expect(payment.allocatedTotal).toBe(0);
  });

  test('voiding a ledger-recorded payment from the invoice side also removes its ledger row', async () => {
    await seedInvoices();
    const entry = await supplierLedgerService.createLedgerEntry({
      organizationId: org._id,
      branchId: branch._id,
      supplier: supplier._id,
      transactionType: 'payment_made',
      transactionDate: new Date(2026, 1, 1),
      description: 'cash',
      debit: 2200,
      credit: 0,
      paymentMethod: 'Cash',
    });
    const payment = await SupplierPayment.findOne({ supplierLedgerEntryId: entry._id });

    await supplierPaymentService.voidPayment(payment._id, { reason: 'entered twice' }, user);

    expect(await SupplierLedger.countDocuments({ _id: entry._id })).toBe(0);
    expect((await outstandingByInvoice())['INV-1000']).toBe(1000);
  });

  test('editing a pre-existing ledger payment does not retroactively settle anything', async () => {
    await seedInvoices();
    // An entry written before payments allocated — created directly, so it has no
    // SupplierPayment record attached.
    const legacyEntry = await SupplierLedger.create({
      organizationId: org._id,
      branchId: branch._id,
      supplier: supplier._id,
      transactionType: 'payment_made',
      transactionDate: new Date(2026, 1, 1),
      description: 'old cash payment',
      debit: 2200,
      credit: 0,
      balance: 0,
      paymentMethod: 'Cash',
    });

    await supplierLedgerService.updateLedgerEntry(legacyEntry._id, { description: 'old cash payment (typo fixed)' });

    expect(await SupplierPayment.countDocuments({ supplier: supplier._id })).toBe(0);
    expect((await outstandingByInvoice())['INV-1000']).toBe(1000);
  });

  test('paying more on the ledger than is owed keeps the rest as supplier credit', async () => {
    await createPurchase(1000, 0);

    await supplierLedgerService.createLedgerEntry({
      organizationId: org._id,
      branchId: branch._id,
      supplier: supplier._id,
      transactionType: 'payment_made',
      transactionDate: new Date(2026, 1, 1),
      description: 'cash',
      debit: 2500,
      credit: 0,
      paymentMethod: 'Cash',
    });

    expect((await outstandingByInvoice())['INV-1000']).toBe(0);
    expect(
      await supplierPaymentService.getSupplierCreditBalance({
        organizationId: org._id,
        branchId: branch._id,
        supplier: supplier._id,
      })
    ).toBe(1500);
  });
});

describe('supplierPaymentService — ledger vs invoice reconciliation', () => {
  /**
   * The fixtures elsewhere in this file create Purchase documents directly, which is the
   * right level for allocation math. Reconciliation compares against the SUPPLIER LEDGER,
   * so these tests also need the ledger side a real purchase would have posted: one credit
   * per invoice (see utils/ledgerSettlement.js's buildSupplierPurchaseLedgerEntries).
   */
  const seedPurchaseLedgerCredits = async () => {
    const purchases = await Purchase.find({ supplier: supplier._id }).sort({ purchaseDate: 1 }).lean();
    for (const purchase of purchases) {
      await SupplierLedger.create({
        organizationId: org._id,
        branchId: branch._id,
        supplier: supplier._id,
        transactionType: 'purchase',
        transactionDate: purchase.purchaseDate,
        reference: purchase.invoiceNumber,
        referenceId: purchase._id,
        description: `Purchase Invoice #${purchase.invoiceNumber}`,
        debit: 0,
        credit: purchase.totalAmount,
        balance: 0,
      });
    }
  };

  /** Builds the exact shape that makes the two screens disagree in real data. */
  const seedDivergentAccount = async () => {
    await seedInvoices(); // 5000 of credit invoices, nothing paid
    await seedPurchaseLedgerCredits();

    // (a) A payment recorded on the ledger before payments settled invoices — the real gap.
    await SupplierLedger.create({
      organizationId: org._id,
      branchId: branch._id,
      supplier: supplier._id,
      transactionType: 'payment_made',
      transactionDate: new Date(2026, 1, 1),
      description: 'legacy cash payment',
      debit: 500,
      credit: 0,
      balance: 0,
      paymentMethod: 'Cash',
    });

    // (b) A debit note — goods this supplier bought from us, netted off the balance but not
    // off any particular bill. Not a gap: a real accounting distinction.
    await SupplierLedger.create({
      organizationId: org._id,
      branchId: branch._id,
      supplier: supplier._id,
      transactionType: 'debit_note',
      transactionDate: new Date(2026, 1, 2),
      description: 'Store sale',
      referenceId: new mongoose.Types.ObjectId(),
      referenceModel: 'Invoice',
      debit: 1200,
      credit: 0,
      balance: 0,
    });

    await supplierLedgerService.recalculateBalances(supplier._id);
  };

  test('the gap between the two figures is itemised and always ties out exactly', async () => {
    await seedDivergentAccount();

    const reconciliation = await supplierPaymentService.getSupplierReconciliation({
      organizationId: org._id,
      supplier: supplier._id,
    });

    expect(reconciliation.invoiceOutstanding).toBe(5000);
    expect(reconciliation.unallocatedPayments).toBe(500);
    expect(reconciliation.contraCredits).toBe(1200);
    expect(reconciliation.availableCredit).toBe(0);
    expect(reconciliation.ledgerBalance).toBe(3300);
    expect(reconciliation.unexplained).toBe(0);
    expect(reconciliation.isReconciled).toBe(false);

    // The identity the whole panel rests on.
    const bridged =
      reconciliation.invoiceOutstanding -
      reconciliation.unallocatedPayments -
      reconciliation.availableCredit -
      reconciliation.contraCredits -
      reconciliation.returnCredits -
      reconciliation.unexplained;
    expect(bridged).toBe(reconciliation.ledgerBalance);
  });

  test('applying unallocated payments closes that gap and leaves the contra alone', async () => {
    await seedDivergentAccount();

    const result = await supplierPaymentService.repairSupplierAllocations(
      { organizationId: org._id, branchId: branch._id, supplier: supplier._id },
      user
    );

    expect(result.appliedCount).toBe(1);
    expect(result.appliedTotal).toBe(500);
    expect((await outstandingByInvoice())['INV-1000']).toBe(500);

    const reconciliation = result.reconciliation;
    expect(reconciliation.unallocatedPayments).toBe(0);
    expect(reconciliation.invoiceOutstanding).toBe(4500);
    // The debit note is NOT a gap — it stays as an explained line, and the balance is unmoved.
    expect(reconciliation.contraCredits).toBe(1200);
    expect(reconciliation.ledgerBalance).toBe(3300);
    expect(reconciliation.unexplained).toBe(0);
  });

  test('re-running the fix is a no-op — payments are never applied twice', async () => {
    await seedDivergentAccount();

    await supplierPaymentService.repairSupplierAllocations(
      { organizationId: org._id, branchId: branch._id, supplier: supplier._id },
      user
    );
    const second = await supplierPaymentService.repairSupplierAllocations(
      { organizationId: org._id, branchId: branch._id, supplier: supplier._id },
      user
    );

    expect(second.appliedCount).toBe(0);
    expect((await outstandingByInvoice())['INV-1000']).toBe(500);
  });

  test('an invoice paid beyond its value is named, not swept into a nameless bucket', async () => {
    await seedInvoices();
    await seedPurchaseLedgerCredits();
    // One bill's payment field used to pay several — 5,000 recorded on a 1,000 invoice.
    await Purchase.updateOne({ invoiceNumber: 'INV-1000' }, { $set: { paidAmount: 5000 } });
    await SupplierLedger.create({
      organizationId: org._id,
      branchId: branch._id,
      supplier: supplier._id,
      transactionType: 'payment_made',
      transactionDate: new Date(2026, 0, 1),
      description: 'Payment made for Purchase #INV-1000',
      referenceId: (await Purchase.findOne({ invoiceNumber: 'INV-1000' }).select('_id'))._id,
      debit: 5000,
      credit: 0,
      balance: 0,
    });
    await supplierLedgerService.recalculateBalances(supplier._id);

    const reconciliation = await supplierPaymentService.getSupplierReconciliation({
      organizationId: org._id,
      supplier: supplier._id,
    });

    // Gross open items exclude the 1,000 invoice entirely; the balance nets its excess off.
    expect(reconciliation.invoiceOutstanding).toBe(4000);
    expect(reconciliation.invoiceOverpayment).toBe(4000);
    expect(reconciliation.overpaidInvoiceCount).toBe(1);
    expect(reconciliation.overpaidInvoices).toEqual(['INV-1000']);
    expect(reconciliation.ledgerBalance).toBe(0);
    // Named in full — nothing left over.
    expect(reconciliation.residual).toBe(0);
    // Not something an allocation can decide; it needs a person.
    expect(reconciliation.fixableAmount).toBe(0);
  });

  test('an account with nothing unapplied reports as reconciled', async () => {
    await seedInvoices();
    await seedPurchaseLedgerCredits();
    await pay(5000);

    const reconciliation = await supplierPaymentService.getSupplierReconciliation({
      organizationId: org._id,
      supplier: supplier._id,
    });

    expect(reconciliation.invoiceOutstanding).toBe(0);
    expect(reconciliation.ledgerBalance).toBe(0);
    expect(reconciliation.isReconciled).toBe(true);
  });

  test('an advance shows as held credit, not as a gap to fix', async () => {
    await seedInvoices();
    await seedPurchaseLedgerCredits();
    await pay(6000);

    const reconciliation = await supplierPaymentService.getSupplierReconciliation({
      organizationId: org._id,
      supplier: supplier._id,
    });

    expect(reconciliation.availableCredit).toBe(1000);
    expect(reconciliation.unallocatedPayments).toBe(0);
    expect(reconciliation.ledgerBalance).toBe(-1000);
    expect(reconciliation.isReconciled).toBe(true);
  });
});

describe('supplierPaymentService — purchase returns credit their own invoice', () => {
  /** A return posts its ledger debit at creation time; this is that row. */
  const seedReturnLedgerEntry = async (purchaseId, amount, { status = 'approved' } = {}) => {
    const purchaseReturn = await PurchaseReturn.create({
      organizationId: org._id,
      branchId: branch._id,
      returnNumber: `PR-TEST-${Math.random().toString(36).slice(2, 8)}`,
      purchaseId,
      supplierId: supplier._id,
      items: [],
      totalAmount: amount,
      refundMethod: 'adjustment',
      status,
      date: new Date(2026, 1, 5),
    });

    const entry = await SupplierLedger.create({
      organizationId: org._id,
      branchId: branch._id,
      supplier: supplier._id,
      transactionType: 'purchase_return',
      transactionDate: purchaseReturn.date,
      reference: purchaseReturn.returnNumber,
      referenceId: purchaseReturn._id,
      referenceModel: 'PurchaseReturn',
      description: `Purchase return ${purchaseReturn.returnNumber}`,
      debit: amount,
      credit: 0,
      balance: 0,
    });

    return { purchaseReturn, entry };
  };

  test('the credit lands on the invoice the goods came back from, not the oldest one', async () => {
    const purchases = await seedInvoices();
    // Third invoice (700) — deliberately NOT the one FIFO would pick.
    const { entry } = await seedReturnLedgerEntry(purchases[2]._id, 200);

    await supplierPaymentService.recordAllocationForLedgerEntry(entry, user);

    const outstanding = await outstandingByInvoice();
    expect(outstanding['INV-1002']).toBe(500);
    expect(outstanding['INV-1000']).toBe(1000);

    const credit = await SupplierPayment.findOne({ supplierLedgerEntryId: entry._id });
    expect(credit.direction).toBe('return_credit');
    expect(credit.allocatedTotal).toBe(200);
    // A return is not spendable payment credit — it must never inflate the advance pool.
    expect(credit.unappliedAmount).toBe(0);
    expect(
      await supplierPaymentService.getSupplierCreditBalance({
        organizationId: org._id,
        branchId: branch._id,
        supplier: supplier._id,
      })
    ).toBe(0);
  });

  test('a return worth more than the invoice still owes only credits what is left', async () => {
    const purchases = await seedInvoices();
    await pay(1000); // clears INV-1000 entirely
    const { entry } = await seedReturnLedgerEntry(purchases[0]._id, 400);

    const credit = await supplierPaymentService.recordAllocationForLedgerEntry(entry, user);

    // Nothing left owing on that invoice — the credit stays on the account rather than
    // pushing a settled invoice into a fake overpayment.
    expect(credit).toBeNull();
    expect((await outstandingByInvoice())['INV-1000']).toBe(0);
  });

  test('a return with no linked invoice stays on the account', async () => {
    await seedInvoices();
    const { entry } = await seedReturnLedgerEntry(null, 300);

    expect(await supplierPaymentService.recordAllocationForLedgerEntry(entry, user)).toBeNull();
    expect((await outstandingByInvoice())['INV-1000']).toBe(1000);
  });

  test('a rejected return credits nothing', async () => {
    const purchases = await seedInvoices();
    const { entry } = await seedReturnLedgerEntry(purchases[0]._id, 200, { status: 'rejected' });

    expect(await supplierPaymentService.recordAllocationForLedgerEntry(entry, user)).toBeNull();
    expect((await outstandingByInvoice())['INV-1000']).toBe(1000);
  });

  test('releasing a return credit puts the invoice back to what it owed', async () => {
    const purchases = await seedInvoices();
    const { purchaseReturn, entry } = await seedReturnLedgerEntry(purchases[0]._id, 200);
    await supplierPaymentService.recordAllocationForLedgerEntry(entry, user);
    expect((await outstandingByInvoice())['INV-1000']).toBe(800);

    await supplierPaymentService.releaseReturnCredit(purchaseReturn._id, user);

    expect((await outstandingByInvoice())['INV-1000']).toBe(1000);
    const credit = await SupplierPayment.findOne({ supplierLedgerEntryId: entry._id });
    expect(credit.status).toBe('void');
  });

  test('the one-click repair fixes payments and returns together, and is idempotent', async () => {
    const purchases = await seedInvoices();
    // Legacy shape: a payment and a return, both only ever on the ledger.
    await SupplierLedger.create({
      organizationId: org._id,
      branchId: branch._id,
      supplier: supplier._id,
      transactionType: 'payment_made',
      transactionDate: new Date(2026, 1, 1),
      description: 'legacy cash payment',
      debit: 500,
      credit: 0,
      balance: 0,
      paymentMethod: 'Cash',
    });
    await seedReturnLedgerEntry(purchases[2]._id, 200);

    const result = await supplierPaymentService.repairSupplierAllocations(
      { organizationId: org._id, branchId: branch._id, supplier: supplier._id },
      user
    );

    expect(result.paymentCount).toBe(1);
    expect(result.returnCount).toBe(1);
    expect(result.appliedTotal).toBe(700);
    const outstanding = await outstandingByInvoice();
    expect(outstanding['INV-1000']).toBe(500); // 500 payment, FIFO
    expect(outstanding['INV-1002']).toBe(500); // 200 return, its own invoice

    const second = await supplierPaymentService.repairSupplierAllocations(
      { organizationId: org._id, branchId: branch._id, supplier: supplier._id },
      user
    );
    expect(second.appliedCount).toBe(0);
    expect((await outstandingByInvoice())['INV-1002']).toBe(500);
  });

  test('an applied return is no longer part of the ledger-vs-invoice difference', async () => {
    const purchases = await seedInvoices();
    const { entry } = await seedReturnLedgerEntry(purchases[2]._id, 200);

    const before = await supplierPaymentService.getSupplierReconciliation({
      organizationId: org._id,
      supplier: supplier._id,
    });
    expect(before.returnCredits).toBe(200);
    expect(before.fixableAmount).toBe(200);

    await supplierPaymentService.recordAllocationForLedgerEntry(entry, user);

    const after = await supplierPaymentService.getSupplierReconciliation({
      organizationId: org._id,
      supplier: supplier._id,
    });
    // Both sides moved together, so it stops being a gap and is reported as applied instead.
    expect(after.returnCredits).toBe(0);
    expect(after.appliedReturnCredits).toBe(200);
    expect(after.fixableAmount).toBe(0);
  });
});

describe('purchaseService — settlement-aware list', () => {
  test('payment status and remaining amount are filterable and sortable straight after a payment', async () => {
    await seedInvoices();
    await pay(1500);

    const scope = { organizationId: org._id, branchId: branch._id };

    const paid = await purchaseService.queryPurchaseList(scope, { paymentStatus: 'paid' });
    expect(paid.results.map((purchase) => purchase.invoiceNumber)).toEqual(['INV-1000']);

    const partial = await purchaseService.queryPurchaseList(scope, { paymentStatus: 'partial' });
    expect(partial.results.map((purchase) => purchase.invoiceNumber)).toEqual(['INV-1001']);
    expect(partial.results[0].remainingAmount).toBe(700);
    expect(partial.results[0].settledAmount).toBe(500);

    const outstanding = await purchaseService.queryPurchaseList(scope, {
      paymentStatus: 'outstanding',
      sortBy: 'remainingAmount:desc',
    });
    // INV-1001 (part-paid) and INV-1002 both owe 700 — the _id tiebreaker in the sort keeps
    // that pair in a stable, repeatable order instead of letting the page boundary wobble.
    expect(outstanding.results.map((purchase) => purchase.invoiceNumber)).toEqual([
      'INV-1004',
      'INV-1003',
      'INV-1002',
      'INV-1001',
    ]);

    const summary = await purchaseService.getPurchaseListSummary(scope, {});
    expect(summary.totalValue).toBe(5000);
    expect(summary.totalOutstanding).toBe(3500);
    expect(summary.paidCount).toBe(1);
    expect(summary.partialCount).toBe(1);
    expect(summary.unpaidCount).toBe(3);
  });

  test('overdue is driven by the due date, and only while something is still owed', async () => {
    await createPurchase(1000, 0, { dueDate: new Date(2026, 0, 10) });
    await createPurchase(1000, 1, { dueDate: new Date(2099, 0, 10) });
    const settled = await createPurchase(1000, 2, { dueDate: new Date(2026, 0, 10) });
    await Purchase.updateOne({ _id: settled._id }, { $set: { paidAmount: 1000 } });

    const scope = { organizationId: org._id, branchId: branch._id };
    const overdue = await purchaseService.queryPurchaseList(scope, { dueStatus: 'overdue' });

    expect(overdue.results.map((purchase) => purchase.invoiceNumber)).toEqual(['INV-1000']);
  });
});
