const setupTestDB = require('../utils/setupTestDB');
const mongoose = require('mongoose');
const { Invoice, Purchase } = require('../../src/models');
const documentNumberingService = require('../../src/services/documentNumbering.service');
const { insertOrganization } = require('../fixtures/tax.fixture');

// documentNumbering.service.js doesn't use MongoDB transactions, so unlike Sales/Purchase
// creation this can run end-to-end here (see setupTestDB.js for why transactional services
// are out of reach in this in-memory, non-replica-set harness).
setupTestDB();
jest.setTimeout(30000);

const minimalInvoice = (overrides) => ({
  branchId: new mongoose.Types.ObjectId(),
  type: 'cash',
  items: [],
  subtotal: 0,
  total: 0,
  totalCost: 0,
  totalProfit: 0,
  ...overrides,
});

// ensureNumberingIndexes memoizes per docType at the module level (deliberately — checking
// indexes on every single call would be wasteful in production) so the legacy-index-drop
// path only ever runs once per process. These two tests must be the FIRST to touch their
// docType in this file, or a later test's earlier call would have already flipped the memo
// and short-circuited before this test's simulated legacy index even existed.
describe('documentNumbering.service — legacy global unique index migration', () => {
  test('migrates Invoice\'s legacy global unique index to a per-organization compound index, and generation still works after', async () => {
    const collection = mongoose.connection.collection('invoices');
    await collection.createIndex({ invoiceNumber: 1 }, { unique: true, name: 'invoiceNumber_1' });
    expect((await collection.indexes()).some((idx) => idx.name === 'invoiceNumber_1')).toBe(true);

    const org = await insertOrganization();
    const number = await documentNumberingService.generateNextNumber({ organizationId: org._id, docType: 'invoice' });
    expect(number).toMatch(/^INV-/);

    const indexesAfter = await collection.indexes();
    expect(indexesAfter.some((idx) => idx.name === 'invoiceNumber_1')).toBe(false);
    expect(
      indexesAfter.some((idx) => idx.unique && idx.key.organizationId === 1 && idx.key.invoiceNumber === 1)
    ).toBe(true);
  });

  test('after migration, two different orgs CAN share the same manually-typed invoiceNumber (previously would collide globally)', async () => {
    const orgA = await insertOrganization({ name: 'Org A' });
    const orgB = await insertOrganization({ name: 'Org B' });

    await Invoice.create(minimalInvoice({ organizationId: orgA._id, invoiceNumber: 'CUSTOM-001' }));
    await expect(
      Invoice.create(minimalInvoice({ organizationId: orgB._id, invoiceNumber: 'CUSTOM-001' }))
    ).resolves.toBeTruthy(); // different org, same number — no collision

    await expect(
      Invoice.create(minimalInvoice({ organizationId: orgA._id, invoiceNumber: 'CUSTOM-001' }))
    ).rejects.toThrow(); // same org, same number — still rejected
  });

  test('migrates Purchase\'s legacy global unique index the same way, and cross-org sharing works', async () => {
    const collection = mongoose.connection.collection('purchases');
    await collection.createIndex({ invoiceNumber: 1 }, { unique: true, name: 'invoiceNumber_1' });

    const orgA = await insertOrganization({ name: 'Org A' });
    const orgB = await insertOrganization({ name: 'Org B' });
    const number = await documentNumberingService.generateNextNumber({ organizationId: orgA._id, docType: 'purchase' });
    expect(number).toMatch(/^PUR-/);

    const indexesAfter = await collection.indexes();
    expect(indexesAfter.some((idx) => idx.name === 'invoiceNumber_1')).toBe(false);
    expect(
      indexesAfter.some((idx) => idx.unique && idx.key.organizationId === 1 && idx.key.invoiceNumber === 1)
    ).toBe(true);

    const basePurchase = {
      branchId: new mongoose.Types.ObjectId(),
      supplier: new mongoose.Types.ObjectId(),
      items: [],
      totalAmount: 100,
      invoiceNumber: 'PCUSTOM-001',
    };
    await Purchase.create({ organizationId: orgA._id, ...basePurchase });
    await expect(Purchase.create({ organizationId: orgB._id, ...basePurchase })).resolves.toBeTruthy();
  });
});

describe('documentNumbering.service — per-organization customizable numbering', () => {
  test('generates a sequential, correctly-formatted number matching today\'s default INV-YYYYMM-NNNNNN output', async () => {
    const org = await insertOrganization();
    const now = new Date();
    const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

    const first = await documentNumberingService.generateNextNumber({ organizationId: org._id, docType: 'invoice' });
    const second = await documentNumberingService.generateNextNumber({ organizationId: org._id, docType: 'invoice' });

    expect(first).toBe(`INV-${yyyymm}-000001`);
    expect(second).toBe(`INV-${yyyymm}-000002`);
  });

  test('Purchase defaults to the new PUR- prefix, starting at 1, no date segment', async () => {
    const org = await insertOrganization();
    const number = await documentNumberingService.generateNextNumber({ organizationId: org._id, docType: 'purchase' });
    expect(number).toBe('PUR-000001');
  });

  test('Invoice and Quotation are independent sequences sharing the same collection', async () => {
    const org = await insertOrganization();
    const inv1 = await documentNumberingService.generateNextNumber({ organizationId: org._id, docType: 'invoice' });
    const quo1 = await documentNumberingService.generateNextNumber({ organizationId: org._id, docType: 'quotation' });
    const inv2 = await documentNumberingService.generateNextNumber({ organizationId: org._id, docType: 'invoice' });

    expect(inv1).toMatch(/^INV-/);
    expect(quo1).toMatch(/^QUO-/);
    expect(inv1.endsWith('000001')).toBe(true);
    expect(quo1.endsWith('000001')).toBe(true); // its own independent counter, not sharing Invoice's
    expect(inv2.endsWith('000002')).toBe(true);
  });

  test('two different organizations legitimately get identical numbers with zero collision (the core bug being fixed)', async () => {
    const orgA = await insertOrganization({ name: 'Org A' });
    const orgB = await insertOrganization({ name: 'Org B' });

    const numberA = await documentNumberingService.generateNextNumber({ organizationId: orgA._id, docType: 'invoice' });
    const numberB = await documentNumberingService.generateNextNumber({ organizationId: orgB._id, docType: 'invoice' });

    expect(numberA).toBe(numberB); // same string, different orgs — must not throw/collide
  });

  test('heavy activity in one org never affects another org\'s sequence', async () => {
    const orgA = await insertOrganization({ name: 'Org A' });
    const orgB = await insertOrganization({ name: 'Org B' });

    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await documentNumberingService.generateNextNumber({ organizationId: orgA._id, docType: 'invoice' });
    }
    const numberB = await documentNumberingService.generateNextNumber({ organizationId: orgB._id, docType: 'invoice' });
    expect(numberB.endsWith('000001')).toBe(true);
  });

  test('concurrent generation for the same org produces distinct, gapless sequential numbers — no E11000s, no duplicates', async () => {
    const org = await insertOrganization();
    const results = await Promise.all(
      Array.from({ length: 15 }, () => documentNumberingService.generateNextNumber({ organizationId: org._id, docType: 'purchase' }))
    );
    const seqs = results.map((n) => parseInt(n.match(/(\d+)$/)[1], 10)).sort((a, b) => a - b);
    expect(new Set(seqs).size).toBe(15); // all distinct
    expect(seqs).toEqual(Array.from({ length: 15 }, (_, i) => i + 1)); // 1..15, no gaps
  });

  test('lazy counter seeding picks up pre-existing historical numbers instead of restarting at 1', async () => {
    const org = await insertOrganization();
    const now = new Date();
    const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    // Simulate data that existed before this org ever used the new atomic generator (e.g.
    // migrated from the old global scheme, or entered manually).
    await Invoice.create(minimalInvoice({ organizationId: org._id, invoiceNumber: `INV-${yyyymm}-000050` }));

    const next = await documentNumberingService.generateNextNumber({ organizationId: org._id, docType: 'invoice' });
    expect(next).toBe(`INV-${yyyymm}-000051`);
  });

  test('peekNextNumber never mutates the real counter', async () => {
    const org = await insertOrganization();
    const peek1 = await documentNumberingService.peekNextNumber({ organizationId: org._id, docType: 'invoice' });
    const peek2 = await documentNumberingService.peekNextNumber({ organizationId: org._id, docType: 'invoice' });
    expect(peek1.preview).toBe(peek2.preview);

    const real = await documentNumberingService.generateNextNumber({ organizationId: org._id, docType: 'invoice' });
    expect(real).toBe(peek1.preview); // the peeked value is exactly what gets minted next
  });

  test('peekNextNumber previews a draft (unsaved) config without touching the org\'s real persisted config', async () => {
    const org = await insertOrganization();
    const draft = await documentNumberingService.peekNextNumber({
      organizationId: org._id,
      docType: 'invoice',
      config: { prefix: 'SALE', separator: '/', dateSegment: 'none', resetPeriod: 'never', padding: 4, startingNumber: 1 },
    });
    expect(draft.preview).toBe('SALE/0001');

    const realPreview = await documentNumberingService.peekNextNumber({ organizationId: org._id, docType: 'invoice' });
    expect(realPreview.preview).toMatch(/^INV-/); // unaffected by the draft peek above
  });

  test('setNextNumber rejects a value that would collide with an already-issued number', async () => {
    const org = await insertOrganization();
    await documentNumberingService.generateNextNumber({ organizationId: org._id, docType: 'purchase' }); // PUR-000001
    await documentNumberingService.generateNextNumber({ organizationId: org._id, docType: 'purchase' }); // PUR-000002

    await expect(
      documentNumberingService.setNextNumber({ organizationId: org._id, docType: 'purchase', nextNumber: 2 })
    ).rejects.toThrow(/greater than the current highest/);
  });

  test('setNextNumber resumes/skips the sequence forward and the next real generate picks it up exactly', async () => {
    const org = await insertOrganization();
    await documentNumberingService.generateNextNumber({ organizationId: org._id, docType: 'purchase' }); // PUR-000001

    const result = await documentNumberingService.setNextNumber({ organizationId: org._id, docType: 'purchase', nextNumber: 5000 });
    expect(result.preview).toBe('PUR-005000');

    const next = await documentNumberingService.generateNextNumber({ organizationId: org._id, docType: 'purchase' });
    expect(next).toBe('PUR-005000');
  });

  test('rejects an inconsistent config where resetPeriod is more frequent than dateSegment', async () => {
    const org = await insertOrganization();
    await expect(
      documentNumberingService.peekNextNumber({
        organizationId: org._id,
        docType: 'invoice',
        config: { prefix: 'INV', separator: '-', dateSegment: 'yearly', resetPeriod: 'monthly', padding: 6, startingNumber: 1 },
      })
    ).rejects.toThrow(/Reset period cannot be more frequent/);
  });
});
