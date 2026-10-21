const request = require('supertest');
const httpStatus = require('http-status');
const mongoose = require('mongoose');
const moment = require('moment');
const bcrypt = require('bcryptjs');
const app = require('../../src/app');
const setupTestDB = require('../utils/setupTestDB');
const { Organization, User, Branch, Role, Membership, Token } = require('../../src/models');
const config = require('../../src/config/config');
const { tokenTypes } = require('../../src/config/tokens');
const tokenService = require('../../src/services/token.service');
const { addDays } = require('../../src/services/billing/subscriptionState');
const { PERMISSION_KEYS } = require('../../src/config/permission-registry');

jest.setTimeout(30000);

setupTestDB();

const id = () => new mongoose.Types.ObjectId();
const hash = bcrypt.hashSync('password1', 8);
const tokenFor = (userId) =>
  tokenService.generateToken(userId, moment().add(config.jwt.accessExpirationMinutes, 'minutes'), tokenTypes.ACCESS);

const orgA = id();
const orgB = id();
const branchA1 = id();
const branchA2 = id();
const branchB1 = id();
const adminRole = id();
const managerRole = id();
const cashierRole = id();
const orgBRole = id();
const owner = id();
const manager = id();
const cashier = id();
const outsider = id();

const perms = (keys) => Object.fromEntries(PERMISSION_KEYS.map((k) => [k, keys === 'all' || keys.includes(k)]));

const subscription = (planType) => ({
  planType,
  status: 'active',
  paymentSource: 'manual',
  currentPeriodEnd: addDays(new Date(), 20),
});

const seed = async ({ plan = 'growth' } = {}) => {
  await Organization.collection.insertMany([
    { _id: orgA, name: 'Shop A', owner, countryCode: 'PK', subscription: subscription(plan) },
    { _id: orgB, name: 'Shop B', owner: outsider, countryCode: 'PK', subscription: subscription('growth') },
  ]);
  await Branch.collection.insertMany([
    { _id: branchA1, organizationId: orgA, name: 'Main', isActive: true },
    { _id: branchA2, organizationId: orgA, name: 'Second', isActive: true },
    { _id: branchB1, organizationId: orgB, name: 'B Main', isActive: true },
  ]);
  await Role.collection.insertMany([
    { _id: adminRole, name: 'Admin', isSystemRole: true, isActive: true, organizationId: null, permissions: perms('all') },
    {
      _id: managerRole,
      name: 'Manager',
      isSystemRole: true,
      isActive: true,
      organizationId: null,
      permissions: perms(['viewUsers', 'createUsers', 'editUsers', 'viewProducts', 'viewInvoices']),
    },
    {
      _id: cashierRole,
      name: 'Cashier',
      isSystemRole: true,
      isActive: true,
      organizationId: null,
      permissions: perms(['viewInvoices']),
    },
    {
      _id: orgBRole,
      name: 'B Custom',
      isSystemRole: false,
      isActive: true,
      organizationId: orgB,
      permissions: perms(['viewInvoices']),
    },
  ]);
  const base = { password: hash, isActive: true, onboardingComplete: true, schoolRole: null };
  await User.collection.insertMany([
    {
      ...base,
      _id: owner,
      name: 'Owner',
      email: 'owner@a.com',
      organizationId: orgA,
      systemRole: 'superAdmin',
      role: adminRole,
    },
    {
      ...base,
      _id: manager,
      name: 'Manager',
      email: 'manager@a.com',
      organizationId: orgA,
      systemRole: 'staff',
      role: managerRole,
    },
    {
      ...base,
      _id: cashier,
      name: 'Cashier',
      email: 'cashier@a.com',
      organizationId: orgA,
      systemRole: 'staff',
      role: cashierRole,
    },
    {
      ...base,
      _id: outsider,
      name: 'Outsider',
      email: 'boss@b.com',
      organizationId: orgB,
      systemRole: 'superAdmin',
      role: adminRole,
    },
  ]);
  await Membership.collection.insertMany([
    { userId: owner, organizationId: orgA, branchId: branchA1, role: 'superAdmin', isActive: true },
    { userId: manager, organizationId: orgA, branchId: branchA1, role: 'staff', isActive: true },
    { userId: cashier, organizationId: orgA, branchId: branchA1, role: 'staff', isActive: true },
    { userId: outsider, organizationId: orgB, branchId: branchB1, role: 'superAdmin', isActive: true },
  ]);
};

const api = (method, url, as) =>
  request(app)
    [method](url)
    .set('Authorization', `Bearer ${tokenFor(as)}`);

describe('Team users: one call creates a usable user', () => {
  test('creates the user with role and branch access together, email normalised', async () => {
    await seed();
    const res = await api('post', '/v1/users', owner)
      .send({
        name: 'Ali',
        email: '  Ali@Shop.COM ',
        password: 'secret123',
        role: cashierRole.toString(),
        branchIds: [branchA1.toString(), branchA2.toString()],
      })
      .expect(httpStatus.CREATED);

    expect(res.body.email).toBe('ali@shop.com');
    expect(res.body.branches.map((b) => b.name)).toEqual(['Main', 'Second']);
    expect(res.body.isOwner).toBe(false);
    const dbUser = await User.findById(res.body.id);
    expect(String(dbUser.organizationId)).toBe(String(orgA));
    expect(dbUser.systemRole).toBe('staff');
    expect(await Membership.countDocuments({ userId: dbUser._id, isActive: true })).toBe(2);
  });

  test('a differently-cased duplicate email is a clean 400, not a 500', async () => {
    await seed();
    await api('post', '/v1/users', owner)
      .send({ name: 'Dup', email: 'CASHIER@A.com', password: 'secret123', role: cashierRole.toString() })
      .expect(httpStatus.BAD_REQUEST);
  });

  test('a branch from another business is rejected before any user is written', async () => {
    await seed();
    await api('post', '/v1/users', owner)
      .send({
        name: 'X',
        email: 'x@a.com',
        password: 'secret123',
        role: cashierRole.toString(),
        branchIds: [branchB1.toString()],
      })
      .expect(httpStatus.BAD_REQUEST);
    expect(await User.countDocuments({ email: 'x@a.com' })).toBe(0);
  });

  test("another business's custom role cannot be assigned", async () => {
    await seed();
    await api('post', '/v1/users', owner)
      .send({ name: 'X', email: 'x@a.com', password: 'secret123', role: orgBRole.toString() })
      .expect(httpStatus.BAD_REQUEST);
  });

  test('the list returns each user with all their branches', async () => {
    await seed();
    await Membership.collection.insertOne({
      userId: cashier,
      organizationId: orgA,
      branchId: branchA2,
      role: 'staff',
      isActive: true,
    });
    const res = await api('get', '/v1/users?limit=50', owner).expect(httpStatus.OK);
    const c = res.body.results.find((u) => u.email === 'cashier@a.com');
    expect(c.branches.map((b) => b.name)).toEqual(['Main', 'Second']);
    expect(res.body.results.find((u) => u.email === 'owner@a.com').isOwner).toBe(true);
    expect(res.body.results.some((u) => u.email === 'boss@b.com')).toBe(false);
  });

  test('editing replaces branch access', async () => {
    await seed();
    const res = await api('patch', `/v1/users/${cashier}`, owner)
      .send({ branchIds: [branchA2.toString()] })
      .expect(httpStatus.OK);
    expect(res.body.branches.map((b) => b.name)).toEqual(['Second']);
  });
});

describe('Team users: privilege escalation is blocked', () => {
  test('a manager cannot hand out the Admin role', async () => {
    await seed();
    await api('post', '/v1/users', manager)
      .send({ name: 'Evil', email: 'evil@a.com', password: 'secret123', role: adminRole.toString() })
      .expect(httpStatus.FORBIDDEN);
    await api('patch', `/v1/users/${cashier}`, manager).send({ role: adminRole.toString() }).expect(httpStatus.FORBIDDEN);
  });

  test('a manager cannot change their own role', async () => {
    await seed();
    await api('patch', `/v1/users/${manager}`, manager).send({ role: cashierRole.toString() }).expect(httpStatus.FORBIDDEN);
  });

  test("a manager cannot touch the owner's account (e.g. reset the owner's password)", async () => {
    await seed();
    await api('patch', `/v1/users/${owner}`, manager).send({ password: 'takeover1' }).expect(httpStatus.FORBIDDEN);
  });

  test('a manager cannot reset the password of (or delete) someone with more access, e.g. an Admin', async () => {
    await seed();
    await User.collection.updateOne({ _id: cashier }, { $set: { role: adminRole } });
    await api('patch', `/v1/users/${cashier}`, manager).send({ password: 'takeover1' }).expect(httpStatus.FORBIDDEN);
    await api('delete', `/v1/users/${cashier}`, manager).expect(httpStatus.FORBIDDEN);
  });

  test("a manager editing someone keeps that person's other-branch access intact", async () => {
    await seed();
    await Membership.collection.insertOne({
      userId: cashier,
      organizationId: orgA,
      branchId: branchA2,
      role: 'staff',
      isActive: true,
    });
    // The form sends back everything the user had, including Second, which the manager is not in.
    await api('patch', `/v1/users/${cashier}`, manager)
      .send({ name: 'Cashier Two', branchIds: [branchA1.toString(), branchA2.toString()] })
      .expect(httpStatus.OK);
    // Unticking Main (theirs to manage) removes only Main.
    const res = await api('patch', `/v1/users/${cashier}`, manager)
      .send({ branchIds: [branchA2.toString()] })
      .expect(httpStatus.OK);
    expect(res.body.branches.map((b) => b.name)).toEqual(['Second']);
    // And dropping Second from the list does not remove it — it is not theirs to revoke.
    const res2 = await api('patch', `/v1/users/${cashier}`, manager).send({ branchIds: [] }).expect(httpStatus.OK);
    expect(res2.body.branches.map((b) => b.name)).toEqual(['Second']);
  });

  test('a manager can only grant branches they belong to', async () => {
    await seed();
    await api('post', '/v1/users', manager)
      .send({
        name: 'Y',
        email: 'y@a.com',
        password: 'secret123',
        role: cashierRole.toString(),
        branchIds: [branchA2.toString()],
      })
      .expect(httpStatus.BAD_REQUEST);
  });

  test('the owner cannot be deleted or deactivated; nobody can delete or deactivate themselves', async () => {
    await seed();
    await api('delete', `/v1/users/${owner}`, owner).expect(httpStatus.FORBIDDEN);
    await api('patch', `/v1/users/${owner}`, owner).send({ isActive: false }).expect(httpStatus.BAD_REQUEST);
    await api('patch', `/v1/users/${manager}`, manager).send({ isActive: false }).expect(httpStatus.BAD_REQUEST);
  });
});

describe('Team users: tenant isolation on /users/:id', () => {
  test('another business cannot read, edit or delete our users', async () => {
    await seed();
    await api('get', `/v1/users/${cashier}`, outsider).expect(httpStatus.NOT_FOUND);
    await api('patch', `/v1/users/${cashier}`, outsider).send({ password: 'takeover1' }).expect(httpStatus.NOT_FOUND);
    await api('delete', `/v1/users/${cashier}`, outsider).expect(httpStatus.NOT_FOUND);
    expect(await User.countDocuments({ _id: cashier })).toBe(1);
  });

  test('deleting a user also removes their branch access and sessions', async () => {
    await seed();
    await Token.collection.insertOne({
      token: 'r',
      user: cashier,
      type: tokenTypes.REFRESH,
      expires: new Date(Date.now() + 1e7),
      blacklisted: false,
    });
    await api('delete', `/v1/users/${cashier}`, owner).expect(httpStatus.NO_CONTENT);
    expect(await Membership.countDocuments({ userId: cashier })).toBe(0);
    expect(await Token.countDocuments({ user: cashier })).toBe(0);
  });
});

describe('Team users: deactivation actually locks the account', () => {
  test('a deactivated user cannot log in, and an existing session stops working', async () => {
    await seed();
    await api('get', '/v1/users/me', cashier).expect(httpStatus.OK);
    await api('patch', `/v1/users/${cashier}`, owner).send({ isActive: false }).expect(httpStatus.OK);

    await api('get', '/v1/users/me', cashier).expect(httpStatus.UNAUTHORIZED);
    const login = await request(app).post('/v1/auth/login').send({ email: 'cashier@a.com', password: 'password1' });
    expect(login.status).toBe(httpStatus.FORBIDDEN);
    // A wrong password still gets the generic answer — no hint the account exists.
    const wrong = await request(app).post('/v1/auth/login').send({ email: 'cashier@a.com', password: 'nope12345' });
    expect(wrong.status).toBe(httpStatus.UNAUTHORIZED);
  });

  test('re-activating a user needs a free seat', async () => {
    await seed({ plan: 'starter' }); // maxUsers 3: owner + manager + cashier already active
    await api('patch', `/v1/users/${cashier}`, owner).send({ isActive: false }).expect(httpStatus.OK);
    await api('post', '/v1/users', owner)
      .send({ name: 'New', email: 'new@a.com', password: 'secret123', role: cashierRole.toString() })
      .expect(httpStatus.CREATED);
    const res = await api('patch', `/v1/users/${cashier}`, owner).send({ isActive: true });
    expect(res.status).not.toBe(httpStatus.OK);
    expect((await User.findById(cashier)).isActive).toBe(false);
  });
});

describe('Memberships API is permission-checked and tenant-scoped', () => {
  test('a cashier cannot promote themselves or create staff', async () => {
    await seed();
    const m = await Membership.findOne({ userId: cashier });
    await api('patch', `/v1/memberships/${m._id}/role`, cashier).send({ role: 'branchAdmin' }).expect(httpStatus.FORBIDDEN);
    await api('post', '/v1/memberships/staff', cashier)
      .send({ name: 'Z', email: 'z@a.com', password: 'secret123', branchId: branchA1.toString(), role: 'staff' })
      .expect(httpStatus.FORBIDDEN);
  });

  test('superAdmin can never be handed out through the API', async () => {
    await seed();
    const m = await Membership.findOne({ userId: cashier });
    await api('patch', `/v1/memberships/${m._id}/role`, owner).send({ role: 'superAdmin' }).expect(httpStatus.BAD_REQUEST);
    await api('post', '/v1/memberships/staff', owner)
      .send({ name: 'Z', email: 'z@a.com', password: 'secret123', branchId: branchA1.toString(), role: 'superAdmin' })
      .expect(httpStatus.BAD_REQUEST);
  });

  test("another business's members and memberships are out of reach", async () => {
    await seed();
    const res = await api('get', `/v1/memberships/branch/${branchA1}`, outsider).expect(httpStatus.OK);
    expect(res.body).toEqual([]);
    const m = await Membership.findOne({ userId: cashier });
    await api('delete', `/v1/memberships/${m._id}`, outsider).expect(httpStatus.NOT_FOUND);
    // and they cannot pull one of our users into their branch
    await api('post', '/v1/memberships', outsider)
      .send({ userId: cashier.toString(), branchId: branchB1.toString() })
      .expect(httpStatus.NOT_FOUND);
  });

  test("staff creation never pulls in another business's account by email", async () => {
    await seed();
    await api('post', '/v1/memberships/staff', owner)
      .send({ name: 'B', email: 'boss@b.com', password: 'secret123', branchId: branchA1.toString(), role: 'staff' })
      .expect(httpStatus.BAD_REQUEST);
    expect(await Membership.countDocuments({ userId: outsider, organizationId: orgA })).toBe(0);
  });
});
