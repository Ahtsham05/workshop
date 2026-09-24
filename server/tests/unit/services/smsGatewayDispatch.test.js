const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const svc = require('../../../src/services/smsGateway.service');
const SmsDevice = require('../../../src/models/smsDevice.model');
const SmsGatewayMessage = require('../../../src/models/smsGatewayMessage.model');

let mongod;
const ORG = new mongoose.Types.ObjectId();
const BRANCH = new mongoose.Types.ObjectId();

// Stands in for the phone's socket: records what the server tried to send it.
function fakeSocket() {
  const sent = [];
  return { sent, emit: (evt, payload) => { if (evt === 'sms:send') sent.push(payload); } };
}

async function makeDevice({ deviceId, lastSeenMsAgo, isOnline = true }) {
  return SmsDevice.create({
    organizationId: ORG, branchId: BRANCH, deviceId, token: `tok-${deviceId}`,
    deviceName: deviceId, isOnline, simSlot: 0,
    lastSeen: lastSeenMsAgo === null ? null : new Date(Date.now() - lastSeenMsAgo),
  });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterAll(async () => { svc.stopPendingSmsDrainer(); await mongoose.disconnect(); await mongod.stop(); });
afterEach(async () => {
  await SmsDevice.deleteMany({}); await SmsGatewayMessage.deleteMany({});
  ['a', 'b'].forEach((id) => svc.unregisterSocket(id));
});

describe('isDeviceLive', () => {
  test('fresh heartbeat counts as live even with no local socket', () => {
    expect(svc.isDeviceLive({ isOnline: true, lastSeen: new Date() })).toBe(true);
  });
  test('heartbeat older than two missed pings is stale', () => {
    expect(svc.isDeviceLive({ isOnline: true, lastSeen: new Date(Date.now() - 95_000) })).toBe(false);
  });
  test('cleanly disconnected device is not live', () => {
    expect(svc.isDeviceLive({ isOnline: false, lastSeen: new Date() })).toBe(false);
  });
  test('device that never connected is not live', () => {
    expect(svc.isDeviceLive({ isOnline: true, lastSeen: null })).toBe(false);
  });
});

describe('send with the socket held by THIS process', () => {
  test('emits immediately and marks dispatched', async () => {
    await makeDevice({ deviceId: 'a', lastSeenMsAgo: 1000 });
    const sock = fakeSocket();
    svc.registerSocket('a', sock);

    const msg = await svc.sendSms({ organizationId: ORG, branchId: BRANCH, to: '03001234567', message: 'hi' });

    expect(sock.sent).toHaveLength(1);
    expect(sock.sent[0].to).toBe('03001234567');
    expect((await SmsGatewayMessage.findById(msg._id)).status).toBe('dispatched');
  });
});

describe('send when the phone is on ANOTHER process (the reported bug)', () => {
  test('is accepted, left pending, then delivered by the owning process drainer', async () => {
    // Device is live by heartbeat but this process holds no socket for it.
    await makeDevice({ deviceId: 'a', lastSeenMsAgo: 1000 });

    const msg = await svc.sendSms({ organizationId: ORG, branchId: BRANCH, to: '03009999999', message: 'fee due' });
    expect((await SmsGatewayMessage.findById(msg._id)).status).toBe('pending');

    // Now the process that owns the socket runs its drain tick.
    const sock = fakeSocket();
    svc.registerSocket('a', sock);
    const count = await svc.drainPendingForLocalDevices();

    expect(count).toBe(1);
    expect(sock.sent.map((s) => s.to)).toEqual(['03009999999']);
    expect((await SmsGatewayMessage.findById(msg._id)).status).toBe('dispatched');
  });

  test('bulk send reaches every parent via the drainer', async () => {
    await makeDevice({ deviceId: 'a', lastSeenMsAgo: 1000 });
    const recipients = Array.from({ length: 5 }, (_, i) => ({ phone: `030000000${i}`, name: `P${i}`, message: `Dear P${i}` }));

    const res = await svc.sendBulkPersonalized({ organizationId: ORG, branchId: BRANCH, recipients, source: 'school_broadcast' });
    expect(res.sent).toBe(5);
    expect(await SmsGatewayMessage.countDocuments({ status: 'pending' })).toBe(5);

    const sock = fakeSocket();
    svc.registerSocket('a', sock);
    expect(await svc.drainPendingForLocalDevices()).toBe(5);
    expect(sock.sent).toHaveLength(5);
    expect(await SmsGatewayMessage.countDocuments({ status: 'dispatched' })).toBe(5);
  });
});

describe('safety', () => {
  test('a message is never sent twice, even if two processes drain at once', async () => {
    await makeDevice({ deviceId: 'a', lastSeenMsAgo: 1000 });
    await svc.sendSms({ organizationId: ORG, branchId: BRANCH, to: '03005555555', message: 'once' });

    const sock = fakeSocket();
    svc.registerSocket('a', sock);
    const [x, y] = await Promise.all([svc.drainPendingForLocalDevices(), svc.drainPendingForLocalDevices()]);

    expect(x + y).toBe(1);
    expect(sock.sent).toHaveLength(1);
  });

  test('a genuinely dead phone still fails fast instead of queueing silently', async () => {
    await makeDevice({ deviceId: 'a', lastSeenMsAgo: 95_000 }); // stale heartbeat
    await expect(
      svc.sendSms({ organizationId: ORG, branchId: BRANCH, to: '03001111111', message: 'x' }),
    ).rejects.toThrow(/No SMS gateway device/i);
    expect(await SmsGatewayMessage.countDocuments({ status: 'failed' })).toBe(1);
  });

  test('bulk to a dead phone writes no per-student failure rows', async () => {
    await makeDevice({ deviceId: 'a', lastSeenMsAgo: 95_000 });
    await expect(
      svc.sendBulkPersonalized({
        organizationId: ORG, branchId: BRANCH,
        recipients: Array.from({ length: 200 }, (_, i) => ({ phone: `0300${i}`, message: 'm' })),
      }),
    ).rejects.toThrow(/No SMS gateway device/i);
    expect(await SmsGatewayMessage.countDocuments({})).toBe(0);
  });

  test('stale pending messages are left alone rather than fired late', async () => {
    await makeDevice({ deviceId: 'a', lastSeenMsAgo: 1000 });
    await SmsGatewayMessage.create({
      organizationId: ORG, branchId: BRANCH, deviceId: 'a', to: '0300222', message: 'old',
      status: 'pending', createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    });
    const sock = fakeSocket();
    svc.registerSocket('a', sock);
    expect(await svc.drainPendingForLocalDevices()).toBe(0);
    expect(sock.sent).toHaveLength(0);
  });

  test('listDevices reports heartbeat liveness, not the raw column', async () => {
    await makeDevice({ deviceId: 'a', lastSeenMsAgo: 1000 });
    await makeDevice({ deviceId: 'b', lastSeenMsAgo: 95_000 }); // isOnline:true but stale
    const list = await svc.listDevices({ organizationId: ORG, branchId: BRANCH });
    expect(list.find((d) => d.deviceId === 'a').isOnline).toBe(true);
    expect(list.find((d) => d.deviceId === 'b').isOnline).toBe(false);
  });

  test('gateway status agrees with the device list', async () => {
    await makeDevice({ deviceId: 'b', lastSeenMsAgo: 95_000 });
    const status = await svc.getGatewayStatus({ organizationId: ORG, branchId: BRANCH });
    expect(status.connected).toBe(false);
    expect(status.totalDevices).toBe(1);

    await SmsDevice.updateOne({ deviceId: 'b' }, { lastSeen: new Date() });
    const status2 = await svc.getGatewayStatus({ organizationId: ORG, branchId: BRANCH });
    expect(status2.connected).toBe(true);
  });
});

// ── Built-in template catalogue ───────────────────────────────────────────────
// These are the messages a school sends to hundreds of parents at once, so a template
// that quietly grows past one segment, or picks up a curly quote or an em dash, doubles
// or quadruples their bill. Guarded here so edits to the catalogue can't regress that.
describe('built-in school SMS templates', () => {
  const { TEMPLATES, SAMPLE_CONTEXT, CATEGORIES } = require('../../../src/config/schoolSmsTemplates');
  const { analyzeBody } = require('../../../src/utils/smsSegments');

  const render = (body) =>
    Object.entries(SAMPLE_CONTEXT).reduce(
      (text, [k, v]) => text.replace(new RegExp(`\\{${k}\\}`, 'gi'), v),
      body,
    );

  test.each(TEMPLATES.map((t) => [t.id, t]))('%s fits one GSM-7 segment when filled in', (_id, tpl) => {
    const info = analyzeBody(render(tpl.body));
    expect(info.encoding).toBe('GSM-7');
    expect(info.segments).toBe(1);
  });

  test('every template declares a known category and context', () => {
    TEMPLATES.forEach((t) => {
      expect(CATEGORIES).toContain(t.category);
      expect(['broadcast', 'fee_alert']).toContain(t.context);
    });
  });

  test('template ids are unique', () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
  });

  test('only fee_alert templates use voucher placeholders', () => {
    const voucherOnly = /\{(amount|month|year|feeType|status)\}/i;
    TEMPLATES.filter((t) => t.context === 'broadcast').forEach((t) => {
      expect(t.body).not.toMatch(voucherOnly);
    });
  });
});
