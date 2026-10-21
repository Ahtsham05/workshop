const {
  hideCostPrices,
  hideManufacturingCosts,
  stripCostFromBody,
  deepStrip,
  isCostKey,
} = require('../../../src/middlewares/costVisibility');
const { normalizeOperations } = require('../../../src/services/manufacturing/bom.service');

const roleWith = (permissions) => ({ role: { permissions } });

/** Runs a router-level middleware and returns what res.json would have sent. */
const respond = async (middleware, { user, path = '/', method = 'GET', body } = {}, payload) => {
  const req = { user, path, method, body };
  let sent;
  const res = {
    json: (b) => {
      sent = b;
      return b;
    },
  };
  await middleware(req, res, () => {});
  res.json(payload);
  return { sent, req };
};

describe('viewCostPrices', () => {
  const product = {
    name: 'Cable',
    price: 500,
    cost: 320,
    variantPriceRange: { minPrice: 450, maxPrice: 550, minCost: 300, maxCost: 340 },
    batches: [{ batchNumber: 'B1', quantity: 4, costPerUnit: 310 }],
    totalProfit: 900,
    marginPercent: 36,
    costMethod: 'fifo',
  };

  test('a role without it gets no cost, profit or margin — sale prices stay', async () => {
    const { sent } = await respond(hideCostPrices(), { user: roleWith({ viewProducts: true }) }, product);
    expect(sent).toEqual({
      name: 'Cable',
      price: 500,
      variantPriceRange: { minPrice: 450, maxPrice: 550 },
      batches: [{ batchNumber: 'B1', quantity: 4 }],
      costMethod: 'fifo',
    });
  });

  test('a role with it, and the owner, get everything', async () => {
    expect((await respond(hideCostPrices(), { user: roleWith({ viewCostPrices: true }) }, product)).sent).toEqual(product);
    expect((await respond(hideCostPrices(), { user: { systemRole: 'superAdmin' } }, product)).sent).toEqual(product);
  });

  test('stock movements also lose value / amount (they are valued at cost)', async () => {
    const transfer = { quantity: 5, unitCost: 10, totalAmount: 50, totals: { quantity: 5, amount: 50 } };
    const { sent } = await respond(hideCostPrices({ stockValued: true }), { user: roleWith({}) }, transfer);
    expect(sent).toEqual({ quantity: 5, totals: { quantity: 5 } });
  });

  test('writes from such a role cannot set a cost, even as a multipart string', () => {
    const req = { user: roleWith({ editProducts: true }), body: { name: 'Cable', price: '500', cost: '0' } };
    stripCostFromBody(req);
    expect(req.body).toEqual({ name: 'Cable', price: '500' });
  });

  test('string values are never touched', () => {
    expect(deepStrip({ options: [{ label: 'Cost', value: 'cost' }], cost: 'n/a' }, isCostKey)).toEqual({
      options: [{ label: 'Cost', value: 'cost' }],
      cost: 'n/a',
    });
  });
});

describe('viewManufacturingCosts', () => {
  const production = roleWith({ viewManufacturing: true, executeProduction: true });

  test('costs, values and prices go; quantities, counts and option ids stay', async () => {
    const payload = {
      kpis: { wipValue: { value: 1200, orders: 3 }, unitsProduced: { quantity: 40, value: 9000 } },
      lines: [{ productName: 'Stator', quantity: 2, unitCost: 15, totalCost: 30, rate: 15 }],
      statuses: [{ label: 'Released', value: 'released' }],
    };
    const { sent } = await respond(hideManufacturingCosts(), { user: production, path: '/wip' }, payload);
    expect(sent).toEqual({
      kpis: { wipValue: { orders: 3 }, unitsProduced: { quantity: 40 } },
      lines: [{ productName: 'Stator', quantity: 2 }],
      statuses: [{ label: 'Released', value: 'released' }],
    });
  });

  test('report columns that are money under an irregular name go too', async () => {
    const day = { date: '2026-10-21', planned: 10, issued: 500, consumed: 400, wipBalance: 100, good: 8 };
    const { sent } = await respond(
      hideManufacturingCosts(),
      { user: production, path: '/reports/daily' },
      { days: [day], openingWip: 50 }
    );
    expect(sent).toEqual({ days: [{ date: '2026-10-21', planned: 10, good: 8 }] });
    // …but `issued` is a quantity elsewhere and stays.
    const other = await respond(hideManufacturingCosts(), { user: production, path: '/production-orders' }, { issued: 5 });
    expect(other.sent).toEqual({ issued: 5 });
  });

  test('a manager with the permission sees every figure', async () => {
    const payload = { wipValue: { value: 1200, orders: 3 } };
    const { sent } = await respond(
      hideManufacturingCosts(),
      { user: roleWith({ viewManufacturingCosts: true }), path: '/wip' },
      payload
    );
    expect(sent).toEqual(payload);
  });

  test('saving a routing without its hidden rate keeps the rate', () => {
    const previous = [
      { _id: 'op1', name: 'Cutting', costPerHour: 400 },
      { _id: 'op2', name: 'Welding', costPerHour: 650 },
    ];
    const ops = normalizeOperations(
      [{ _id: 'op1', name: 'Cutting', setupMinutes: 5 }, { name: 'Welding', runMinutesPerUnit: 2 }, { name: 'Painting' }],
      previous
    );
    expect(ops.map((o) => o.costPerHour)).toEqual([400, 650, 0]);
    // A role that may see costs can still change or clear a rate explicitly.
    expect(normalizeOperations([{ _id: 'op1', name: 'Cutting', costPerHour: 0 }], previous)[0].costPerHour).toBe(0);
  });
});
