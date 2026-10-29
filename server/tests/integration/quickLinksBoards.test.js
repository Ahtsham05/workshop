const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { UserQuickLinks } = require('../../src/models');
const quickLinks = require('../../src/services/quickLinks.service');

/**
 * Quick Links boards: the main dashboard and the Manufacturing Overview keep separate,
 * independently customised lists on one doc, and Manufacturing actions only reach
 * someone the Manufacturing module is open to.
 */
let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
beforeEach(async () => {
  await UserQuickLinks.deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const id = () => new mongoose.Types.ObjectId();
const base = {
  organizationId: id(),
  branchId: id(),
  userId: id(),
  businessType: 'factory',
  permissions: {},
  bypassPermissions: true,
};
const factory = { ...base, manufacturingEnabled: true };
const keys = (links) => links.map((l) => l.actionKey);

describe('Quick Links boards', () => {
  test('the manufacturing board seeds the plant defaults and offers only Manufacturing actions', async () => {
    const links = await quickLinks.getMyQuickLinks(factory, 'manufacturing');
    expect(keys(links).slice(0, 3)).toEqual([
      'mfg_new_production_order',
      'mfg_new_material_issue',
      'mfg_receive_finished_goods',
    ]);
    const offered = quickLinks.listAvailableActions(factory, 'manufacturing');
    expect(offered.length).toBeGreaterThan(10);
    expect(offered.every((a) => a.category === 'Manufacturing')).toBe(true);
  });

  test('boards are customised independently on the same doc', async () => {
    const dashboard = await quickLinks.getMyQuickLinks(factory, 'dashboard');
    await quickLinks.updateQuickLinks([{ actionKey: 'mfg_wip' }, { actionKey: 'new_invoice' }], factory, 'manufacturing');

    // Non-manufacturing keys are refused on the manufacturing board.
    expect(keys(await quickLinks.getMyQuickLinks(factory, 'manufacturing'))).toEqual(['mfg_wip']);
    expect(keys(await quickLinks.getMyQuickLinks(factory, 'dashboard'))).toEqual(keys(dashboard));
    expect(await UserQuickLinks.countDocuments({})).toBe(1);

    // A cleared board stays cleared; reset brings the defaults back.
    await quickLinks.updateQuickLinks([], factory, 'manufacturing');
    expect(await quickLinks.getMyQuickLinks(factory, 'manufacturing')).toEqual([]);
    const reset = await quickLinks.resetQuickLinks(factory, 'manufacturing');
    expect(keys(reset)[0]).toBe('mfg_new_production_order');
  });

  test('Manufacturing actions are hidden when the module is not open to the user', async () => {
    const shop = { ...base, businessType: 'mobile_shop', manufacturingEnabled: false };
    expect(quickLinks.listAvailableActions(shop, 'manufacturing')).toEqual([]);
    expect(quickLinks.listAvailableActions(shop, 'dashboard').some((a) => a.category === 'Manufacturing')).toBe(false);
    expect(
      quickLinks.listAvailableActions(factory, 'dashboard').some((a) => a.actionKey === 'mfg_receive_finished_goods')
    ).toBe(true);
  });

  test('per-action permissions still apply', async () => {
    const operator = {
      ...factory,
      bypassPermissions: false,
      permissions: { viewManufacturing: true, issueMaterials: true },
    };
    const offered = keys(quickLinks.listAvailableActions(operator, 'manufacturing'));
    expect(offered).toContain('mfg_new_material_issue');
    expect(offered).not.toContain('mfg_receive_finished_goods');
    expect(offered).not.toContain('mfg_new_bom');
  });
});
