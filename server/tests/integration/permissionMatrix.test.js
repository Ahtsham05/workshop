/**
 * Role-permission matrix, generated from the real route table.
 *
 * Every route is read from the mounted v1 router, with the permissions its `auth(...)` /
 * `checkPermission(...)` middlewares require. Then, for every business route:
 *   1. a user whose role has NO permissions is refused with the permission error;
 *   2. a user whose role has ONLY the required permission(s) gets past the check;
 *   3. a route with no permission check at all must be on the short, reviewed list of
 *      self-service routes below — so a new module can't ship unguarded by accident.
 */
// Must load (and be wrapped, below) before the app requires it.
// eslint-disable-next-line import/order
const permissionModule = require('../../src/middlewares/permission');

// Tag the middlewares the permission helpers return, so the route table records them.
const tag = (fn, perms) => {
  // eslint-disable-next-line no-param-reassign
  fn.__perms = (fn.__perms || []).concat([perms]);
  return fn;
};
const realCheck = permissionModule.checkPermission;
const realCheckAll = permissionModule.checkAllPermissions;
permissionModule.checkPermission = (...p) => tag(realCheck(...p), { any: p.flat() });
permissionModule.checkAllPermissions = (...p) => tag(realCheckAll(...p), { all: p.flat() });

jest.mock('../../src/middlewares/auth', () => {
  const realAuth = jest.requireActual('../../src/middlewares/auth');
  return (...p) => {
    const fn = realAuth(...p);
    fn.__auth = true;
    if (p.length) fn.__perms = [{ any: p.flat() }];
    return fn;
  };
});

const request = require('supertest');
const mongoose = require('mongoose');
const moment = require('moment');
const app = require('../../src/app');
const v1Router = require('../../src/routes/v1');
const setupTestDB = require('../utils/setupTestDB');
const { Organization, User, Branch, Role, Membership } = require('../../src/models');
const config = require('../../src/config/config');
const { tokenTypes } = require('../../src/config/tokens');
const tokenService = require('../../src/services/token.service');
const { addDays } = require('../../src/services/billing/subscriptionState');
const { PERMISSION_KEYS } = require('../../src/config/permission-registry');

jest.setTimeout(600000);

setupTestDB();

// ── Route table ──────────────────────────────────────────────────────────────────────
const layerPath = (layer) => {
  if (!layer.regexp || layer.regexp.fast_slash) return '';
  return layer.regexp.toString().replace('/^', '').replace('\\/?(?=\\/|$)/i', '').replace(/\\\//g, '/');
};

const collectRoutes = () => {
  const out = [];
  const walk = (stack, prefix, inherited) => {
    const mw = [...inherited];
    stack.forEach((layer) => {
      if (layer.route) {
        Object.keys(layer.route.methods).forEach((method) => {
          const handles = [...mw, ...layer.route.stack.filter((l) => !l.method || l.method === method).map((l) => l.handle)];
          out.push({
            method,
            path: prefix + layer.route.path,
            authed: handles.some((h) => h.__auth),
            perms: handles.flatMap((h) => h.__perms || []),
          });
        });
      } else if (layer.handle && layer.handle.stack) {
        walk(layer.handle.stack, prefix + layerPath(layer), mw);
      } else {
        mw.push(layer.handle);
      }
    });
  };
  walk(v1Router.stack, '', []);
  return out;
};

const ROUTES = collectRoutes();

/**
 * Out of scope for the role matrix: school/teacher/parent portals (gated by school role,
 * not by these permissions), platform-admin consoles, auth and public endpoints.
 */
const OUT_OF_SCOPE =
  /^\/(school|teacher|parent|student|fee-|exams|classes|sections|subjects|timetables|time-slots|marks|results|diaries|visitors|id-cards|roll-slips|progress|teacher-|student-|class-|admin|billing|auth|public|storefront|restaurant|whatsapp|sms-gateway|notifications|attendance-school|school-)/;

/**
 * Logged-in routes that deliberately need no role permission: your own account, your
 * notes and chats, subscription/billing status, offline sync and small utilities.
 */
const SELF_SERVICE = [
  /^\/users\/(me|language)/,
  /^\/notes/,
  /^\/chat/,
  /^\/push\//,
  /^\/quick-links/,
  /^\/translate\//,
  /^\/sync\//,
  /^\/payments\//,
  /^\/payments$/,
  /^\/organizations\/(setup|me)$/,
  /^\/organizations\/:orgId$/,
  /^\/branches\/my$/,
  // Branch names/print header inside your own organization (writes need manageBranches).
  /^\/branches\/?$/,
  /^\/branches\/:branchId$/,
  // Owner-only, checked in the controller (not a delegable permission).
  /^\/branch-overview\//,
  /^\/memberships\/me$/,
  /^\/manufacturing\/access$/,
  /^\/company/,
  /^\/system\/database-health$/,
  // Country/currency reference lists used to format money and dates on every screen.
  /^\/localization\/(countries|currencies)$/,
];

const inScope = ROUTES.filter((r) => r.authed && !OUT_OF_SCOPE.test(r.path));
const guarded = inScope.filter((r) => r.perms.length);
const unguarded = inScope.filter((r) => !r.perms.length && !SELF_SERVICE.some((re) => re.test(r.path)));

// ── Fixtures ─────────────────────────────────────────────────────────────────────────
const id = () => new mongoose.Types.ObjectId();
const orgs = { mobile: id(), factory: id() };
const branches = { mobile: id(), factory: id() };

const perms = (keys) => Object.fromEntries(PERMISSION_KEYS.map((k) => [k, keys.includes(k)]));
const tokenFor = (userId) =>
  tokenService.generateToken(userId, moment().add(config.jwt.accessExpirationMinutes, 'minutes'), tokenTypes.ACCESS);

const orgFor = (path) => (path.startsWith('/manufacturing') ? 'factory' : 'mobile');

let roleSeq = 0;
/** A user in `org` whose role has exactly `keys`. Returns request headers. */
const userWith = async (org, keys) => {
  roleSeq += 1;
  const roleId = id();
  const userId = id();
  await Role.collection.insertOne({
    _id: roleId,
    name: `r${roleSeq}`,
    isSystemRole: false,
    isActive: true,
    organizationId: orgs[org],
    branchId: null,
    permissions: perms(keys),
  });
  await User.collection.insertOne({
    _id: userId,
    name: `User ${roleSeq}`,
    email: `u${roleSeq}@perm.test`,
    password: 'x',
    role: roleId,
    organizationId: orgs[org],
    businessType: org === 'factory' ? 'factory' : 'mobile_shop',
    isActive: true,
    isEmailVerified: true,
  });
  await Membership.collection.insertOne({
    _id: id(),
    userId,
    organizationId: orgs[org],
    branchId: branches[org],
    role: 'staff',
    isActive: true,
  });
  return {
    Authorization: `Bearer ${tokenFor(userId)}`,
    'X-Branch-Id': String(branches[org]),
  };
};

const seedOrgs = async () => {
  const subscription = {
    planType: 'enterprise',
    status: 'active',
    paymentSource: 'manual',
    currentPeriodEnd: addDays(new Date(), 30),
  };
  await Organization.collection.insertMany([
    { _id: orgs.mobile, name: 'Mobile Shop', owner: id(), businessType: 'mobile_shop', countryCode: 'PK', subscription },
    { _id: orgs.factory, name: 'Factory', owner: id(), businessType: 'factory', countryCode: 'PK', subscription },
  ]);
  await Branch.collection.insertMany([
    { _id: branches.mobile, organizationId: orgs.mobile, name: 'Main', isActive: true },
    { _id: branches.factory, organizationId: orgs.factory, name: 'Plant', isActive: true },
  ]);
};

const PERMISSION_DENIED = /^You do not have permission to /;
const fillPath = (path) => path.replace(/:[A-Za-z]+/g, () => String(id()));

const call = async (route, headers) => {
  const req = request(app)
    [route.method](`/v1${fillPath(route.path)}`)
    .set(headers)
    .timeout({ response: 15000 });
  try {
    const res = await (route.method === 'get' || route.method === 'delete' ? req : req.send({}));
    return { status: res.status, message: (res.body && res.body.message) || '' };
  } catch (err) {
    // A handler that runs long (e.g. an external call with no network) did get past the gate.
    return { status: err.timeout ? 'timeout' : 'error', message: String(err.message || err) };
  }
};

const describeRoute = (r) => `${r.method.toUpperCase()} ${r.path}`;

describe('Role permission matrix', () => {
  beforeEach(seedOrgs);

  test('the route table was read', () => {
    expect(ROUTES.length).toBeGreaterThan(500);
    expect(guarded.length).toBeGreaterThan(300);
  });

  test('every business route checks a role permission', () => {
    expect(unguarded.map(describeRoute)).toEqual([]);
  });

  test('a role with no permissions is refused everywhere', async () => {
    const headers = { mobile: await userWith('mobile', []), factory: await userWith('factory', []) };
    const leaks = [];
    // One request at a time: some handlers share fixtures and the in-memory DB.
    // eslint-disable-next-line no-restricted-syntax
    for (const route of guarded) {
      // eslint-disable-next-line no-await-in-loop
      const res = await call(route, headers[orgFor(route.path)]);
      if (!(res.status === 403 && PERMISSION_DENIED.test(res.message))) {
        leaks.push(`${describeRoute(route)} → ${res.status} ${res.message}`.slice(0, 160));
      }
    }
    expect(leaks).toEqual([]);
  });

  test('the permission a route asks for is enough to pass its check', async () => {
    const cache = new Map();
    const blocked = [];
    // One request at a time: some handlers share fixtures and the in-memory DB.
    // eslint-disable-next-line no-restricted-syntax
    for (const route of guarded) {
      // The first key of each layer: an OR layer needs one, an AND layer needs all.
      const keys = [...new Set(route.perms.flatMap((p) => (p.all ? p.all : [p.any[0]])))];
      const org = orgFor(route.path);
      const cacheKey = `${org}:${keys.sort().join(',')}`;
      if (!cache.has(cacheKey)) {
        // eslint-disable-next-line no-await-in-loop
        cache.set(cacheKey, await userWith(org, keys));
      }
      // eslint-disable-next-line no-await-in-loop
      const res = await call(route, cache.get(cacheKey));
      if (res.status === 403 && PERMISSION_DENIED.test(res.message)) {
        blocked.push(`${describeRoute(route)} with [${keys.join(', ')}] → ${res.message}`);
      }
    }
    expect(blocked).toEqual([]);
  });
});
