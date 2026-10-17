const mongoose = require('mongoose');
const setupTestDB = require('../../utils/setupTestDB');
const { Product, Imei, StockAdjustment, Supplier, WarrantyClaim } = require('../../../src/models');
const claims = require('../../../src/services/warrantyClaim.service');
const stockAdjustmentService = require('../../../src/services/stockAdjustment.service');

setupTestDB();
jest.setTimeout(30000);

const ORG = new mongoose.Types.ObjectId();
const BRANCH = new mongoose.Types.ObjectId();
const USER = new mongoose.Types.ObjectId();
const scope = { organizationId: String(ORG), branchId: String(BRANCH) };
const DAY = 24 * 60 * 60 * 1000;

let phone;
let cable;
let supplier;
const unit = (imei, over = {}) =>
  Imei.create({ organizationId: ORG, branchId: BRANCH, type: 'serial', imei, productId: phone._id, productName: 'Phone X', purchasePrice: 500, status: 'in_stock', ...over });
const stockOf = async (p) => (await Product.findById(p._id)).stockQuantity;
const statusOf = async (imei) => (await Imei.findOne({ organizationId: ORG, imei })).status;

beforeEach(async () => {
  [phone, cable] = await Product.create([
    { organizationId: ORG, branchId: BRANCH, name: 'Phone X', price: 900, cost: 500, stockQuantity: 3, trackSerial: true, warrantyMonths: 12 },
    { organizationId: ORG, branchId: BRANCH, name: 'Cable', price: 100, cost: 50, stockQuantity: 10 },
  ]);
  supplier = await Supplier.create({ organizationId: ORG, branchId: BRANCH, name: 'Brand Service Center' });
  await unit('A1');
  await unit('A2');
  await unit('A3');
});

describe('stock claims — the shop\'s own faulty unit', () => {
  test('leaves stock at once, and is revived into stock when it comes back repaired', async () => {
    const c = await claims.createClaim(scope, { type: 'stock', productId: phone._id, serial: 'A1', problem: 'No display' }, USER);
    expect(c).toMatchObject({ status: 'received', ownership: 'shop', claimNumber: expect.stringMatching(/^WC-\d{4,}$/) });
    expect(await stockOf(phone)).toBe(2);
    expect(await statusOf('A1')).toBe('in_warranty');
    const out = await StockAdjustment.findOne({ warrantyClaimId: c._id });
    expect(out).toMatchObject({ type: 'warranty_out', direction: 'decrease', quantity: 1 });

    await claims.sendToSupplier(scope, c._id, { supplierId: supplier._id, reference: 'RMA-77' }, USER);
    const back = await claims.receiveBack(scope, c._id, { resolution: 'repaired' }, USER);
    // Back in stock = done: nothing to hand over for the shop's own unit.
    expect(back).toMatchObject({ status: 'closed', returnedTo: 'stock' });
    expect(await stockOf(phone)).toBe(3);
    expect(await statusOf('A1')).toBe('in_stock');
    expect(back.timeline.map((t) => t.action)).toEqual(['received', 'sent', 'returned']);
  });

  test('replaced: the new serial goes into stock, the old one is retired', async () => {
    const c = await claims.createClaim(scope, { type: 'stock', productId: phone._id, serial: 'A1', problem: 'Dead' }, USER);
    await claims.sendToSupplier(scope, c._id, { supplierName: 'Brand' }, USER);
    const back = await claims.receiveBack(scope, c._id, { resolution: 'replaced', replacementSerial: 'B9' }, USER);
    expect(back.serial).toBe('B9');
    expect(back.originalSerial).toBe('A1');
    expect(await statusOf('B9')).toBe('in_stock');
    expect(await statusOf('A1')).toBe('scrapped');
    expect(await stockOf(phone)).toBe(3);
    expect((await Imei.findOne({ imei: 'B9' })).purchasePrice).toBe(500);
  });

  test('credited: nothing comes back, the unit is written off', async () => {
    const c = await claims.createClaim(scope, { type: 'stock', productId: phone._id, serial: 'A2', problem: 'Water' }, USER);
    await claims.receiveBack(scope, c._id, { resolution: 'credited', creditAmount: 450 }, USER);
    expect(await stockOf(phone)).toBe(2);
    expect(await statusOf('A2')).toBe('scrapped');
  });

  test('a plain product by quantity', async () => {
    const c = await claims.createClaim(scope, { type: 'stock', productId: cable._id, quantity: 4, problem: 'Frayed' }, USER);
    expect(await stockOf(cable)).toBe(6);
    await claims.receiveBack(scope, c._id, { resolution: 'repaired' }, USER);
    expect(await stockOf(cable)).toBe(10);
  });

  test('cancel puts the unit back on the shelf', async () => {
    const c = await claims.createClaim(scope, { type: 'stock', productId: phone._id, serial: 'A3', problem: 'Oops' }, USER);
    await claims.cancelClaim(scope, c._id, { reason: 'Logged by mistake' }, USER);
    expect(await stockOf(phone)).toBe(3);
    expect(await statusOf('A3')).toBe('in_stock');
    expect((await WarrantyClaim.findById(c._id)).status).toBe('cancelled');
  });

  test('a sold unit cannot be a stock claim; one open claim per unit', async () => {
    await unit('S0', { status: 'sold' });
    await expect(claims.createClaim(scope, { type: 'stock', productId: phone._id, serial: 'S0', problem: 'x' }, USER)).rejects.toThrow('not in stock');
    await claims.createClaim(scope, { type: 'stock', productId: phone._id, serial: 'A1', problem: 'x' }, USER);
    await expect(claims.createClaim(scope, { type: 'customer', productId: phone._id, serial: 'A1', problem: 'x', customerName: 'Z' }, USER)).rejects.toThrow('open claim');
  });
});

describe('customer claims', () => {
  const sold = (imei, endInDays = 200) =>
    unit(imei, {
      status: 'sold',
      customerName: 'Ali',
      customerPhone: '0300',
      saleDate: new Date(Date.now() - 30 * DAY),
      warrantyMonths: 12,
      warrantyStartDate: new Date(Date.now() - 30 * DAY),
      warrantyEndDate: new Date(Date.now() + endInDays * DAY),
    });

  test('intake fills the customer and warranty from the sale; no stock moves', async () => {
    await sold('S1');
    const c = await claims.createClaim(scope, { type: 'customer', productId: phone._id, serial: 'S1', problem: 'Charging port' }, USER);
    expect(c).toMatchObject({ ownership: 'customer', customer: { name: 'Ali', phone: '0300' } });
    expect(c.warranty.status).toBe('in_warranty');
    expect(await stockOf(phone)).toBe(3);
    expect(await statusOf('S1')).toBe('sold');
  });

  test('an expired warranty is flagged at intake', async () => {
    await sold('S2', -5);
    const c = await claims.createClaim(scope, { type: 'customer', productId: phone._id, serial: 'S2', problem: 'x' }, USER);
    expect(c.warranty.status).toBe('expired');
  });

  test('replacement from stock now: customer gets a unit, the faulty one is revived into stock later', async () => {
    await sold('S3');
    const c = await claims.createClaim(scope, { type: 'customer', productId: phone._id, serial: 'S3', problem: 'Dead' }, USER);
    const swapped = await claims.giveReplacementFromStock(scope, c._id, { serial: 'A1' }, USER);
    expect(swapped.ownership).toBe('shop');
    expect(await stockOf(phone)).toBe(2);
    const given = await Imei.findOne({ imei: 'A1' });
    expect(given).toMatchObject({ status: 'sold', customerName: 'Ali' });
    expect(given.warrantyEndDate.getTime()).toBe(c.warranty.endDate.getTime());
    expect(await statusOf('S3')).toBe('in_warranty');

    await claims.receiveBack(scope, c._id, { resolution: 'repaired' }, USER);
    expect(await statusOf('S3')).toBe('in_stock');
    expect(await stockOf(phone)).toBe(3);
  });

  test('cancel after a replacement: the replacement goes back on the shelf, the faulty unit is the customer\'s again', async () => {
    await sold('S4');
    const c = await claims.createClaim(scope, { type: 'customer', productId: phone._id, serial: 'S4', problem: 'x' }, USER);
    await claims.giveReplacementFromStock(scope, c._id, { serial: 'A2' }, USER);
    await claims.cancelClaim(scope, c._id, {}, USER);
    expect(await stockOf(phone)).toBe(3);
    const a2 = await Imei.findOne({ imei: 'A2' });
    expect(a2).toMatchObject({ status: 'in_stock', customerName: '' });
    expect(await statusOf('S4')).toBe('sold');
  });

  test('replaced by the supplier, customer-owned: the new unit is the customer\'s, stock untouched', async () => {
    await sold('S5');
    const c = await claims.createClaim(scope, { type: 'customer', productId: phone._id, serial: 'S5', problem: 'x' }, USER);
    const back = await claims.receiveBack(scope, c._id, { resolution: 'replaced', replacementSerial: 'N5' }, USER);
    expect(back.returnedTo).toBe('customer');
    expect(await Imei.findOne({ imei: 'N5' })).toMatchObject({ status: 'sold', customerName: 'Ali' });
    expect(await statusOf('S5')).toBe('scrapped');
    expect(await stockOf(phone)).toBe(3);
  });
});

describe('warranty stock moves stay with their claim', () => {
  test('cannot be posted or reversed from Stock Adjustments', async () => {
    await expect(
      stockAdjustmentService.createAdjustment({ organizationId: ORG, branchId: BRANCH, productId: cable._id, type: 'warranty_out', quantity: 1, createdBy: USER })
    ).rejects.toThrow('warranty claim');
    const c = await claims.createClaim(scope, { type: 'stock', productId: cable._id, quantity: 1, problem: 'x' }, USER);
    await expect(
      stockAdjustmentService.reverseAdjustment({ adjustmentId: c.adjustments[0].adjustmentId, organizationId: ORG, reversedBy: USER })
    ).rejects.toThrow('cancel it from the claim');
  });

  test('a returned claim cannot be cancelled; a customer claim closes on hand-over', async () => {
    await Imei.create({ organizationId: ORG, branchId: BRANCH, type: 'serial', imei: 'S9', productId: phone._id, status: 'sold', customerName: 'Z' })
    const c = await claims.createClaim(scope, { type: 'customer', productId: phone._id, serial: 'S9', problem: 'x' }, USER);
    await expect(claims.closeClaim(scope, c._id, {}, USER)).rejects.toThrow('once the unit is back');
    const back = await claims.receiveBack(scope, c._id, { resolution: 'repaired' }, USER);
    expect(back.status).toBe('returned');
    await expect(claims.cancelClaim(scope, c._id, {}, USER)).rejects.toThrow('before the unit comes back');
    expect((await claims.closeClaim(scope, c._id, {}, USER)).status).toBe('closed');
  });

  test('picked dates keep a time of day; expected-back is the end of that day', async () => {
    const c = await claims.createClaim(scope, { type: 'stock', productId: cable._id, quantity: 1, problem: 'x', receivedAt: '2026-10-01' }, USER);
    const r = new Date(c.receivedAt);
    expect(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(r)).toBe('2026-10-01');
    expect(r.toISOString()).not.toBe('2026-09-30T19:00:00.000Z'); // not PKT midnight
    const sent = await claims.sendToSupplier(scope, c._id, { supplierName: 'X', expectedBackAt: '2026-12-01' }, USER);
    expect(new Date(sent.expectedBackAt).toISOString()).toBe('2026-12-01T18:59:59.999Z');
  });

  test('lookup by serial and stats', async () => {
    await claims.createClaim(scope, { type: 'stock', productId: phone._id, serial: 'A1', problem: 'x' }, USER);
    const found = await claims.lookupUnit(scope, 'A1');
    expect(found).toMatchObject({ found: true, unit: { status: 'in_warranty', productName: 'Phone X' }, openClaim: { claimNumber: expect.stringMatching(/^WC-\d{4,}$/) } });
    expect(await claims.lookupUnit(scope, 'NOPE')).toEqual({ found: false });
    const stats = await claims.getClaimStats(scope);
    expect(stats).toMatchObject({ received: 1, open: 1, shopUnitsAway: 1 });
  });
});
