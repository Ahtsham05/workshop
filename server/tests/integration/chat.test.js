// Fixed test credentials (dotenv never overrides a variable that is already set).
process.env.CLOUDINARY_CLOUD_NAME = 'logix-test';
process.env.CLOUDINARY_API_KEY = '1234567890';
process.env.CLOUDINARY_API_SECRET = 'test-secret';

const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const setupTestDB = require('../utils/setupTestDB');

const mockScope = {};
jest.mock('../../src/middlewares/auth', () => () => async (req, res, next) => {
  const { User: UserModel } = require('../../src/models');
  req.user = await UserModel.findById(mockScope.userId);
  next();
});
jest.mock('../../src/middlewares/branchScope', () => () => (req, res, next) => {
  req.organizationId = req.user && req.user.organizationId;
  req.branchId = mockScope.branchId;
  next();
});

const { errorConverter, errorHandler } = require('../../src/middlewares/error');
const {
  Branch,
  Membership,
  Organization,
  Product,
  User,
  ChatConversation,
  ChatEvent,
  ChatMessage,
} = require('../../src/models');
const chatRoute = require('../../src/routes/v1/chat.route');

setupTestDB();
jest.setTimeout(60000);

const app = express();
app.use(express.json());
app.use('/v1/chat', chatRoute);
app.use(errorConverter);
app.use(errorHandler);

// A fresh organization per test: the service caches "channels already created" per org.
let ORG;
let gulberg;
let dha;
let people;

const as = (who, branch) => {
  mockScope.userId = String(people[who]._id);
  mockScope.branchId = branch ? String(branch._id) : undefined;
  return request(app);
};

beforeEach(async () => {
  ORG = new mongoose.Types.ObjectId();
  const OTHER_ORG = new mongoose.Types.ObjectId();
  await Organization.create([
    { _id: ORG, name: 'Riaz Mobiles', owner: new mongoose.Types.ObjectId() },
    { _id: OTHER_ORG, name: 'Someone else', owner: new mongoose.Types.ObjectId() },
  ]);
  [gulberg, dha] = await Branch.create([
    { organizationId: ORG, name: 'Gulberg' },
    { organizationId: ORG, name: 'DHA' },
  ]);
  const mk = (name, extra = {}) =>
    User.create({ name, email: `${name.toLowerCase()}@example.com`, password: 'password1', organizationId: ORG, ...extra });
  people = {
    owner: await mk('Owner', { systemRole: 'superAdmin' }),
    ali: await mk('Ali'),
    sara: await mk('Sara'),
    bilal: await mk('Bilal'),
    parent: await mk('Parent', { schoolRole: 'parent' }),
    outsider: await User.create({
      name: 'Out',
      email: 'out@example.com',
      password: 'password1',
      organizationId: OTHER_ORG,
    }),
    // Points at an organization that no longer exists (a database copy / manual move left it behind).
    orphan: await User.create({
      name: 'Orphan',
      email: 'orphan@example.com',
      password: 'password1',
      organizationId: new mongoose.Types.ObjectId(),
    }),
  };
  await Membership.create([
    { userId: people.ali._id, organizationId: ORG, branchId: gulberg._id },
    { userId: people.sara._id, organizationId: ORG, branchId: dha._id },
    { userId: people.bilal._id, organizationId: ORG, branchId: dha._id },
  ]);
});

const channel = (list, type, branchId) =>
  list.find((c) => c.type === type && (!branchId || c.branchId === String(branchId)));

describe('channels', () => {
  test('All branches + own branch channels are created on first open, and scoped by membership', async () => {
    const ali = await as('ali', gulberg).get('/v1/chat/conversations');
    expect(ali.status).toBe(200);
    expect(ali.body.map((c) => `${c.type}:${c.name}`).sort()).toEqual(['branch:Gulberg', 'organization:All branches']);

    const owner = await as('owner').get('/v1/chat/conversations');
    expect(
      owner.body
        .filter((c) => c.type === 'branch')
        .map((c) => c.name)
        .sort()
    ).toEqual(['DHA', 'Gulberg']);

    // Ali cannot read DHA's channel, even by id.
    const dhaId = channel(owner.body, 'branch', dha._id).id;
    const peek = await as('ali').get(`/v1/chat/conversations/${dhaId}/messages`);
    expect(peek.status).toBe(404);
    const post = await as('ali').post(`/v1/chat/conversations/${dhaId}/messages`).send({ text: 'hi' });
    expect(post.status).toBe(404);
  });

  test('portal accounts and other organizations are kept out', async () => {
    expect((await as('parent').get('/v1/chat/conversations')).status).toBe(403);
    const ali = await as('ali').get('/v1/chat/conversations');
    const orgId = channel(ali.body, 'organization').id;
    expect((await as('outsider').get(`/v1/chat/conversations/${orgId}/messages`)).status).toBe(404);
  });
});

describe('messages, unread and read receipts', () => {
  test('a message in All branches is unread for others, carries the sender branch, and clears on read', async () => {
    const list = await as('ali', gulberg).get('/v1/chat/conversations');
    const orgId = channel(list.body, 'organization').id;

    const sent = await as('ali', gulberg)
      .post(`/v1/chat/conversations/${orgId}/messages`)
      .send({ text: 'Anyone have iPhone 15 cases?', clientId: 'c-1' });
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({
      text: 'Anyone have iPhone 15 cases?',
      senderName: 'Ali',
      senderBranchName: 'Gulberg',
      clientId: 'c-1',
      kind: 'text',
    });

    const saraList = await as('sara', dha).get('/v1/chat/conversations');
    const forSara = channel(saraList.body, 'organization');
    expect(forSara.unread).toBe(1);
    expect(forSara.lastMessage).toMatchObject({ text: 'Anyone have iPhone 15 cases?', senderName: 'Ali' });
    expect((await as('sara').get('/v1/chat/unread')).body.total).toBe(1);

    // The sender's own message never counts as unread for them.
    expect(channel((await as('ali').get('/v1/chat/conversations')).body, 'organization').unread).toBe(0);

    await as('sara').post(`/v1/chat/conversations/${orgId}/read`).send();
    expect((await as('sara').get('/v1/chat/unread')).body.total).toBe(0);

    // Muted conversations don't add to the header badge, but still count per thread.
    await as('ali', gulberg).post(`/v1/chat/conversations/${orgId}/messages`).send({ text: 'second' });
    await as('sara').patch(`/v1/chat/conversations/${orgId}/preferences`).send({ muted: true });
    expect((await as('sara').get('/v1/chat/unread')).body.total).toBe(0);
    expect(channel((await as('sara').get('/v1/chat/conversations')).body, 'organization')).toMatchObject({
      unread: 1,
      muted: true,
    });
  });

  test('history pages backwards with hasMore', async () => {
    const orgId = channel((await as('ali').get('/v1/chat/conversations')).body, 'organization').id;
    for (let i = 1; i <= 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await as('ali')
        .post(`/v1/chat/conversations/${orgId}/messages`)
        .send({ text: `m${i}` });
    }
    const page1 = await as('sara').get(`/v1/chat/conversations/${orgId}/messages?limit=3`);
    expect(page1.body.messages.map((m) => m.text)).toEqual(['m3', 'm4', 'm5']);
    expect(page1.body.hasMore).toBe(true);
    const page2 = await as('sara').get(
      `/v1/chat/conversations/${orgId}/messages?limit=3&before=${page1.body.messages[0].createdAt}`
    );
    expect(page2.body.messages.map((m) => m.text)).toEqual(['m1', 'm2']);
    expect(page2.body.hasMore).toBe(false);
  });

  test('edit / delete own only, reactions toggle, replies quote the original', async () => {
    const orgId = channel((await as('ali').get('/v1/chat/conversations')).body, 'organization').id;
    const first = (await as('ali').post(`/v1/chat/conversations/${orgId}/messages`).send({ text: 'Stock count at 6pm' }))
      .body;

    expect((await as('sara').patch(`/v1/chat/messages/${first.id}`).send({ text: 'hacked' })).status).toBe(403);
    const edited = await as('ali').patch(`/v1/chat/messages/${first.id}`).send({ text: 'Stock count at 7pm' });
    expect(edited.body.text).toBe('Stock count at 7pm');
    expect(edited.body.editedAt).toBeTruthy();

    const reply = await as('sara')
      .post(`/v1/chat/conversations/${orgId}/messages`)
      .send({ text: 'OK', replyToId: first.id });
    expect(reply.body.replyTo).toMatchObject({ text: 'Stock count at 7pm', senderName: 'Ali' });

    const r1 = await as('sara').post(`/v1/chat/messages/${first.id}/reactions`).send({ emoji: '👍' });
    expect(r1.body.reactions).toHaveLength(1);
    const r2 = await as('sara').post(`/v1/chat/messages/${first.id}/reactions`).send({ emoji: '👍' });
    expect(r2.body.reactions).toHaveLength(0);
    expect((await as('sara').post(`/v1/chat/messages/${first.id}/reactions`).send({ emoji: '💩' })).status).toBe(400);

    // An org admin can remove anyone's message (moderation); content is stripped, the slot stays.
    const removed = await as('owner').delete(`/v1/chat/messages/${first.id}`);
    expect(removed.body).toMatchObject({ text: '', reactions: [] });
    expect(removed.body.deletedAt).toBeTruthy();
    const history = await as('sara').get(`/v1/chat/conversations/${orgId}/messages`);
    expect(history.body.messages.find((m) => m.id === first.id).text).toBe('');
  });
});

describe('direct messages and groups', () => {
  test('direct thread is created once and private to the two people', async () => {
    const a = await as('ali')
      .post('/v1/chat/conversations/direct')
      .send({ userId: String(people.sara._id) });
    const b = await as('sara')
      .post('/v1/chat/conversations/direct')
      .send({ userId: String(people.ali._id) });
    expect(a.body.id).toBe(b.body.id);

    await as('ali', gulberg).post(`/v1/chat/conversations/${a.body.id}/messages`).send({ text: 'Can you send 2 chargers?' });
    expect((await as('bilal').get(`/v1/chat/conversations/${a.body.id}/messages`)).status).toBe(404);

    const saraList = await as('sara').get('/v1/chat/conversations');
    const dm = saraList.body.find((c) => c.id === a.body.id);
    expect(dm).toMatchObject({ type: 'direct', name: 'Ali', unread: 1 });

    expect(
      (
        await as('ali')
          .post('/v1/chat/conversations/direct')
          .send({ userId: String(people.outsider._id) })
      ).status
    ).toBe(400);
    expect(
      (
        await as('ali')
          .post('/v1/chat/conversations/direct')
          .send({ userId: String(people.parent._id) })
      ).status
    ).toBe(400);

    // Seen: Sara reads, Ali's view of the thread shows her lastReadAt.
    await as('sara').post(`/v1/chat/conversations/${a.body.id}/read`).send();
    const detail = await as('ali').get(`/v1/chat/conversations/${a.body.id}`);
    expect(detail.body.members.find((m) => m.name === 'Sara').lastReadAt).toBeTruthy();
  });

  test('groups: create, rename/add/remove by admins only, leave hands over admin', async () => {
    const created = await as('ali')
      .post('/v1/chat/conversations/group')
      .send({ name: 'Managers', participantIds: [String(people.sara._id)] });
    expect(created.status).toBe(201);
    const { id } = created.body;

    expect((await as('bilal').get(`/v1/chat/conversations/${id}/messages`)).status).toBe(404);
    expect((await as('sara').patch(`/v1/chat/conversations/${id}`).send({ name: 'Mine' })).status).toBe(403);

    await as('ali')
      .patch(`/v1/chat/conversations/${id}`)
      .send({ name: 'Branch managers', addIds: [String(people.bilal._id)] });
    const msgs = await as('bilal').get(`/v1/chat/conversations/${id}/messages`);
    expect(msgs.status).toBe(200);
    expect(msgs.body.messages.filter((m) => m.kind === 'system').map((m) => m.text)).toEqual([
      'Ali created the group "Managers"',
      'Ali renamed the group to "Branch managers" and added Bilal',
    ]);

    await as('ali').post(`/v1/chat/conversations/${id}/leave`).send();
    expect((await as('ali').get(`/v1/chat/conversations/${id}/messages`)).status).toBe(404);
    // Someone is still admin, so the group stays manageable.
    expect(
      (
        await as('sara')
          .patch(`/v1/chat/conversations/${id}`)
          .send({ removeIds: [String(people.bilal._id)] })
      ).status
    ).toBe(200);
  });

  test('directory lists staff with their branches, never portal accounts', async () => {
    const dir = await as('ali').get('/v1/chat/directory');
    const names = dir.body.map((p) => p.name).sort();
    expect(names).toEqual(['Ali', 'Bilal', 'Owner', 'Sara']);
    expect(dir.body.find((p) => p.name === 'Sara').branches).toEqual([{ id: String(dha._id), name: 'DHA' }]);
    expect(dir.body.find((p) => p.name === 'Owner')).toMatchObject({ allBranches: true, role: 'admin' });
  });
});

describe('product cards', () => {
  test('a shared product is snapshotted, and its stock is found in every branch by barcode', async () => {
    const mine = await Product.create({
      organizationId: ORG,
      branchId: gulberg._id,
      name: 'Anker 20W',
      barcode: '8901',
      stockQuantity: 1,
      cost: 2000,
      price: 2800,
    });
    await Product.create({
      organizationId: ORG,
      branchId: dha._id,
      name: 'Anker 20W Charger',
      barcode: '8901',
      stockQuantity: 14,
      cost: 2000,
      price: 2750,
    });

    const orgId = channel((await as('ali').get('/v1/chat/conversations')).body, 'organization').id;
    const sent = await as('ali', gulberg)
      .post(`/v1/chat/conversations/${orgId}/messages`)
      .send({ productId: String(mine._id), text: 'Need 5 of these' });
    expect(sent.body).toMatchObject({
      kind: 'product',
      text: 'Need 5 of these',
      product: { name: 'Anker 20W', price: 2800, stock: 1 },
    });
    const list = await as('sara').get('/v1/chat/conversations');
    expect(channel(list.body, 'organization').lastMessage.text).toBe('📦 Anker 20W — Need 5 of these');

    const stock = await as('sara').get(`/v1/chat/products/${mine._id}/stock`);
    expect(stock.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ branchName: 'Gulberg', stock: 1, price: 2800 }),
        expect.objectContaining({ branchName: 'DHA', stock: 14, price: 2750 }),
      ])
    );
  });

  test('attachments must come from OUR Cloudinary account', async () => {
    const orgId = channel((await as('ali').get('/v1/chat/conversations')).body, 'organization').id;
    const bad = await Promise.all(
      ['https://evil.example/x.png', 'https://res.cloudinary.com/someone-else/image/upload/x.png'].map((url) =>
        as('ali')
          .post(`/v1/chat/conversations/${orgId}/messages`)
          .send({ attachments: [{ url }] })
      )
    );
    expect(bad.map((r) => r.status)).toEqual([400, 400]); // filtered out → empty message
    const ok = await as('ali')
      .post(`/v1/chat/conversations/${orgId}/messages`)
      .send({
        attachments: [
          { url: 'https://res.cloudinary.com/logix-test/image/upload/x.png', name: 'shelf.png', mimeType: 'image/png' },
        ],
      });
    expect(ok.body).toMatchObject({ kind: 'attachment' });
  });

  test('signed direct uploads are locked to the organization folder', async () => {
    const cloudinary = require('cloudinary').v2;
    const res = await as('ali').post('/v1/chat/attachments/signature');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ cloudName: 'logix-test', apiKey: '1234567890', folder: `chat/${ORG}` });
    expect(res.body).not.toHaveProperty('apiSecret');
    const expected = cloudinary.utils.api_sign_request(
      { folder: `chat/${ORG}`, timestamp: res.body.timestamp },
      'test-secret'
    );
    expect(res.body.signature).toBe(expected);
    // Moving the upload to another folder (another organization) breaks the signature.
    expect(
      cloudinary.utils.api_sign_request({ folder: 'chat/other', timestamp: res.body.timestamp }, 'test-secret')
    ).not.toBe(res.body.signature);
    expect((await as('parent').post('/v1/chat/attachments/signature')).status).toBe(403);
    expect((await as('orphan').post('/v1/chat/attachments/signature')).status).toBe(403);
  });

  test('media messages: duration kept, WhatsApp-style previews in the list and in replies', async () => {
    const { id } = channel((await as('ali').get('/v1/chat/conversations')).body, 'organization');
    const media = (name, mimeType, extra = {}) => ({
      url: `https://res.cloudinary.com/logix-test/${mimeType.startsWith('image') ? 'image' : 'video'}/upload/chat/${name}`,
      name,
      mimeType,
      size: 1000,
      ...extra,
    });
    const send = (body) => as('ali').post(`/v1/chat/conversations/${id}/messages`).send(body);
    const preview = async () =>
      channel((await as('sara').get('/v1/chat/conversations')).body, 'organization').lastMessage.text;

    await send({ attachments: [media('a.jpg', 'image/jpeg', { width: 1200, height: 900 })] });
    expect(await preview()).toBe('📷 Photo');
    await send({ attachments: [media('a.jpg', 'image/jpeg'), media('b.jpg', 'image/jpeg')], text: 'new stock' });
    expect(await preview()).toBe('📷 new stock');
    const video = await send({
      attachments: [media('shelf.mp4', 'video/mp4', { duration: 12.4, width: 720, height: 1280 })],
    });
    expect(video.body.attachments[0]).toMatchObject({ duration: 12.4, width: 720, height: 1280 });
    expect(await preview()).toBe('🎥 Video');
    await send({ attachments: [media('note.mp3', 'audio/mpeg', { duration: 9 })] });
    expect(await preview()).toBe('🎵 Audio');
    await send({ attachments: [media('bill.pdf', 'application/pdf')] });
    expect(await preview()).toBe('📄 bill.pdf');
    const reply = await as('sara')
      .post(`/v1/chat/conversations/${id}/messages`)
      .send({ text: 'nice', replyToId: video.body.id });
    expect(reply.body.replyTo.text).toBe('🎥 Video');
  });

  test('voice notes: waveform + length kept, 🎤 preview, played once per listener', async () => {
    const { id } = channel((await as('ali').get('/v1/chat/conversations')).body, 'organization');
    const url = 'https://res.cloudinary.com/logix-test/video/upload/chat/voice.webm';
    const waveform = [4, 30, 100, 62, 12];
    const sent = await as('ali')
      .post(`/v1/chat/conversations/${id}/messages`)
      .send({ attachments: [{ url, name: 'Voice message.webm', mimeType: 'audio/webm', size: 9000, duration: 13.2, voice: true, waveform }] });
    expect(sent.status).toBe(201);
    expect(sent.body.attachments[0]).toMatchObject({ voice: true, waveform, duration: 13.2 });
    expect(sent.body.playedBy).toEqual([]);
    const list = (await as('sara').get('/v1/chat/conversations')).body;
    expect(channel(list, 'organization').lastMessage.text).toBe('🎤 Voice message (0:13)');

    // Out-of-range bars are refused; "voice" on a non-audio file is dropped.
    const bad = await as('ali')
      .post(`/v1/chat/conversations/${id}/messages`)
      .send({ attachments: [{ url, mimeType: 'audio/webm', voice: true, waveform: [101] }] });
    expect(bad.status).toBe(400);
    const pdf = await as('ali')
      .post(`/v1/chat/conversations/${id}/messages`)
      .send({ attachments: [{ url: url.replace('voice.webm', 'x.pdf'), name: 'x.pdf', mimeType: 'application/pdf', voice: true }] });
    expect(pdf.body.attachments[0].voice).toBe(false);
    expect((await as('ali').post(`/v1/chat/messages/${pdf.body.id}/played`)).status).toBe(404);

    // The sender playing their own note doesn't count; each listener counts once.
    expect((await as('ali').post(`/v1/chat/messages/${sent.body.id}/played`)).body.playedBy).toEqual([]);
    const played = await as('sara').post(`/v1/chat/messages/${sent.body.id}/played`);
    expect(played.body.playedBy).toEqual([String(people.sara._id)]);
    expect((await as('sara').post(`/v1/chat/messages/${sent.body.id}/played`)).body.playedBy).toHaveLength(1);
    const events = await ChatEvent.find({ event: 'chat:message-updated' }).lean();
    expect(events.some((e) => (e.payload?.message?.playedBy || []).map(String).includes(String(people.sara._id)))).toBe(true);
  });
});

describe('search + relay', () => {
  test('search only covers conversations you can read', async () => {
    const ownerList = (await as('owner').get('/v1/chat/conversations')).body;
    await as('sara', dha)
      .post(`/v1/chat/conversations/${channel(ownerList, 'branch', dha._id).id}/messages`)
      .send({ text: 'DHA secret samsung price' });
    await as('ali')
      .post(`/v1/chat/conversations/${channel(ownerList, 'organization').id}/messages`)
      .send({ text: 'samsung A55 arrived' });
    const ali = await as('ali').get('/v1/chat/search?q=samsung');
    expect(ali.body.map((r) => r.text)).toEqual(['samsung A55 arrived']);
    const owner = await as('owner').get('/v1/chat/search?q=samsung');
    expect(owner.body).toHaveLength(2);
  });

  test('every message is written to the cross-process relay with its audience rooms', async () => {
    const list = (await as('ali').get('/v1/chat/conversations')).body;
    await as('ali', gulberg)
      .post(`/v1/chat/conversations/${channel(list, 'branch', gulberg._id).id}/messages`)
      .send({ text: 'relay me' });
    // The relay write is fire-and-forget; give it a tick.
    await new Promise((r) => setTimeout(r, 200));
    const events = await ChatEvent.find({ event: 'chat:message' }).lean();
    expect(events).toHaveLength(1);
    expect(events[0].rooms).toEqual([`branch:${gulberg._id}`, `orgadmins:${ORG}`]);
    expect(events[0].payload.message.text).toBe('relay me');
    expect(await ChatMessage.countDocuments()).toBe(1);
  });
});

describe('accounts left on an organization that no longer exists', () => {
  test('are refused with a reason instead of getting a private one-person "All branches"', async () => {
    const res = await as('orphan').get('/v1/chat/conversations');
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/not linked to an active organization/);
    expect((await as('orphan').get('/v1/chat/directory')).status).toBe(403);
    expect((await as('orphan').get('/v1/chat/unread')).status).toBe(403);
    expect((await as('orphan').post('/v1/chat/attachments')).status).toBe(403);
    // The bug: opening chat used to lazily create channels for the dead organization.
    expect(await ChatConversation.countDocuments({ organizationId: people.orphan.organizationId })).toBe(0);

    const orgId = channel((await as('ali').get('/v1/chat/conversations')).body, 'organization').id;
    const post = await as('orphan').post(`/v1/chat/conversations/${orgId}/messages`).send({ text: 'hello?' });
    expect(post.status).toBe(403);
    expect(await ChatMessage.countDocuments()).toBe(0);
  });

  test('once relinked to the real organization they share the same rooms as everyone else', async () => {
    await User.updateOne({ _id: people.orphan._id }, { $set: { organizationId: ORG } });
    await Membership.create({ userId: people.orphan._id, organizationId: ORG, branchId: gulberg._id });

    const orphan = (await as('orphan').get('/v1/chat/conversations')).body;
    const owner = (await as('owner').get('/v1/chat/conversations')).body;
    expect(channel(orphan, 'organization').id).toBe(channel(owner, 'organization').id);
    expect(channel(orphan, 'branch', gulberg._id)).toBeTruthy();

    await as('orphan', gulberg)
      .post(`/v1/chat/conversations/${channel(orphan, 'organization').id}/messages`)
      .send({ text: 'Hi' });
    const seen = await as('owner').get(`/v1/chat/conversations/${channel(owner, 'organization').id}/messages`);
    expect(seen.body.messages.map((m) => `${m.senderName}: ${m.text}`)).toEqual(['Orphan: Hi']);
    const detail = await as('owner').get(`/v1/chat/conversations/${channel(owner, 'organization').id}`);
    expect(detail.body.members.map((m) => m.name)).toContain('Orphan');
  });
});

describe('WhatsApp ticks: sent → delivered → read, and last seen', () => {
  const chatService = require('../../src/services/chat.service');
  const statusIn = async (who, id) =>
    (await as(who).get('/v1/chat/conversations')).body.find((c) => c.id === id).lastMessage.status;

  test('direct: single tick, grey double once her device has it, blue once she reads', async () => {
    const dm = (
      await as('ali')
        .post('/v1/chat/conversations/direct')
        .send({ userId: String(people.sara._id) })
    ).body.id;
    const sent = await as('ali').post(`/v1/chat/conversations/${dm}/messages`).send({ text: 'stock?' });
    expect(await statusIn('ali', dm)).toBe('sent');

    // Her app loading the list (any page — the provider keeps it subscribed) = delivered.
    await as('sara').get('/v1/chat/conversations');
    expect(await statusIn('ali', dm)).toBe('delivered');
    let detail = await as('ali').get(`/v1/chat/conversations/${dm}`);
    const sara = detail.body.members.find((m) => m.name === 'Sara');
    expect(new Date(sara.lastDeliveredAt) >= new Date(sent.body.createdAt)).toBe(true);
    expect(sara.lastReadAt).toBeNull();

    await as('sara').post(`/v1/chat/conversations/${dm}/read`).send();
    expect(await statusIn('ali', dm)).toBe('read');
    detail = await as('ali').get(`/v1/chat/conversations/${dm}`);
    expect(detail.body.members.find((m) => m.name === 'Sara').lastReadAt).toBeTruthy();

    // A newer message starts again at a single tick; the socket ack (markDelivered) greys it.
    const next = await as('ali').post(`/v1/chat/conversations/${dm}/messages`).send({ text: 'and cables?' });
    expect(await statusIn('ali', dm)).toBe('sent');
    await chatService.markDelivered(people.sara, dm, next.body.createdAt);
    expect(await statusIn('ali', dm)).toBe('delivered');

    // Each step was pushed to the conversation with the newest message's status.
    await new Promise((r) => setTimeout(r, 200));
    const receipts = await ChatEvent.find({ event: 'chat:receipt' }).sort({ _id: 1 }).lean();
    const fromSara = receipts.filter((e) => e.payload.userId === String(people.sara._id));
    expect(fromSara.map((e) => e.payload.lastMessageStatus)).toEqual(['delivered', 'read', 'delivered']);
    expect(fromSara[0].rooms.sort()).toEqual([`user:${people.ali._id}`, `user:${people.sara._id}`].sort());
  });

  test('a skewed client clock cannot pre-deliver messages that do not exist yet', async () => {
    const dm = (
      await as('ali')
        .post('/v1/chat/conversations/direct')
        .send({ userId: String(people.sara._id) })
    ).body.id;
    await chatService.markDelivered(people.sara, dm, new Date(Date.now() + 60 * 60 * 1000).toISOString());
    await new Promise((r) => setTimeout(r, 20));
    await as('ali').post(`/v1/chat/conversations/${dm}/messages`).send({ text: 'after the ack' });
    expect(await statusIn('ali', dm)).toBe('sent');
    await expect(chatService.markDelivered(people.bilal, dm, new Date().toISOString())).rejects.toThrow(
      'Conversation not found'
    );
  });

  test('channels: double tick only once EVERY other member has it, blue once everyone read', async () => {
    const { id } = channel((await as('ali').get('/v1/chat/conversations')).body, 'organization');
    await as('ali').post(`/v1/chat/conversations/${id}/messages`).send({ text: 'closing early' });
    // Members: owner, sara, bilal (the parent portal login is not staff).
    await as('owner').get('/v1/chat/conversations');
    await as('sara').get('/v1/chat/conversations');
    expect(await statusIn('ali', id)).toBe('sent');
    await as('bilal').get('/v1/chat/conversations');
    expect(await statusIn('ali', id)).toBe('delivered');
    await as('owner').post(`/v1/chat/conversations/${id}/read`).send();
    await as('sara').post(`/v1/chat/conversations/${id}/read`).send();
    expect(await statusIn('ali', id)).toBe('delivered');
    await as('bilal').post(`/v1/chat/conversations/${id}/read`).send();
    expect(await statusIn('ali', id)).toBe('read');
    // Someone else's newest message carries no status for me.
    await as('sara').post(`/v1/chat/conversations/${id}/messages`).send({ text: 'ok' });
    expect(await statusIn('ali', id)).toBeNull();
  });

  test('a deactivated branch member does not hold the ticks at grey forever', async () => {
    await Membership.create({ userId: people.owner._id, organizationId: ORG, branchId: dha._id });
    const { id } = channel((await as('sara', dha).get('/v1/chat/conversations')).body, 'branch', dha._id);
    await User.updateOne({ _id: people.bilal._id }, { $set: { isActive: false } });
    await as('sara', dha).post(`/v1/chat/conversations/${id}/messages`).send({ text: 'dha only' });
    await as('owner').post(`/v1/chat/conversations/${id}/read`).send();
    expect(await statusIn('sara', id)).toBe('read');
  });

  test('last seen is part of every person payload', async () => {
    const seen = new Date('2026-10-17T17:43:00Z');
    await User.updateOne({ _id: people.sara._id }, { $set: { lastSeenAt: seen } });
    const dm = (
      await as('ali')
        .post('/v1/chat/conversations/direct')
        .send({ userId: String(people.sara._id) })
    ).body.id;
    const row = (await as('ali').get('/v1/chat/conversations')).body.find((c) => c.id === dm);
    expect(new Date(row.directUser.lastSeenAt).toISOString()).toBe(seen.toISOString());
    const detail = await as('ali').get(`/v1/chat/conversations/${dm}`);
    expect(new Date(detail.body.members.find((m) => m.name === 'Sara').lastSeenAt).toISOString()).toBe(seen.toISOString());
    const dir = await as('ali').get('/v1/chat/directory');
    expect(new Date(dir.body.find((p) => p.name === 'Sara').lastSeenAt).toISOString()).toBe(seen.toISOString());
  });
});
