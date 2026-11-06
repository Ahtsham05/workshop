const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { ProductionOrder, MaterialIssue } = require('../../src/models');
const { execution } = require('../../src/services/manufacturing');

/**
 * Material issue vouchers carry the finished good their order makes (read live from the
 * order, so vouchers posted before this existed show it too), and searching a finished
 * good's name finds its vouchers.
 */
let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
jest.setTimeout(60000);

const id = () => new mongoose.Types.ObjectId();
const ORG = id();
const BRANCH = id();
const ctx = { organizationId: ORG, branchId: String(BRANCH) };

const insertOrder = async (orderNumber, productName, extra = {}) => {
  const doc = {
    _id: id(),
    organizationId: ORG,
    branchId: BRANCH,
    orderNumber,
    productId: id(),
    productName,
    sku: `SKU-${orderNumber}`,
    unit: 'kg',
    plannedQuantity: 500,
    batchNumber: `B-${orderNumber}`,
    orderType: 'production',
    status: 'in_production',
    materials: [],
    ...extra,
  };
  await ProductionOrder.collection.insertOne(doc);
  return doc;
};
const insertIssue = async (issueNumber, order, materialName) => {
  const doc = {
    _id: id(),
    organizationId: ORG,
    branchId: BRANCH,
    issueNumber,
    kind: 'issue',
    productionOrderId: order._id,
    orderNumber: order.orderNumber,
    issueDate: new Date(),
    lines: [{ materialLineId: id(), productId: id(), productName: materialName, unit: 'kg', quantity: 5, creditedQuantity: 5 }],
    totalCost: 5,
    createdAt: new Date(),
  };
  await MaterialIssue.collection.insertOne(doc);
  return doc;
};

test('list and detail show the finished good; search finds vouchers by finished good', async () => {
  const mash = await insertOrder('MO-1', 'CALCIUM 1000 MASH');
  const vit = await insertOrder('MO-2', 'VITAMIN PREMIX', { orderType: 'assembly' });
  const a = await insertIssue('MIV-1', mash, 'STARCH');
  await insertIssue('MIV-2', vit, 'DCP');

  const page = await execution.queryIssues(ctx, { status: 'posted' }, { limit: 10 });
  expect(page.totalResults).toBe(2);
  const byNo = Object.fromEntries(page.results.map((r) => [r.issueNumber, r]));
  expect(byNo['MIV-1'].finishedGood).toMatchObject({
    productName: 'CALCIUM 1000 MASH',
    sku: 'SKU-MO-1',
    unit: 'kg',
    plannedQuantity: 500,
    batchNumber: 'B-MO-1',
    orderType: 'production',
  });
  expect(byNo['MIV-2'].finishedGood.orderType).toBe('assembly');
  expect(byNo['MIV-1'].id).toBeDefined(); // still serialised like before

  const found = await execution.queryIssues(ctx, { search: 'calcium' }, {});
  expect(found.results.map((r) => r.issueNumber)).toEqual(['MIV-1']);
  // Material-name search still works.
  const byMaterial = await execution.queryIssues(ctx, { search: 'dcp' }, {});
  expect(byMaterial.results.map((r) => r.issueNumber)).toEqual(['MIV-2']);

  const one = await execution.getIssue(ctx, a._id);
  expect(one.finishedGood.productName).toBe('CALCIUM 1000 MASH');

  // Another org's order with the same name is never matched.
  const other = { organizationId: id(), branchId: String(BRANCH) };
  expect((await execution.queryIssues(other, { search: 'calcium' }, {})).totalResults).toBe(0);
});
