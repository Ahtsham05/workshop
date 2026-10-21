const mongoose = require('mongoose');
const setupTestDB = require('../utils/setupTestDB');
const { Role } = require('../../src/models');
const roleService = require('../../src/services/role.service');

setupTestDB();

/** A custom role as it was stored before the newer keys existed (raw insert, no defaults). */
const legacyRole = async (permissions) => {
  const _id = new mongoose.Types.ObjectId();
  await Role.collection.insertOne({
    _id,
    name: `r-${_id}`,
    isSystemRole: false,
    organizationId: new mongoose.Types.ObjectId(),
    permissions,
  });
  return _id;
};
const permsOf = async (id) => (await Role.collection.findOne({ _id: id })).permissions;

describe('backfillSplitPermissions', () => {
  test('a production role keeps every shop-floor task it had under executeProduction', async () => {
    const id = await legacyRole({ viewManufacturing: true, executeProduction: true });
    await roleService.backfillSplitPermissions();
    const p = await permsOf(id);
    expect(p).toMatchObject({
      issueMaterials: true,
      receiveFinishedGoods: true,
      recordScrap: true,
      editMaterialIssues: true,
      viewManufacturingCosts: true,
      useNotes: true,
      useTeamChat: true,
      useVoiceAssistant: true,
    });
  });

  test('a role without the old key gets nothing new (except Notes / Team Chat / voice button)', async () => {
    const id = await legacyRole({ viewInvoices: true });
    await roleService.backfillSplitPermissions();
    const p = await permsOf(id);
    expect(p.issueMaterials).toBeUndefined();
    expect(p.viewCostPrices).toBeUndefined();
    expect(p.useNotes).toBe(true);
    expect(p.useVoiceAssistant).toBe(true);
  });

  test('an admin who switched the voice button off keeps it off', async () => {
    const id = await legacyRole({ viewInvoices: true, useVoiceAssistant: false });
    await roleService.backfillSplitPermissions();
    expect((await permsOf(id)).useVoiceAssistant).toBe(false);
  });

  test('a role saved since (every key stored) is never changed', async () => {
    const id = await legacyRole({ executeProduction: true, issueMaterials: false, receiveFinishedGoods: false });
    await roleService.backfillSplitPermissions();
    const p = await permsOf(id);
    expect(p.issueMaterials).toBe(false);
    expect(p.receiveFinishedGoods).toBe(false);
  });

  test('running it twice changes nothing more', async () => {
    const id = await legacyRole({ viewProducts: true });
    await roleService.backfillSplitPermissions();
    const once = await permsOf(id);
    await roleService.backfillSplitPermissions();
    expect(await permsOf(id)).toEqual(once);
  });
});

describe('manufacturing tasks need View manufacturing', () => {
  const { buildPermissionsPayload, sanitizePermissions } = require('../../src/config/permission-registry');

  test('a saved role with tasks but no View manufacturing is repaired at boot', async () => {
    // Exactly the role from the field: BOMs + Issue materials + over-issue, view left unticked.
    const id = await legacyRole({ viewManufacturing: false, manageBoms: true, issueMaterials: true, overIssueMaterials: true });
    await roleService.repairRequiredPermissions();
    expect(await permsOf(id)).toMatchObject({ viewManufacturing: true, manageBoms: true, issueMaterials: true });
  });

  test('a role with no manufacturing task is left alone', async () => {
    const id = await legacyRole({ viewManufacturing: false, viewInvoices: true });
    await roleService.repairRequiredPermissions();
    expect((await permsOf(id)).viewManufacturing).toBe(false);
  });

  test('saving a task turns View manufacturing on; saving neither keeps it off', () => {
    expect(buildPermissionsPayload({ recordScrap: true }).viewManufacturing).toBe(true);
    expect(sanitizePermissions({ issueMaterials: true }).viewManufacturing).toBe(true);
    expect(buildPermissionsPayload({ viewInvoices: true }).viewManufacturing).toBe(false);
  });
});
