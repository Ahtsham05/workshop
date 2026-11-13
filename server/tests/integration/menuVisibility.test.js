const request = require('supertest');
const httpStatus = require('http-status');
const mongoose = require('mongoose');
const moment = require('moment');
const app = require('../../src/app');
const setupTestDB = require('../utils/setupTestDB');
const { Organization, User } = require('../../src/models');
const config = require('../../src/config/config');
const { tokenTypes } = require('../../src/config/tokens');
const tokenService = require('../../src/services/token.service');
const { isRouteHiddenForBusinessType } = require('../../src/config/businessTypes');
const { getVisibleActions } = require('../../src/config/quick-link-registry');

jest.setTimeout(30000);

setupTestDB();

const ownerId = new mongoose.Types.ObjectId();
const orgId = new mongoose.Types.ObjectId();
const otherOrgId = new mongoose.Types.ObjectId();
const PASSWORD_HASH = '$2a$08$abcdefghijklmnopqrstuuMhMp1Qs1rUXQ8j0x1n3i7Ew8B2WlZ6a';
const token = (id) =>
  tokenService.generateToken(id, moment().add(config.jwt.accessExpirationMinutes, 'minutes'), tokenTypes.ACCESS);

beforeEach(async () => {
  await Organization.collection.insertMany([
    {
      _id: orgId,
      name: 'G Wholesaler',
      owner: ownerId,
      businessType: 'distributor',
      subscription: { planType: 'trial', status: 'trialing' },
    },
    { _id: otherOrgId, name: 'Someone Else', owner: new mongoose.Types.ObjectId(), businessType: 'retail' },
  ]);
  await User.collection.insertOne({
    _id: ownerId,
    name: 'Owner',
    email: 'owner@gw.example',
    password: PASSWORD_HASH,
    organizationId: orgId,
    businessType: 'distributor',
    systemRole: 'superAdmin',
    isActive: true,
  });
});

describe('PATCH /v1/organizations/:orgId/menu-visibility', () => {
  test('saves the page on/off map and returns it on the organization', async () => {
    const menuVisibility = { '/salesmen': true, '/hr/payroll': false, '/reports?tab=sales': false };
    const res = await request(app)
      .patch(`/v1/organizations/${orgId}/menu-visibility`)
      .set('Authorization', `Bearer ${token(ownerId)}`)
      .send({ menuVisibility })
      .expect(httpStatus.OK);
    expect(res.body.menuVisibility).toEqual(menuVisibility);

    const me = await request(app)
      .get('/v1/organizations/me')
      .set('Authorization', `Bearer ${token(ownerId)}`)
      .expect(httpStatus.OK);
    expect(me.body.menuVisibility).toEqual(menuVisibility);
  });

  test('rejects keys that are not app paths, and values that are not on/off', async () => {
    const bad = [{ hr: false }, { '/hr': 'yes' }, { [`/${'x'.repeat(400)}`]: true }];
    const statuses = await Promise.all(
      bad.map((menuVisibility) =>
        request(app)
          .patch(`/v1/organizations/${orgId}/menu-visibility`)
          .set('Authorization', `Bearer ${token(ownerId)}`)
          .send({ menuVisibility })
          .then((res) => res.status)
      )
    );
    expect(statuses).toEqual(bad.map(() => httpStatus.BAD_REQUEST));
  });

  test('never stores keys unsafe as MongoDB field names ($ / . are stripped by the app)', async () => {
    await request(app)
      .patch(`/v1/organizations/${orgId}/menu-visibility`)
      .set('Authorization', `Bearer ${token(ownerId)}`)
      .send({ menuVisibility: { '/hr.payroll': false, $where: true, '/invoice': false } })
      .expect(httpStatus.OK);
    const org = await Organization.findById(orgId).lean();
    expect(org.menuVisibility).toEqual({ '/invoice': false });
  });

  test('saves the menu arrangement (names, order, sub-menu moves, hidden-in-menu pages)', async () => {
    const menuLayout = {
      labels: { 'p:/customers': 'Clients', 's:general/contacts': 'People', 'g:administration': 'Admin' },
      groupOrder: ['administration', 'general'],
      placement: { '/customers': 'g:general', '/roles': 's:general/contacts' },
      order: { 'g:general': ['p:/customers', 'p:/'], 's:general/contacts': ['p:/roles', 'p:/suppliers'] },
      menuHidden: ['/suppliers'],
    };
    const res = await request(app)
      .patch(`/v1/organizations/${orgId}/menu-visibility`)
      .set('Authorization', `Bearer ${token(ownerId)}`)
      .send({ menuVisibility: { '/leads': false }, menuLayout })
      .expect(httpStatus.OK);
    expect(res.body.menuLayout).toEqual(menuLayout);
    expect(res.body.menuVisibility).toEqual({ '/leads': false });

    // A save without menuLayout leaves the arrangement as it was.
    await request(app)
      .patch(`/v1/organizations/${orgId}/menu-visibility`)
      .set('Authorization', `Bearer ${token(ownerId)}`)
      .send({ menuVisibility: {} })
      .expect(httpStatus.OK);
    expect((await Organization.findById(orgId).lean()).menuLayout).toEqual(menuLayout);

    // Bad shapes are refused.
    const badLayouts = [
      { placement: { '/customers': 'somewhere' } },
      { labels: { 'p:/x': 'y'.repeat(61) } },
      { menuHidden: ['customers'] },
    ];
    const statuses = await Promise.all(
      badLayouts.map((bad) =>
        request(app)
          .patch(`/v1/organizations/${orgId}/menu-visibility`)
          .set('Authorization', `Bearer ${token(ownerId)}`)
          .send({ menuVisibility: {}, menuLayout: bad })
          .then((r) => r.status)
      )
    );
    expect(statuses).toEqual(badLayouts.map(() => httpStatus.BAD_REQUEST));
  });

  test("can't change another organization's menu", async () => {
    await request(app)
      .patch(`/v1/organizations/${otherOrgId}/menu-visibility`)
      .set('Authorization', `Bearer ${token(ownerId)}`)
      .send({ menuVisibility: { '/invoice': false } })
      .expect(httpStatus.FORBIDDEN);
  });
});

describe('menu visibility rules (server mirror)', () => {
  test('business-type defaults, overrides and most-specific-wins', () => {
    // Distributor defaults: salesmen + communications off, HR and branches on.
    expect(isRouteHiddenForBusinessType('distributor', '/salesmen')).toBe(true);
    expect(isRouteHiddenForBusinessType('distributor', '/sms/log')).toBe(true);
    expect(isRouteHiddenForBusinessType('distributor', '/hr/payroll')).toBe(false);
    expect(isRouteHiddenForBusinessType('distributor', '/branches')).toBe(false);
    // An org choice beats the default.
    expect(isRouteHiddenForBusinessType('distributor', '/salesmen', { '/salesmen': true })).toBe(false);
    // "/hr" off, "/hr/employees" on: the more specific rule wins.
    const overrides = { '/hr': false, '/hr/employees': true };
    expect(isRouteHiddenForBusinessType('retail', '/hr/payroll', overrides)).toBe(true);
    expect(isRouteHiddenForBusinessType('retail', '/hr/employees/create', overrides)).toBe(false);
    // Tab pages match on their tab only; "/" never swallows every page.
    expect(isRouteHiddenForBusinessType('retail', '/reports?tab=sales', { '/reports?tab=sales': false })).toBe(true);
    expect(isRouteHiddenForBusinessType('retail', '/reports?tab=stock', { '/reports?tab=sales': false })).toBe(false);
    expect(isRouteHiddenForBusinessType('retail', '/invoice', { '/': false })).toBe(false);
  });

  test('Quick Links drop pages the org switched off, including routeSearch tabs', () => {
    const routes = (menuVisibility) =>
      getVisibleActions({}, { businessType: 'retail', bypassPermissions: true, menuVisibility }).map((a) => a.route);
    expect(routes(null)).toContain('/hr/payroll');
    expect(routes({ '/hr/payroll': false })).not.toContain('/hr/payroll');
    const withTab = (menuVisibility) =>
      getVisibleActions(
        {},
        { businessType: 'retail', bypassPermissions: true, menuVisibility, warehousesEnabled: true }
      ).filter((a) => a.route === '/warehouses' && a.routeSearch && a.routeSearch.tab === 'reports').length;
    expect(withTab(null)).toBeGreaterThan(0);
    expect(withTab({ '/warehouses?tab=reports': false })).toBe(0);
  });
});
