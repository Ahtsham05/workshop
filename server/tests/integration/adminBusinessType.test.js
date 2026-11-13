const request = require('supertest');
const httpStatus = require('http-status');
const mongoose = require('mongoose');
const moment = require('moment');
const app = require('../../src/app');
const setupTestDB = require('../utils/setupTestDB');
const { Organization, User, SignupLead, Branch } = require('../../src/models');
const branchService = require('../../src/services/branch.service');
const config = require('../../src/config/config');
const { tokenTypes } = require('../../src/config/tokens');
const tokenService = require('../../src/services/token.service');

jest.setTimeout(30000);

setupTestDB();

const ownerId = new mongoose.Types.ObjectId();
const staffId = new mongoose.Types.ObjectId();
const adminId = new mongoose.Types.ObjectId();
const orgId = new mongoose.Types.ObjectId();
const PASSWORD_HASH = '$2a$08$abcdefghijklmnopqrstuuMhMp1Qs1rUXQ8j0x1n3i7Ew8B2WlZ6a';
const token = (id) =>
  tokenService.generateToken(id, moment().add(config.jwt.accessExpirationMinutes, 'minutes'), tokenTypes.ACCESS);
const url = `/v1/admin/organizations/${orgId}/business-type`;

beforeEach(async () => {
  await Organization.collection.insertOne({
    _id: orgId,
    name: 'Acme Traders',
    owner: ownerId,
    email: 'billing@acme.example',
    businessType: 'retail',
    subscription: { planType: 'trial', status: 'trialing' },
  });
  await User.collection.insertMany([
    {
      _id: ownerId,
      name: 'Owner',
      email: 'owner@acme.example',
      password: PASSWORD_HASH,
      organizationId: orgId,
      businessType: 'retail',
      isActive: true,
    },
    {
      _id: staffId,
      name: 'Staff',
      email: 'staff@acme.example',
      password: PASSWORD_HASH,
      organizationId: orgId,
      businessType: 'retail',
      isActive: true,
    },
    {
      _id: adminId,
      name: 'Platform Admin',
      email: 'admin@logix.example',
      password: PASSWORD_HASH,
      systemRole: 'system_admin',
    },
  ]);
  await SignupLead.collection.insertOne({ organizationId: orgId, stage: 'new', activities: [] });
});

describe('PATCH /v1/admin/organizations/:orgId/business-type', () => {
  test('switches the org and every one of its users, and logs it on the lead', async () => {
    const res = await request(app)
      .patch(url)
      .set('Authorization', `Bearer ${token(adminId)}`)
      .send({ businessType: 'distributor' })
      .expect(httpStatus.OK);

    expect(res.body).toMatchObject({ businessType: 'distributor', previousBusinessType: 'retail' });
    expect((await Organization.findById(orgId).lean()).businessType).toBe('distributor');
    const users = await User.find({ organizationId: orgId }).lean();
    expect(users.map((u) => u.businessType)).toEqual(['distributor', 'distributor']);
    const lead = await SignupLead.findOne({ organizationId: orgId }).lean();
    expect(lead.activities.at(-1)).toMatchObject({
      type: 'system',
      text: 'Business type changed: retail → distributor',
      byName: 'Platform Admin',
    });
  });

  test('moves branches still on the factory print defaults to A4 + Distributor, leaves hand-picked ones', async () => {
    const untouchedId = new mongoose.Types.ObjectId();
    const customId = new mongoose.Types.ObjectId();
    await Branch.collection.insertMany([
      {
        _id: untouchedId,
        organizationId: orgId,
        name: 'Main',
        printSettings: { paperSize: 'thermal80', template: 'standard' },
      },
      {
        _id: customId,
        organizationId: orgId,
        name: 'Counter',
        printSettings: { paperSize: 'thermal58', template: 'standard' },
      },
    ]);
    await request(app)
      .patch(url)
      .set('Authorization', `Bearer ${token(adminId)}`)
      .send({ businessType: 'distributor' })
      .expect(httpStatus.OK);
    expect((await Branch.findById(untouchedId).lean()).printSettings).toMatchObject({
      paperSize: 'a4',
      template: 'distributor',
    });
    expect((await Branch.findById(customId).lean()).printSettings).toMatchObject({
      paperSize: 'thermal58',
      template: 'standard',
    });
  });

  test('a new branch of a distributor org starts on A4 + Distributor', async () => {
    await Organization.updateOne(
      { _id: orgId },
      { businessType: 'distributor', subscription: { planType: 'enterprise', status: 'active' } }
    );
    const branch = await branchService.createBranch(orgId, { name: 'Warehouse 2' });
    expect(branch.printSettings).toMatchObject({ paperSize: 'a4', template: 'distributor' });
    // An explicit choice from the caller still wins.
    const thermal = await branchService.createBranch(orgId, { name: 'Counter', printSettings: { paperSize: 'thermal80' } });
    expect(thermal.printSettings).toMatchObject({ paperSize: 'thermal80', template: 'distributor' });
  });

  test('rejects an unknown business type', async () => {
    await request(app)
      .patch(url)
      .set('Authorization', `Bearer ${token(adminId)}`)
      .send({ businessType: 'spaceship' })
      .expect(httpStatus.BAD_REQUEST);
    expect((await Organization.findById(orgId).lean()).businessType).toBe('retail');
  });

  test('is closed to anyone who is not a platform admin', async () => {
    await request(app)
      .patch(url)
      .set('Authorization', `Bearer ${token(ownerId)}`)
      .send({ businessType: 'distributor' })
      .expect(httpStatus.FORBIDDEN);
    expect((await Organization.findById(orgId).lean()).businessType).toBe('retail');
  });
});
