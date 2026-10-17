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
const { Branch, Membership, Product, User, ChatEvent, ChatMessage } = require('../../src/models');
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

  test('attachments must come from our upload host', async () => {
    const orgId = channel((await as('ali').get('/v1/chat/conversations')).body, 'organization').id;
    const bad = await as('ali')
      .post(`/v1/chat/conversations/${orgId}/messages`)
      .send({ attachments: [{ url: 'https://evil.example/x.png' }] });
    expect(bad.status).toBe(400); // filtered out → empty message
    const ok = await as('ali')
      .post(`/v1/chat/conversations/${orgId}/messages`)
      .send({
        attachments: [
          { url: 'https://res.cloudinary.com/demo/image/upload/x.png', name: 'shelf.png', mimeType: 'image/png' },
        ],
      });
    expect(ok.body).toMatchObject({ kind: 'attachment' });
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
