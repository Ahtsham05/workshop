const mongoose = require('mongoose');
const setupTestDB = require('../utils/setupTestDB');
const {
  RepairJob,
  Product,
  CashBookEntry,
  StockAdjustment,
  Organization,
  RepairStockItem,
  User,
  Membership,
} = require('../../src/models');
const repairStockItemService = require('../../src/services/repairStockItem.service');
const repairJobService = require('../../src/services/repairJob.service');
const stockAdjustmentService = require('../../src/services/stockAdjustment.service');

/**
 * Repair tickets: parts come off the real shelf, every payment is its own cash book line,
 * cancel/delete put everything back, and a job saved before payments existed converts
 * without moving money.
 */
setupTestDB();
jest.setTimeout(60000);

const id = () => new mongoose.Types.ObjectId();
const ORG = id();
const BRANCH = id();
const scope = { organizationId: ORG, branchId: BRANCH };
const actor = { id: id(), name: 'Counter' };

const repairCash = async () => {
  const rows = await CashBookEntry.find({ organizationId: ORG, referenceModel: 'RepairJob' }).lean();
  const sum = (type, source) =>
    rows.filter((r) => r.type === type && (!source || r.source === source)).reduce((s, r) => s + r.amount, 0);
  return {
    rows,
    income: sum('income', 'repair'),
    refunds: sum('expense', 'repair'),
    partsBought: sum('expense', 'purchase'),
  };
};

const newJob = (extra = {}) =>
  repairJobService.createRepairJob(
    {
      organizationId: ORG,
      branchId: BRANCH,
      customerName: 'Ali',
      phone: '03001234567',
      deviceType: 'laptop',
      brand: 'Dell',
      deviceModel: 'Latitude 5490',
      serialNumber: 'SN-DELL-01',
      issue: 'No display',
      estimatedCharges: 5000,
      ...extra,
    },
    actor
  );

describe('repair job workflow', () => {
  test('intake numbers the job, posts the advance, and history finds it by serial', async () => {
    const job = await newJob({ advance: { amount: 1000, paymentMethod: 'cash' } });
    expect(job.jobNumber).toMatch(/^RJ-\d+$/);
    expect(job.status).toBe('pending');
    expect(job.charges).toBe(5000);
    expect(job.advanceAmount).toBe(1000);
    expect((await repairCash()).income).toBe(1000);

    const json = job.toJSON();
    expect(json.payments[0].id).toBeDefined();
    expect(json.payments[0]._id).toBeUndefined();

    const history = await repairJobService.lookupHistory(scope, { serial: 'sn-dell-01' });
    expect(history).toHaveLength(1);
    expect(history[0].sameDevice).toBe(true);
  });

  test('advance cannot exceed the estimate', async () => {
    await expect(newJob({ advance: { amount: 6000 } })).rejects.toThrow(/more than the estimated/);
  });

  test('a part from stock leaves the shelf, bills the job and comes back when removed', async () => {
    const screen = await Product.create({
      organizationId: ORG,
      branchId: BRANCH,
      name: 'Laptop screen 14"',
      price: 9000,
      cost: 6000,
      stockQuantity: 3,
    });
    let job = await newJob();
    job = await repairJobService.addItem(scope, job.id, { kind: 'part', productId: String(screen._id), quantity: 1 }, actor);
    job = await repairJobService.addItem(
      scope,
      job.id,
      { kind: 'service', name: 'Labour', quantity: 1, unitPrice: 1500 },
      actor
    );

    expect((await Product.findById(screen._id)).stockQuantity).toBe(2);
    expect(job.charges).toBe(10500); // items replace the estimate
    expect(job.cost).toBe(6000);
    const adj = await StockAdjustment.findOne({ repairJobId: job._id });
    expect(adj.type).toBe('repair_part');

    const part = job.items.find((i) => i.kind === 'part');
    job = await repairJobService.removeItem(scope, job.id, String(part._id), actor);
    expect((await Product.findById(screen._id)).stockQuantity).toBe(3);
    expect(job.charges).toBe(1500);
    expect(job.cost).toBe(0);
  });

  test('a repair-owned stock move cannot be reversed from Stock Adjustments', async () => {
    const p = await Product.create({
      organizationId: ORG,
      branchId: BRANCH,
      name: 'Battery',
      price: 2000,
      cost: 1200,
      stockQuantity: 5,
    });
    const job = await newJob();
    await repairJobService.addItem(scope, job.id, { kind: 'part', productId: String(p._id), quantity: 1 }, actor);
    const adj = await StockAdjustment.findOne({ repairJobId: job._id });
    await expect(
      stockAdjustmentService.reverseAdjustment({ adjustmentId: adj._id, organizationId: ORG, reversedBy: actor.id })
    ).rejects.toThrow(/remove it from the job/);
  });

  test('not enough stock refuses the part', async () => {
    const p = await Product.create({
      organizationId: ORG,
      branchId: BRANCH,
      name: 'Keyboard',
      price: 3000,
      cost: 2000,
      stockQuantity: 0,
    });
    const job = await newJob();
    await expect(
      repairJobService.addItem(scope, job.id, { kind: 'part', productId: String(p._id), quantity: 1 }, actor)
    ).rejects.toThrow(/Insufficient stock/);
  });

  test('an outside part paid from cash posts an expense, removing it reverses it', async () => {
    let job = await newJob();
    job = await repairJobService.addItem(
      scope,
      job.id,
      { kind: 'part', name: 'Hinge (market)', quantity: 2, unitCost: 400, unitPrice: 700, paidOutMethod: 'cash' },
      actor
    );
    expect((await repairCash()).partsBought).toBe(800);
    expect(job.charges).toBe(1400);
    expect(job.cost).toBe(800);
    job = await repairJobService.removeItem(scope, job.id, String(job.items[0]._id), actor);
    expect((await repairCash()).partsBought).toBe(0);
  });

  test('deliver needs the balance settled; collect & deliver does both and starts warranty', async () => {
    let job = await newJob({ advance: { amount: 2000, paymentMethod: 'cash' }, warrantyDays: 30 });
    job = await repairJobService.changeStatus(scope, job.id, { status: 'completed' }, actor);
    expect(job.outcome).toBe('repaired');
    await expect(repairJobService.changeStatus(scope, job.id, { status: 'delivered' }, actor)).rejects.toThrow(/still due/);
    await expect(repairJobService.addPayment(scope, job.id, { amount: 4000, paymentMethod: 'cash' }, actor)).rejects.toThrow(
      /Only 3000/
    );

    job = await repairJobService.addPayment(scope, job.id, { amount: 3000, paymentMethod: 'cash', deliver: true }, actor);
    expect(job.status).toBe('delivered');
    expect(job.advanceAmount).toBe(5000);
    expect(job.warrantyUntil).toBeTruthy();
    const cash = await repairCash();
    expect(cash.income).toBe(5000);
    expect(cash.rows.filter((r) => r.type === 'income')).toHaveLength(2); // one line per payment
  });

  test('cancelling returns parts to stock and bills only the fee; refund posts money out', async () => {
    const p = await Product.create({
      organizationId: ORG,
      branchId: BRANCH,
      name: 'RAM 8GB',
      price: 6000,
      cost: 4500,
      stockQuantity: 2,
    });
    let job = await newJob({ advance: { amount: 1000, paymentMethod: 'cash' } });
    job = await repairJobService.addItem(scope, job.id, { kind: 'part', productId: String(p._id), quantity: 1 }, actor);
    job = await repairJobService.changeStatus(
      scope,
      job.id,
      { status: 'cancelled', fee: 300, cancelReason: 'Customer declined' },
      actor
    );
    expect((await Product.findById(p._id)).stockQuantity).toBe(2);
    expect(job.charges).toBe(300);
    expect(job.items).toHaveLength(1);

    job = await repairJobService.addPayment(scope, job.id, { amount: 700, kind: 'refund', paymentMethod: 'cash' }, actor);
    expect(job.advanceAmount).toBe(300);
    const cash = await repairCash();
    expect(cash.income - cash.refunds).toBe(300);
  });

  test('deleting a job reverses stock, payments and expenses', async () => {
    const p = await Product.create({
      organizationId: ORG,
      branchId: BRANCH,
      name: 'Fan',
      price: 2500,
      cost: 1500,
      stockQuantity: 4,
    });
    let job = await newJob({ advance: { amount: 500, paymentMethod: 'cash' } });
    job = await repairJobService.addItem(scope, job.id, { kind: 'part', productId: String(p._id), quantity: 2 }, actor);
    job = await repairJobService.addItem(
      scope,
      job.id,
      { kind: 'part', name: 'Paste', quantity: 1, unitCost: 200, unitPrice: 400, paidOutMethod: 'cash' },
      actor
    );
    expect((await Product.findById(p._id)).stockQuantity).toBe(2);
    await repairJobService.deleteRepairJob(scope, job.id, actor);
    expect((await Product.findById(p._id)).stockQuantity).toBe(4);
    expect((await repairCash()).rows).toHaveLength(0);
    expect(await RepairJob.countDocuments()).toBe(0);
  });

  test('a legacy completed job converts without moving money', async () => {
    // What the old code saved: charges posted as one line keyed by the job id.
    const legacy = await RepairJob.create({
      organizationId: ORG,
      branchId: BRANCH,
      customerName: 'Old',
      deviceModel: 'Samsung A54',
      issue: 'Screen',
      status: 'completed',
      charges: 4000,
      advanceAmount: 1000,
      cost: 2500,
      paymentMethod: 'cash',
    });
    await CashBookEntry.create({
      organizationId: ORG,
      branchId: BRANCH,
      type: 'income',
      source: 'repair',
      amount: 4000,
      paymentMethod: 'cash',
      referenceId: legacy._id,
      referenceModel: 'RepairJob',
      description: 'Repair',
      date: new Date(),
    });

    const job = await repairJobService.addNote(scope, String(legacy._id), { note: 'Called customer' }, actor);
    expect(job.paymentsVersion).toBe(2);
    expect(job.charges).toBe(4000);
    expect(job.cost).toBe(2500);
    expect(job.advanceAmount).toBe(4000);
    expect(job.payments[0].legacy).toBe(true);
    expect((await repairCash()).income).toBe(4000);

    // Undoing that legacy payment takes the original line away.
    await repairJobService.removePayment(scope, String(legacy._id), String(job.payments[0]._id), actor);
    expect((await repairCash()).income).toBe(0);
  });

  test('editing a line: cost on labour, re-posted outside part, stock part locked', async () => {
    const p = await Product.create({
      organizationId: ORG,
      branchId: BRANCH,
      name: 'Glass',
      price: 1000,
      cost: 600,
      stockQuantity: 3,
    });
    let job = await newJob();
    job = await repairJobService.addItem(
      scope,
      job.id,
      { kind: 'service', name: 'Labour', quantity: 1, unitPrice: 2000 },
      actor
    );
    job = await repairJobService.addItem(
      scope,
      job.id,
      { kind: 'part', name: 'Flex', quantity: 1, unitCost: 300, unitPrice: 800, paidOutMethod: 'cash' },
      actor
    );
    job = await repairJobService.addItem(scope, job.id, { kind: 'part', productId: String(p._id), quantity: 1 }, actor);
    const [labour, flex, glass] = job.items;

    job = await repairJobService.updateItem(scope, job.id, String(labour._id), { unitCost: 250 }, actor);
    job = await repairJobService.updateItem(scope, job.id, String(flex._id), { unitCost: 450, quantity: 2 }, actor);
    expect(job.cost).toBe(250 + 900 + 600);
    expect(job.charges).toBe(2000 + 1600 + 1000);
    expect((await repairCash()).partsBought).toBe(900);

    job = await repairJobService.updateItem(scope, job.id, String(glass._id), { unitPrice: 1200 }, actor);
    expect(job.charges).toBe(2000 + 1600 + 1200);
    await expect(repairJobService.updateItem(scope, job.id, String(glass._id), { quantity: 2 }, actor)).rejects.toThrow(
      /come from inventory/
    );
  });

  test('repair part categories are saved per organization, trimmed and de-duplicated', async () => {
    await Organization.collection.insertOne({ _id: ORG, name: 'Shop' });
    expect(await repairJobService.getSettings(ORG)).toEqual({ partCategories: [] });
    await repairJobService.updateSettings(ORG, { partCategories: [' Displays ', 'Batteries', 'Displays', ''] });
    expect(await repairJobService.getSettings(ORG)).toEqual({ partCategories: ['Displays', 'Batteries'] });
  });

  test('direct repair cost is taken from the repair stock balance and follows the job', async () => {
    await repairStockItemService.createPurchaseEntry({
      organizationId: ORG,
      branchId: BRANCH,
      description: 'Parts lot',
      amount: 5000,
      paymentMethod: 'cash',
    });
    let job = await newJob();
    job = await repairJobService.updateRepairJob(scope, job.id, { directCost: 1200 }, actor);
    expect(job.cost).toBe(1200);
    expect(job.charges).toBe(5000);
    let summary = await repairStockItemService.getLedgerSummary({ organizationId: String(ORG), branchId: String(BRANCH) });
    expect(summary.balance).toBe(3800);

    job = await repairJobService.addItem(
      scope,
      job.id,
      { kind: 'service', name: 'Labour', quantity: 1, unitPrice: 6000, unitCost: 100 },
      actor
    );
    expect(job.cost).toBe(1300);
    job = await repairJobService.updateRepairJob(scope, job.id, { directCost: 1500 }, actor);
    expect(await RepairStockItem.countDocuments({ repairJobId: job._id })).toBe(1);
    summary = await repairStockItemService.getLedgerSummary({ organizationId: String(ORG), branchId: String(BRANCH) });
    expect(summary.balance).toBe(3500);

    const usage = await RepairStockItem.findOne({ repairJobId: job._id });
    await expect(repairStockItemService.deleteEntry(usage._id, { organizationId: ORG })).rejects.toThrow(
      /belongs to a repair job/
    );

    await repairJobService.deleteRepairJob(scope, job.id, actor);
    summary = await repairStockItemService.getLedgerSummary({ organizationId: String(ORG), branchId: String(BRANCH) });
    expect(summary.balance).toBe(5000);
  });

  test('cancelling a job returns its direct repair cost', async () => {
    let job = await newJob();
    job = await repairJobService.updateRepairJob(scope, job.id, { directCost: 700 }, actor);
    job = await repairJobService.changeStatus(scope, job.id, { status: 'cancelled' }, actor);
    expect(job.cost).toBe(0);
    expect(await RepairStockItem.countDocuments({ repairJobId: job._id })).toBe(0);
  });

  test('saving the bill in one go: stock moves only on save, one timeline entry, rollback on failure', async () => {
    const screen = await Product.create({
      organizationId: ORG,
      branchId: BRANCH,
      name: 'Screen',
      price: 9000,
      cost: 6000,
      stockQuantity: 2,
    });
    const port = await Product.create({
      organizationId: ORG,
      branchId: BRANCH,
      name: 'Port',
      price: 900,
      cost: 300,
      stockQuantity: 1,
    });
    let job = await newJob();
    const before = job.timeline.length;
    job = await repairJobService.saveBill(
      scope,
      job.id,
      {
        add: [
          { kind: 'part', productId: String(screen._id), quantity: 1, unitPrice: 9500 },
          { kind: 'service', name: 'Labour', quantity: 1, unitPrice: 1500, unitCost: 200 },
          { kind: 'part', name: 'Flex', quantity: 1, unitCost: 300, unitPrice: 800, paidOutMethod: 'cash' },
        ],
        discount: 300,
        directCost: 100,
      },
      actor
    );
    expect(job.items).toHaveLength(3);
    expect(job.charges).toBe(9500 + 1500 + 800 - 300);
    expect(job.cost).toBe(6000 + 200 + 300 + 100);
    expect((await Product.findById(screen._id)).stockQuantity).toBe(1);
    expect((await repairCash()).partsBought).toBe(300);
    expect(job.timeline.length).toBe(before + 1);

    // change + remove in the same save
    const labour = job.items.find((i) => i.name === 'Labour');
    const scr = job.items.find((i) => i.name === 'Screen');
    job = await repairJobService.saveBill(
      scope,
      job.id,
      { update: [{ itemId: String(labour._id), unitPrice: 2000 }], remove: [String(scr._id)] },
      actor
    );
    expect(job.items).toHaveLength(2);
    expect((await Product.findById(screen._id)).stockQuantity).toBe(2);

    // a batch where the second stock line can't be filled leaves stock untouched
    await expect(
      repairJobService.saveBill(
        scope,
        job.id,
        {
          add: [
            { kind: 'part', productId: String(screen._id), quantity: 1 },
            { kind: 'part', productId: String(port._id), quantity: 5 },
          ],
        },
        actor
      )
    ).rejects.toThrow(/Insufficient stock/);
    expect((await Product.findById(screen._id)).stockQuantity).toBe(2);
    expect((await Product.findById(port._id)).stockQuantity).toBe(1);
    expect((await RepairJob.findById(job.id)).items).toHaveLength(2);
  });

  test('technicians: branch staff first, typed names merged case-insensitively', async () => {
    const tech = await User.collection.insertOne({ name: 'Bilal', email: 'b@x.com', organizationId: ORG, isActive: true });
    await User.collection.insertOne({ name: 'Other Branch Guy', email: 'o@x.com', organizationId: ORG, isActive: true });
    await Membership.collection.insertOne({
      userId: tech.insertedId,
      organizationId: ORG,
      branchId: BRANCH,
      isActive: true,
    });
    for (const t of ['ABD', 'abd', ' abd ', 'bilal', 'Kashif']) {
      // eslint-disable-next-line no-await-in-loop
      await newJob({ technician: t });
    }
    const list = await repairJobService.getTechnicians(scope);
    expect(list.map((t) => t.name)).toEqual(['Bilal', expect.stringMatching(/^abd$/i), 'Kashif']);
    expect(list[0].source).toBe('staff');
    expect(list[1].jobs).toBe(3);
  });

  test('another organization cannot read a job', async () => {
    const job = await newJob();
    await expect(repairJobService.getRepairJobById({ organizationId: id() }, job.id)).rejects.toThrow(/not found/);
  });

  test('stats count open, ready and outstanding', async () => {
    const a = await newJob();
    await repairJobService.changeStatus(scope, a.id, { status: 'completed' }, actor);
    await newJob({ dueDate: new Date(Date.now() - 86400000) });
    const stats = await repairJobService.getStats(scope);
    expect(stats.total).toBe(2);
    expect(stats.readyForPickup).toBe(1);
    expect(stats.open).toBe(1);
    expect(stats.overdue).toBe(1);
    expect(stats.outstanding).toBe(5000);
  });
});
