const mongoose = require('mongoose');
const setupTestDB = require('../../utils/setupTestDB');
const { Purchase, Invoice } = require('../../../src/models');
const entryGuard = require('../../../src/services/entryGuard.service');
const { toBusinessCalendarDate } = require('../../../src/utils/businessTimezone');

setupTestDB();
// Several sequential queries per test — a cold in-memory mongod under a parallel run can pass 5s.
jest.setTimeout(30000);

const ORG = new mongoose.Types.ObjectId();
const BRANCH = new mongoose.Types.ObjectId();
const OTHER_BRANCH = new mongoose.Types.ObjectId();
const SUPPLIER = new mongoose.Types.ObjectId();
const CUSTOMER = new mongoose.Types.ObjectId();
const scope = { organizationId: String(ORG), branchId: String(BRANCH) };
const oidAt = (seconds) => mongoose.Types.ObjectId.createFromTime(seconds);
const pkt = (day, time = '12:00') => new Date(`${day}T${time}:00+05:00`);

// Raw inserts: what is under test is reading, not each model's save hooks.
const purchase = (over) => ({
  organizationId: ORG, branchId: BRANCH, supplier: SUPPLIER, invoiceNumber: 'P', totalAmount: 100, items: [], purchaseDate: pkt('2026-10-01'), ...over,
});
const invoice = (over) => ({
  organizationId: ORG, branchId: BRANCH, customerId: CUSTOMER, invoiceNumber: 'S', total: 100, subtotal: 100, type: 'cash', status: 'finalized', items: [], invoiceDate: pkt('2026-10-01'), ...over,
});

describe('navigateRecords', () => {
  beforeEach(async () => {
    // Entered order A,B,C,D; their own dates: B oldest, D newest, A/C same day.
    await Purchase.collection.insertMany([
      purchase({ _id: oidAt(1000), invoiceNumber: 'A', purchaseDate: pkt('2026-10-05') }),
      purchase({ _id: oidAt(2000), invoiceNumber: 'B', purchaseDate: pkt('2026-09-01') }),
      purchase({ _id: oidAt(3000), invoiceNumber: 'C', purchaseDate: pkt('2026-10-05') }),
      purchase({ _id: oidAt(4000), invoiceNumber: 'D', purchaseDate: pkt('2026-10-09') }),
      purchase({ _id: oidAt(5000), invoiceNumber: 'X', branchId: OTHER_BRANCH }),
    ]);
  });
  const nav = (args) => entryGuard.navigateRecords({ Model: Purchase, match: { organizationId: ORG, branchId: BRANCH }, dateField: 'purchaseDate', ...args });
  const walk = async (order) => {
    const out = [];
    for (let i = 0; i < 4; i++) out.push((await nav({ order, index: i })).number);
    return out;
  };

  test('entered order: last saved first; date order: newest date first, same day by entry', async () => {
    expect(await walk('entered')).toEqual(['D', 'C', 'B', 'A']);
    expect(await walk('date')).toEqual(['D', 'C', 'A', 'B']);
  });

  test('total is branch-scoped and an index past the end clamps to the oldest', async () => {
    const r = await nav({ index: 99 });
    expect(r).toMatchObject({ total: 4, index: 3, number: 'A' });
  });

  test('around=<id> returns that record at its own position, in either order', async () => {
    const a = String(oidAt(1000));
    expect(await nav({ around: a, order: 'entered' })).toMatchObject({ index: 3, number: 'A' });
    expect(await nav({ around: a, order: 'date' })).toMatchObject({ index: 2, number: 'A' });
  });

  test('empty list', async () => {
    expect(await entryGuard.navigateRecords({ Model: Purchase, match: { organizationId: new mongoose.Types.ObjectId() }, dateField: 'purchaseDate' }))
      .toEqual({ total: 0, index: null, id: null, number: null });
  });
});

describe('findPossibleDuplicatePurchases', () => {
  test('same supplier bill number, whatever the spacing/case — even with a different amount', async () => {
    await Purchase.collection.insertMany([purchase({ invoiceNumber: 'PUR-1', vendorBillNumber: 'INV-0042', totalAmount: 999 })]);
    const m = await entryGuard.findPossibleDuplicatePurchases(scope, { supplier: String(SUPPLIER), vendorBillNumber: ' inv 0042 ', totalAmount: 5 });
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ number: 'PUR-1', reason: 'same_bill_number' });
  });

  test('same amount within 3 days counts; 4 days away, another supplier, or another branch does not', async () => {
    await Purchase.collection.insertMany([
      purchase({ invoiceNumber: 'near', purchaseDate: pkt('2026-10-04') }),
      purchase({ invoiceNumber: 'far', purchaseDate: pkt('2026-10-06') }),
      purchase({ invoiceNumber: 'otherSupplier', supplier: new mongoose.Types.ObjectId(), purchaseDate: pkt('2026-10-02') }),
      purchase({ invoiceNumber: 'otherBranch', branchId: OTHER_BRANCH, purchaseDate: pkt('2026-10-02') }),
      purchase({ invoiceNumber: 'otherAmount', totalAmount: 150, purchaseDate: pkt('2026-10-02') }),
    ]);
    const m = await entryGuard.findPossibleDuplicatePurchases(scope, { supplier: String(SUPPLIER), totalAmount: 100.2, purchaseDate: '2026-10-02' });
    expect(m.map((r) => r.number)).toEqual(['near']);
    expect(m[0].reason).toBe('same_amount');
  });

  test('editing: the purchase itself is excluded', async () => {
    const id = oidAt(7000);
    await Purchase.collection.insertMany([purchase({ _id: id, vendorBillNumber: 'B-1' })]);
    expect(await entryGuard.findPossibleDuplicatePurchases(scope, { supplier: String(SUPPLIER), vendorBillNumber: 'B-1', excludeId: String(id) })).toEqual([]);
  });
});

describe('findPossibleDuplicateInvoices', () => {
  test('same customer, amount and day (customerId stored as string or ObjectId)', async () => {
    await Invoice.collection.insertMany([
      invoice({ invoiceNumber: 'S-1' }),
      invoice({ invoiceNumber: 'S-2', customerId: String(CUSTOMER), invoiceDate: pkt('2026-10-01', '23:30') }),
      invoice({ invoiceNumber: 'nextDay', invoiceDate: pkt('2026-10-02', '00:30') }),
      invoice({ invoiceNumber: 'quote', type: 'quotation' }),
      invoice({ invoiceNumber: 'cancelled', status: 'cancelled' }),
    ]);
    const m = await entryGuard.findPossibleDuplicateInvoices(scope, { customerId: String(CUSTOMER), total: 100, invoiceDate: '2026-10-01' });
    expect(m.map((r) => r.number).sort()).toEqual(['S-1', 'S-2']);
  });

  test('walk-in: only checked for a sale dated another day', async () => {
    const today = toBusinessCalendarDate(new Date());
    await Invoice.collection.insertMany([
      invoice({ invoiceNumber: 'old', customerId: 'walk-in' }),
      invoice({ invoiceNumber: 'today', customerId: 'walk-in', invoiceDate: new Date() }),
    ]);
    expect(await entryGuard.findPossibleDuplicateInvoices(scope, { customerId: 'walk-in', total: 100, invoiceDate: today })).toEqual([]);
    const m = await entryGuard.findPossibleDuplicateInvoices(scope, { customerId: 'walk-in', total: 100, invoiceDate: '2026-10-01' });
    expect(m.map((r) => r.number)).toEqual(['old']);
  });
});
