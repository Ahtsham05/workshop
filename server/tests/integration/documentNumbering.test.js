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
describe('documentNumbering.service — legacy unique index migration', () => {
  test('migrates Invoice\'s legacy index (global or org-scoped) up to a {organizationId, branchId, invoiceNumber} compound index', async () => {
    const collection = mongoose.connection.collection('invoices');
    // Simulate a deploy that already ran the FIRST migration (org-scoped, 2-field) — the
    // shape this exact codebase shipped moments before branch-scoping was added.
    await collection.createIndex({ organizationId: 1, invoiceNumber: 1 }, { unique: true, name: 'organizationId_1_invoiceNumber_1' });
    expect((await collection.indexes()).some((idx) => idx.name === 'organizationId_1_invoiceNumber_1')).toBe(true);

    const org = await insertOrganization();
    const number = await documentNumberingService.generateNextNumber({ organizationId: org._id, docType: 'invoice' });
    expect(number).toMatch(/^INV-/);

    const indexesAfter = await collection.indexes();
    expect(indexesAfter.some((idx) => idx.name === 'organizationId_1_invoiceNumber_1')).toBe(false);
    expect(
      indexesAfter.some(
        (idx) => idx.unique && idx.key.organizationId === 1 && idx.key.branchId === 1 && idx.key.invoiceNumber === 1
      )
    ).toBe(true);
  });

  test('DB-level: same org + same branch + same number is rejected; same org + DIFFERENT branch + same number is now allowed (branch-scoped index)', async () => {
    const org = await insertOrganization();
    const branchA = new mongoose.Types.ObjectId();
    const branchB = new mongoose.Types.ObjectId();

    await Invoice.create(minimalInvoice({ organizationId: org._id, branchId: branchA, invoiceNumber: 'CUSTOM-001' }));
    await expect(
      Invoice.create(minimalInvoice({ organizationId: org._id, branchId: branchA, invoiceNumber: 'CUSTOM-001' }))
    ).rejects.toThrow(); // same org, same branch, same number — still rejected

    await expect(
      Invoice.create(minimalInvoice({ organizationId: org._id, branchId: branchB, invoiceNumber: 'CUSTOM-001' }))
    ).resolves.toBeTruthy(); // same org, different branch — DB alone no longer blocks this
  });

  test('two different organizations CAN share the same manually-typed invoiceNumber (the original multi-tenant bug)', async () => {
    const orgA = await insertOrganization({ name: 'Org A' });
    const orgB = await insertOrganization({ name: 'Org B' });

    await Invoice.create(minimalInvoice({ organizationId: orgA._id, invoiceNumber: 'CUSTOM-002' }));
    await expect(
      Invoice.create(minimalInvoice({ organizationId: orgB._id, invoiceNumber: 'CUSTOM-002' }))
    ).resolves.toBeTruthy();
  });

  test('migrates Purchase\'s legacy index the same way', async () => {
    const collection = mongoose.connection.collection('purchases');
    await collection.createIndex({ invoiceNumber: 1 }, { unique: true, name: 'invoiceNumber_1' });

    const org = await insertOrganization();
    const number = await documentNumberingService.generateNextNumber({ organizationId: org._id, docType: 'purchase' });
    expect(number).toMatch(/^PUR-/);

    const indexesAfter = await collection.indexes();
    expect(indexesAfter.some((idx) => idx.name === 'invoiceNumber_1')).toBe(false);
    expect(
      indexesAfter.some(
        (idx) => idx.unique && idx.key.organizationId === 1 && idx.key.branchId === 1 && idx.key.invoiceNumber === 1
      )
    ).toBe(true);
  });
});

describe('documentNumbering.service — assertManualNumberAvailable (manual-override collision guard)', () => {
  test('organization-scoped docType: rejects a manual number already used by ANOTHER branch in the same org (closes the gap the branch-scoped DB index alone leaves)', async () => {
    const org = await insertOrganization(); // invoice defaults to scope: 'organization'
    const branchA = new mongoose.Types.ObjectId();
    const branchB = new mongoose.Types.ObjectId();
    await Invoice.create(minimalInvoice({ organizationId: org._id, branchId: branchA, invoiceNumber: 'ORG-SHARED-001' }));

    await expect(
      documentNumberingService.assertManualNumberAvailable({
        organizationId: org._id,
        branchId: branchB,
        docType: 'invoice',
        invoiceNumber: 'ORG-SHARED-001',
      })
    ).rejects.toThrow(/already in use/);
  });

  test('branch-scoped docType: allows the same manual number in two different branches (DB index alone is sufficient)', async () => {
    const org = await insertOrganization();
    org.documentNumbering.purchase.scope = 'branch';
    await org.save();
    const branchA = new mongoose.Types.ObjectId();
    const branchB = new mongoose.Types.ObjectId();

    await expect(
      documentNumberingService.assertManualNumberAvailable({
        organizationId: org._id,
        branchId: branchB,
        docType: 'purchase',
        invoiceNumber: 'BR-SHARED-001',
      })
    ).resolves.toBeUndefined(); // no-ops for branch scope; nothing to reject
  });
});

describe('documentNumbering.service — per-branch numbering scope', () => {
  test('generateNextNumber throws if scope is "branch" and no branchId is given', async () => {
    const org = await insertOrganization();
    org.documentNumbering.purchase.scope = 'branch';
    await org.save();

    await expect(
      documentNumberingService.generateNextNumber({ organizationId: org._id, docType: 'purchase' })
    ).rejects.toThrow(/[Bb]ranch is required/);
  });

  test('two branches of the SAME org get fully independent sequences — Branch A hitting 1000 never affects or skips Branch B', async () => {
    const org = await insertOrganization();
    org.documentNumbering.purchase.scope = 'branch';
    await org.save();
    const branchA = new mongoose.Types.ObjectId();
    const branchB = new mongoose.Types.ObjectId();

    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await documentNumberingService.generateNextNumber({ organizationId: org._id, branchId: branchA, docType: 'purchase' });
    }
    const branchBFirst = await documentNumberingService.generateNextNumber({ organizationId: org._id, branchId: branchB, docType: 'purchase' });
    expect(branchBFirst).toBe('PUR-000001'); // unaffected by Branch A's 5 prior numbers

    const branchASixth = await documentNumberingService.generateNextNumber({ organizationId: org._id, branchId: branchA, docType: 'purchase' });
    expect(branchASixth).toBe('PUR-000006'); // unaffected by Branch B's activity in between
  });

  test('"resume from number" on one branch does not affect another branch\'s sequence', async () => {
    const org = await insertOrganization();
    org.documentNumbering.purchase.scope = 'branch';
    await org.save();
    const branchA = new mongoose.Types.ObjectId();
    const branchB = new mongoose.Types.ObjectId();

    await documentNumberingService.generateNextNumber({ organizationId: org._id, branchId: branchA, docType: 'purchase' }); // PUR-000001
    await documentNumberingService.setNextNumber({ organizationId: org._id, branchId: branchA, docType: 'purchase', nextNumber: 1000 });

    const branchANext = await documentNumberingService.generateNextNumber({ organizationId: org._id, branchId: branchA, docType: 'purchase' });
    expect(branchANext).toBe('PUR-001000');

    const branchBNext = await documentNumberingService.generateNextNumber({ organizationId: org._id, branchId: branchB, docType: 'purchase' });
    expect(branchBNext).toBe('PUR-000001'); // completely untouched by Branch A's resume
  });

  test('peekNextNumber for a draft config with scope "branch" requires branchId', async () => {
    const org = await insertOrganization();
    await expect(
      documentNumberingService.peekNextNumber({
        organizationId: org._id,
        docType: 'purchase',
        config: { prefix: 'PUR', separator: '-', dateSegment: 'none', resetPeriod: 'never', padding: 6, startingNumber: 1, scope: 'branch' },
      })
    ).rejects.toThrow(/[Bb]ranch is required/);
  });

  test('lazy seeding for a branch-scoped bucket only counts THAT branch\'s historical documents', async () => {
    const org = await insertOrganization();
    org.documentNumbering.purchase.scope = 'branch';
    await org.save();
    const branchA = new mongoose.Types.ObjectId();
    const branchB = new mongoose.Types.ObjectId();

    await Purchase.create({
      organizationId: org._id,
      branchId: branchA,
      supplier: new mongoose.Types.ObjectId(),
      items: [],
      totalAmount: 100,
      invoiceNumber: 'PUR-000075',
    });

    const branchANext = await documentNumberingService.generateNextNumber({ organizationId: org._id, branchId: branchA, docType: 'purchase' });
    expect(branchANext).toBe('PUR-000076'); // continues Branch A's own history

    const branchBNext = await documentNumberingService.generateNextNumber({ organizationId: org._id, branchId: branchB, docType: 'purchase' });
    expect(branchBNext).toBe('PUR-000001'); // Branch B has no history of its own, starts fresh
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
