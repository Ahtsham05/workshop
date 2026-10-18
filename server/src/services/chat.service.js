const mongoose = require('mongoose');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const { escapeRegex } = require('../utils/listSearchFilter');
const ChatConversation = require('../models/chatConversation.model');
const ChatMessage = require('../models/chatMessage.model');
const ChatReadState = require('../models/chatReadState.model');
const { User, Branch, Membership, Product, Organization } = require('../models');
const chatBus = require('../socket/chatBus');
const logger = require('../config/logger');
const config = require('../config/config');
const cloudinary = require('../config/cloudinary');

/**
 * Team chat between the branches of one organization.
 *
 * Access is decided per conversation type (see chatConversation.model.js) and always
 * re-checked here — the socket layer only relays, it never grants anything.
 */

const oid = (id) => new mongoose.Types.ObjectId(String(id));
const idStr = (id) => (id && id._id ? String(id._id) : String(id));

const MAX_TEXT = 4000;
const PAGE_SIZE = 40;
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const REACTIONS = ['👍', '✅', '❤️', '😂', '🙏', '❓', '👀', '🔥'];

const isAdmin = (user) => user.systemRole === 'superAdmin' || user.systemRole === 'system_admin';

const isPortalUser = (user) =>
  !!user.linkedTeacherId ||
  (Array.isArray(user.linkedStudentIds) && user.linkedStudentIds.length > 0) ||
  ['teacher', 'parent', 'student'].includes(user.schoolRole);

const ORPHANED_ACCOUNT_MESSAGE =
  'Your account is not linked to an active organization, so team chat is unavailable. Ask your admin to re-add you to a branch.';

// Organizations confirmed to exist (orgId → checkedAt). Only hits are cached, so a relinked
// account works on its very next request.
const ORG_CHECK_TTL = 60 * 1000;
const orgCheckedAt = new Map();

/**
 * Everything is scoped by user.organizationId, so an account pointing at an organization
 * that no longer exists (left behind by a database copy or a manual move) would otherwise
 * get its own private, one-person "All branches" channel — it looks like chat works, but
 * nobody ever sees what it sends. Refuse it with a reason instead.
 */
async function assertChatUser(user) {
  if (!user || !user.organizationId) throw new ApiError(httpStatus.FORBIDDEN, 'Chat needs an organization');
  if (isPortalUser(user)) throw new ApiError(httpStatus.FORBIDDEN, 'Team chat is for staff accounts');
  const key = String(user.organizationId);
  const checkedAt = orgCheckedAt.get(key);
  if (checkedAt && Date.now() - checkedAt < ORG_CHECK_TTL) return;
  if (!(await Organization.exists({ _id: user.organizationId }))) throw new ApiError(httpStatus.FORBIDDEN, ORPHANED_ACCOUNT_MESSAGE);
  orgCheckedAt.set(key, Date.now());
}

/* ── Who belongs where ───────────────────────────────────────────────────── */

async function getUserBranchIds(user) {
  if (isAdmin(user)) {
    const branches = await Branch.find({ organizationId: user.organizationId }).select('_id').lean();
    return branches.map((b) => String(b._id));
  }
  const memberships = await Membership.find({ userId: user._id, organizationId: user.organizationId, isActive: true })
    .select('branchId')
    .lean();
  return memberships.map((m) => String(m.branchId));
}

/** Socket rooms a conversation's events go to. */
function audienceRooms(conversation) {
  const orgId = idStr(conversation.organizationId);
  if (conversation.type === 'organization') return [`org:${orgId}`];
  if (conversation.type === 'branch') {
    // Org admins see every branch channel without a membership row, so they get their own room.
    return [`branch:${idStr(conversation.branchId)}`, `orgadmins:${orgId}`];
  }
  return (conversation.participants || []).map((p) => `user:${idStr(p)}`);
}

/** Lazily creates the "All branches" channel and one channel per branch (cached per process). */
const channelsEnsuredAt = new Map();
async function ensureChannels(organizationId) {
  const key = String(organizationId);
  const last = channelsEnsuredAt.get(key);
  if (last && Date.now() - last < 5 * 60 * 1000) return;
  const branches = await Branch.find({ organizationId }).select('_id name').lean();
  const ops = [
    {
      updateOne: {
        filter: { organizationId: oid(organizationId), type: 'organization', branchId: null },
        update: { $setOnInsert: { organizationId: oid(organizationId), type: 'organization', branchId: null, name: 'All branches' } },
        upsert: true,
      },
    },
    ...branches.map((branch) => ({
      updateOne: {
        filter: { organizationId: oid(organizationId), type: 'branch', branchId: branch._id },
        update: { $setOnInsert: { organizationId: oid(organizationId), type: 'branch', branchId: branch._id, name: branch.name } },
        upsert: true,
      },
    })),
  ];
  try {
    await ChatConversation.bulkWrite(ops, { ordered: false });
  } catch (err) {
    // Two first-opens racing each other: the unique index rejects the loser, which is fine.
    if (err.code !== 11000 && !(err.writeErrors || []).every((e) => e.code === 11000)) throw err;
  }
  channelsEnsuredAt.set(key, Date.now());
}

async function canAccess(user, conversation, branchIds) {
  if (!conversation || String(conversation.organizationId) !== String(user.organizationId)) return false;
  if (conversation.type === 'organization') return true;
  if (conversation.type === 'branch') {
    const ids = branchIds || (await getUserBranchIds(user));
    return ids.includes(String(conversation.branchId));
  }
  return (conversation.participants || []).some((p) => idStr(p) === String(user._id));
}

async function getAccessibleConversation(user, conversationId) {
  await assertChatUser(user);
  if (!mongoose.Types.ObjectId.isValid(String(conversationId))) throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
  const conversation = await ChatConversation.findById(conversationId);
  if (!(await canAccess(user, conversation))) throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
  return conversation;
}

/** Everyone who can read a conversation (for "seen by" and the members panel). */
async function conversationMemberIds(conversation) {
  const orgId = conversation.organizationId;
  if (conversation.type === 'direct' || conversation.type === 'group') return (conversation.participants || []).map(idStr);
  const admins = await User.find({ organizationId: orgId, systemRole: { $in: ['superAdmin', 'system_admin'] } }).select('_id').lean();
  if (conversation.type === 'organization') {
    const users = await User.find({ organizationId: orgId, isActive: { $ne: false } }).select('_id linkedTeacherId linkedStudentIds schoolRole').lean();
    return users.filter((u) => !isPortalUser(u)).map((u) => String(u._id));
  }
  const memberships = await Membership.find({ branchId: conversation.branchId, isActive: true }).select('userId').lean();
  const ids = [...new Set([...memberships.map((m) => String(m.userId)), ...admins.map((a) => String(a._id))])];
  // A deactivated account would never read anything, holding every tick at grey forever.
  const active = await User.find({ _id: { $in: ids }, isActive: { $ne: false } }).select('_id').lean();
  return active.map((u) => String(u._id));
}

// Receipts recompute a message's status on every delivery/read, so channel membership
// (a few queries) is cached briefly. Direct and group threads carry theirs on the document.
const MEMBER_TTL = 60 * 1000;
const memberCache = new Map(); // conversationId → { ids, at }
async function cachedMemberIds(conversation) {
  if (conversation.type === 'direct' || conversation.type === 'group') return (conversation.participants || []).map(idStr);
  const key = String(conversation._id);
  const hit = memberCache.get(key);
  if (hit && Date.now() - hit.at < MEMBER_TTL) return hit.ids;
  const ids = await conversationMemberIds(conversation);
  memberCache.set(key, { ids, at: Date.now() });
  return ids;
}

/* ── Delivery + read receipts (WhatsApp ticks) ───────────────────────────── */

const time = (d) => (d ? new Date(d).getTime() : 0);
const latest = (a, b) => (time(a) >= time(b) ? a || null : b || null);

/**
 * A message's status for its sender, from everyone else's read-state:
 *   'read'      every other member has read past it        (blue double tick)
 *   'delivered' every other member's device has received it (grey double tick)
 *   'sent'      saved on the server                         (single tick)
 * Like WhatsApp groups, a channel or group needs ALL other members for each step.
 */
function statusFrom(createdAt, otherIds, stateBy) {
  if (!otherIds.length) return 'sent';
  const at = time(createdAt);
  let read = true;
  for (const id of otherIds) {
    const state = stateBy.get(id);
    if (time(latest(state?.lastDeliveredAt, state?.lastReadAt)) < at) return 'sent';
    if (time(state?.lastReadAt) < at) read = false;
  }
  return read ? 'read' : 'delivered';
}

/** Status of the conversation's newest message (what the conversation list shows). */
async function lastMessageStatus(conversation) {
  const last = conversation.lastMessage;
  if (!last || !last.at || last.kind === 'system' || !last.senderId) return null;
  const others = (await cachedMemberIds(conversation)).filter((id) => id !== String(last.senderId));
  const states = others.length
    ? await ChatReadState.find({ conversationId: conversation._id, userId: { $in: others.map(oid) } })
        .select('userId lastReadAt lastDeliveredAt')
        .lean()
    : [];
  return statusFrom(last.at, others, new Map(states.map((st) => [String(st.userId), st])));
}

/**
 * Tells everyone in the conversation how far `userId` has received and read, plus the
 * resulting status of the newest message — so senders can update ticks in the open thread
 * (from member read-states) and in the conversation list (from lastMessageStatus).
 */
async function publishReceipt(conversation, userId) {
  const state = await ChatReadState.findOne({ conversationId: conversation._id, userId })
    .select('lastReadAt lastDeliveredAt')
    .lean();
  const payload = {
    conversationId: String(conversation._id),
    userId: String(userId),
    lastReadAt: state?.lastReadAt || null,
    lastDeliveredAt: latest(state?.lastDeliveredAt, state?.lastReadAt),
  };
  const last = conversation.lastMessage;
  if (last && last.at && last.senderId && String(last.senderId) !== String(userId)) {
    payload.lastMessageAt = last.at;
    payload.lastMessageStatus = await lastMessageStatus(conversation);
  }
  chatBus.publish(audienceRooms(conversation), 'chat:receipt', payload);
}

// Receipts are best-effort; a failure must never fail the request that triggered them.
const logReceiptError = (err) => logger.warn(`[chat] receipt failed: ${err && err.message}`);

/* ── People ──────────────────────────────────────────────────────────────── */

const PERSON_FIELDS = 'name email photo systemRole isActive linkedTeacherId linkedStudentIds schoolRole lastSeenAt';

/** Staff of the organization with the branches each works in. */
async function listDirectory(user, { onlineIds = new Set() } = {}) {
  await assertChatUser(user);
  const [users, memberships, branches] = await Promise.all([
    User.find({ organizationId: user.organizationId, isActive: { $ne: false } }).select(PERSON_FIELDS).lean(),
    Membership.find({ organizationId: user.organizationId, isActive: true }).select('userId branchId role').lean(),
    Branch.find({ organizationId: user.organizationId }).select('_id name').lean(),
  ]);
  const branchName = new Map(branches.map((b) => [String(b._id), b.name]));
  const byUser = new Map();
  memberships.forEach((m) => {
    const list = byUser.get(String(m.userId)) || [];
    if (branchName.has(String(m.branchId))) list.push({ id: String(m.branchId), name: branchName.get(String(m.branchId)) });
    byUser.set(String(m.userId), list);
  });
  return users
    .filter((u) => !isPortalUser(u))
    .map((u) => ({
      id: String(u._id),
      name: u.name || u.email,
      email: u.email,
      photoUrl: u.photo?.url || '',
      role: isAdmin(u) ? 'admin' : 'staff',
      branches: isAdmin(u) ? [] : byUser.get(String(u._id)) || [],
      allBranches: isAdmin(u),
      online: onlineIds.has(String(u._id)),
      lastSeenAt: u.lastSeenAt || null,
      isMe: String(u._id) === String(user._id),
    }))
    .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
}

/* ── Conversation list ───────────────────────────────────────────────────── */

async function listConversations(user, { onlineIds = new Set() } = {}) {
  await assertChatUser(user);
  await ensureChannels(user.organizationId);
  const branchIds = await getUserBranchIds(user);
  const conversations = await ChatConversation.find({
    organizationId: user.organizationId,
    $or: [
      { type: 'organization' },
      { type: 'branch', branchId: { $in: branchIds.map(oid) } },
      { type: { $in: ['direct', 'group'] }, participants: user._id },
    ],
  }).lean();

  const ids = conversations.map((c) => c._id);
  const readStates = await ChatReadState.find({ userId: user._id, conversationId: { $in: ids } }).lean();
  const stateBy = new Map(readStates.map((s) => [String(s.conversationId), s]));

  // This device now holds every conversation up to its newest message: mark them delivered
  // (the grey double tick). The socket acks single messages live; this covers coming back
  // online and the polling fallback when websockets are unavailable.
  const undelivered = conversations.filter((c) => {
    const state = stateBy.get(String(c._id));
    return c.lastMessageAt && time(c.lastMessageAt) > time(latest(state?.lastDeliveredAt, state?.lastReadAt));
  });
  if (undelivered.length) {
    await ChatReadState.bulkWrite(
      undelivered.map((c) => ({
        updateOne: {
          filter: { conversationId: c._id, userId: user._id },
          update: { $max: { lastDeliveredAt: c.lastMessageAt }, $setOnInsert: { organizationId: user.organizationId } },
          upsert: true,
        },
      })),
      { ordered: false }
    );
    Promise.all(undelivered.map((c) => publishReceipt(c, user._id))).catch(logReceiptError);
  }

  // Ticks for the conversations whose newest message is mine — one read-state query for all.
  const mineLast = conversations.filter(
    (c) => c.lastMessage?.at && c.lastMessage.kind !== 'system' && String(c.lastMessage.senderId) === String(user._id)
  );
  const statusBy = new Map();
  if (mineLast.length) {
    const othersBy = new Map();
    for (const c of mineLast) {
      othersBy.set(String(c._id), (await cachedMemberIds(c)).filter((id) => id !== String(user._id)));
    }
    const states = await ChatReadState.find({ conversationId: { $in: mineLast.map((c) => c._id) }, userId: { $ne: user._id } })
      .select('conversationId userId lastReadAt lastDeliveredAt')
      .lean();
    const byConversation = new Map();
    states.forEach((st) => {
      const key = String(st.conversationId);
      if (!byConversation.has(key)) byConversation.set(key, new Map());
      byConversation.get(key).set(String(st.userId), st);
    });
    mineLast.forEach((c) => {
      const key = String(c._id);
      statusBy.set(key, statusFrom(c.lastMessage.at, othersBy.get(key), byConversation.get(key) || new Map()));
    });
  }

  // One aggregate for every unread count: each conversation's own "after I last read" cut.
  const clauses = conversations
    .filter((c) => {
      const readAt = stateBy.get(String(c._id))?.lastReadAt;
      return c.lastMessageAt && (!readAt || c.lastMessageAt > readAt);
    })
    .map((c) => {
      const readAt = stateBy.get(String(c._id))?.lastReadAt;
      return readAt ? { conversationId: c._id, createdAt: { $gt: readAt } } : { conversationId: c._id };
    });
  const unreadBy = new Map();
  if (clauses.length) {
    const counts = await ChatMessage.aggregate([
      { $match: { $or: clauses, senderId: { $ne: user._id }, deletedAt: null, kind: { $ne: 'system' } } },
      { $group: { _id: '$conversationId', count: { $sum: 1 } } },
    ]);
    counts.forEach((row) => unreadBy.set(String(row._id), row.count));
  }

  // The other person in each direct thread.
  const otherIds = conversations
    .filter((c) => c.type === 'direct')
    .map((c) => (c.participants || []).map(String).find((p) => p !== String(user._id)))
    .filter(Boolean);
  const [others, branches] = await Promise.all([
    otherIds.length ? User.find({ _id: { $in: otherIds } }).select('name email photo lastSeenAt').lean() : [],
    Branch.find({ organizationId: user.organizationId }).select('_id name').lean(),
  ]);
  const otherBy = new Map(others.map((o) => [String(o._id), o]));
  const branchName = new Map(branches.map((b) => [String(b._id), b.name]));

  return conversations
    .map((c) => {
      const state = stateBy.get(String(c._id));
      const otherId = c.type === 'direct' ? (c.participants || []).map(String).find((p) => p !== String(user._id)) : null;
      const other = otherId ? otherBy.get(otherId) : null;
      return {
        id: String(c._id),
        type: c.type,
        name:
          c.type === 'branch'
            ? branchName.get(String(c.branchId)) || c.name
            : c.type === 'direct'
              ? other?.name || other?.email || 'Former member'
              : c.name,
        description: c.description || '',
        branchId: c.branchId ? String(c.branchId) : null,
        participantIds: (c.participants || []).map(String),
        adminIds: (c.admins || []).map(String),
        directUser: other
          ? {
              id: otherId,
              name: other.name || other.email,
              photoUrl: other.photo?.url || '',
              online: onlineIds.has(otherId),
              lastSeenAt: other.lastSeenAt || null,
            }
          : null,
        lastMessage: c.lastMessage?.at
          ? {
              ...c.lastMessage,
              senderId: c.lastMessage.senderId ? String(c.lastMessage.senderId) : null,
              status: statusBy.get(String(c._id)) || null,
            }
          : null,
        lastMessageAt: c.lastMessageAt,
        unread: unreadBy.get(String(c._id)) || 0,
        lastReadAt: state?.lastReadAt || null,
        muted: !!state?.muted,
        pinned: !!state?.pinned,
        createdAt: c.createdAt,
      };
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const at = (x) => new Date(x.lastMessageAt || 0).getTime();
      if (at(b) !== at(a)) return at(b) - at(a);
      // Never-used channels: All branches first, then branches by name.
      const rank = { organization: 0, branch: 1, group: 2, direct: 3 };
      return rank[a.type] - rank[b.type] || a.name.localeCompare(b.name);
    });
}

async function getConversationDetail(user, conversationId, { onlineIds = new Set() } = {}) {
  const conversation = await getAccessibleConversation(user, conversationId);
  const memberIds = await conversationMemberIds(conversation);
  const [members, readStates] = await Promise.all([
    User.find({ _id: { $in: memberIds } }).select('name email photo systemRole lastSeenAt').lean(),
    ChatReadState.find({ conversationId: conversation._id, userId: { $in: memberIds } })
      .select('userId lastReadAt lastDeliveredAt')
      .lean(),
  ]);
  const stateBy = new Map(readStates.map((s) => [String(s.userId), s]));
  return {
    id: String(conversation._id),
    type: conversation.type,
    adminIds: (conversation.admins || []).map(String),
    createdBy: conversation.createdBy ? String(conversation.createdBy) : null,
    members: members
      .map((m) => ({
        id: String(m._id),
        name: m.name || m.email,
        photoUrl: m.photo?.url || '',
        online: onlineIds.has(String(m._id)),
        lastSeenAt: m.lastSeenAt || null,
        lastReadAt: stateBy.get(String(m._id))?.lastReadAt || null,
        lastDeliveredAt: latest(stateBy.get(String(m._id))?.lastDeliveredAt, stateBy.get(String(m._id))?.lastReadAt),
      }))
      .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name)),
  };
}

/* ── Creating threads ────────────────────────────────────────────────────── */

async function assertOrgStaff(user, userIds) {
  const unique = [...new Set(userIds.map(String))];
  const found = await User.find({ _id: { $in: unique }, organizationId: user.organizationId, isActive: { $ne: false } })
    .select('_id linkedTeacherId linkedStudentIds schoolRole')
    .lean();
  const valid = found.filter((u) => !isPortalUser(u)).map((u) => String(u._id));
  if (valid.length !== unique.length) throw new ApiError(httpStatus.BAD_REQUEST, 'Some people are not staff of this organization');
  return valid;
}

async function getOrCreateDirect(user, otherUserId) {
  await assertChatUser(user);
  if (String(otherUserId) === String(user._id)) throw new ApiError(httpStatus.BAD_REQUEST, 'Pick someone else to message');
  await assertOrgStaff(user, [otherUserId]);
  const directKey = [String(user._id), String(otherUserId)].sort().join(':');
  try {
    const conversation = await ChatConversation.findOneAndUpdate(
      { organizationId: user.organizationId, directKey },
      {
        $setOnInsert: {
          organizationId: user.organizationId,
          type: 'direct',
          directKey,
          participants: [user._id, oid(otherUserId)],
          createdBy: user._id,
        },
      },
      { upsert: true, new: true }
    );
    return conversation;
  } catch (err) {
    if (err.code === 11000) return ChatConversation.findOne({ organizationId: user.organizationId, directKey });
    throw err;
  }
}

async function postSystemMessage(conversation, text, actor) {
  const message = await ChatMessage.create({
    organizationId: conversation.organizationId,
    conversationId: conversation._id,
    senderId: actor?._id || null,
    senderName: actor?.name || '',
    kind: 'system',
    text,
  });
  await ChatConversation.updateOne(
    { _id: conversation._id },
    { $set: { lastMessage: { text, kind: 'system', senderId: actor?._id || null, senderName: actor?.name || '', at: message.createdAt }, lastMessageAt: message.createdAt } }
  );
  chatBus.publish(audienceRooms(conversation), 'chat:message', { conversationId: String(conversation._id), message: message.toJSON() });
  return message;
}

async function createGroup(user, { name, description = '', participantIds = [] }) {
  await assertChatUser(user);
  const members = await assertOrgStaff(user, [...participantIds, String(user._id)]);
  if (members.length < 2) throw new ApiError(httpStatus.BAD_REQUEST, 'Add at least one other person');
  const conversation = await ChatConversation.create({
    organizationId: user.organizationId,
    type: 'group',
    name: String(name).trim().slice(0, 80),
    description: String(description || '').trim().slice(0, 300),
    participants: members.map(oid),
    admins: [user._id],
    createdBy: user._id,
  });
  chatBus.publish(audienceRooms(conversation), 'chat:conversations-changed', { conversationId: String(conversation._id) });
  await postSystemMessage(conversation, `${user.name || 'Someone'} created the group "${conversation.name}"`, user);
  return conversation;
}

async function updateGroup(user, conversationId, { name, description, addIds = [], removeIds = [] }) {
  const conversation = await getAccessibleConversation(user, conversationId);
  if (conversation.type !== 'group') throw new ApiError(httpStatus.BAD_REQUEST, 'Only groups can be edited');
  const amAdmin = (conversation.admins || []).some((a) => String(a) === String(user._id)) || isAdmin(user);
  if (!amAdmin) throw new ApiError(httpStatus.FORBIDDEN, 'Only the group admins can change it');

  const before = audienceRooms(conversation);
  const notes = [];
  if (name != null && String(name).trim() && String(name).trim() !== conversation.name) {
    conversation.name = String(name).trim().slice(0, 80);
    notes.push(`renamed the group to "${conversation.name}"`);
  }
  if (description != null) conversation.description = String(description).trim().slice(0, 300);
  if (addIds.length) {
    const valid = await assertOrgStaff(user, addIds);
    const existing = new Set(conversation.participants.map(String));
    const added = valid.filter((id) => !existing.has(id));
    if (added.length) {
      conversation.participants.push(...added.map(oid));
      const people = await User.find({ _id: { $in: added } }).select('name').lean();
      notes.push(`added ${people.map((p) => p.name).join(', ')}`);
      await ChatReadState.updateMany({ conversationId: conversation._id, userId: { $in: added.map(oid) } }, { $set: { leftAt: null } });
    }
  }
  if (removeIds.length) {
    const remove = new Set(removeIds.map(String));
    remove.delete(String(user._id)); // leaving is its own action
    const removed = conversation.participants.filter((p) => remove.has(String(p))).map(String);
    if (removed.length) {
      conversation.participants = conversation.participants.filter((p) => !remove.has(String(p)));
      conversation.admins = (conversation.admins || []).filter((a) => !remove.has(String(a)));
      const people = await User.find({ _id: { $in: removed } }).select('name').lean();
      notes.push(`removed ${people.map((p) => p.name).join(', ')}`);
    }
  }
  await conversation.save();
  chatBus.publish([...before, ...audienceRooms(conversation)], 'chat:conversations-changed', { conversationId: String(conversation._id) });
  if (notes.length) await postSystemMessage(conversation, `${user.name || 'Someone'} ${notes.join(' and ')}`, user);
  return conversation;
}

async function leaveGroup(user, conversationId) {
  const conversation = await getAccessibleConversation(user, conversationId);
  if (conversation.type !== 'group') throw new ApiError(httpStatus.BAD_REQUEST, 'You can only leave a group');
  const before = audienceRooms(conversation);
  conversation.participants = conversation.participants.filter((p) => String(p) !== String(user._id));
  conversation.admins = (conversation.admins || []).filter((a) => String(a) !== String(user._id));
  // A group never ends up without an admin while people are still in it.
  if (!conversation.admins.length && conversation.participants.length) conversation.admins = [conversation.participants[0]];
  await conversation.save();
  await ChatReadState.updateOne(
    { conversationId: conversation._id, userId: user._id },
    { $set: { leftAt: new Date() }, $setOnInsert: { organizationId: user.organizationId } },
    { upsert: true }
  );
  chatBus.publish(before, 'chat:conversations-changed', { conversationId: String(conversation._id) });
  if (conversation.participants.length) await postSystemMessage(conversation, `${user.name || 'Someone'} left the group`, user);
}

async function setPreferences(user, conversationId, { muted, pinned }) {
  const conversation = await getAccessibleConversation(user, conversationId);
  const $set = {};
  if (typeof muted === 'boolean') $set.muted = muted;
  if (typeof pinned === 'boolean') $set.pinned = pinned;
  await ChatReadState.updateOne(
    { conversationId: conversation._id, userId: user._id },
    { $set, $setOnInsert: { organizationId: user.organizationId } },
    { upsert: true }
  );
  return { muted, pinned };
}

/* ── Messages ────────────────────────────────────────────────────────────── */

async function listMessages(user, conversationId, { before, limit = PAGE_SIZE } = {}) {
  const conversation = await getAccessibleConversation(user, conversationId);
  const filter = { conversationId: conversation._id };
  if (before) {
    const cut = new Date(before);
    if (!Number.isNaN(cut.getTime())) filter.createdAt = { $lt: cut };
  }
  const size = Math.min(Math.max(Number(limit) || PAGE_SIZE, 1), 100);
  const rows = await ChatMessage.find(filter).sort({ createdAt: -1 }).limit(size + 1);
  const hasMore = rows.length > size;
  const messages = rows.slice(0, size).reverse().map(presentMessage);
  return { messages, hasMore };
}

/** Deleted messages keep their place in the thread but lose their content. */
function presentMessage(doc) {
  const message = typeof doc.toJSON === 'function' ? doc.toJSON() : doc;
  if (message.deletedAt) {
    return { ...message, text: '', attachments: [], product: null, reactions: [], replyTo: null, playedBy: [] };
  }
  if (!message.product || !message.product.productId) message.product = null;
  if (!message.replyTo || !message.replyTo.messageId) message.replyTo = null;
  return message;
}

async function productSnapshot(user, productId) {
  const product = await Product.findOne({ _id: productId, organizationId: user.organizationId })
    .select('name sku barcode price stockQuantity unit image images masterProductId')
    .lean();
  if (!product) throw new ApiError(httpStatus.BAD_REQUEST, 'Product not found');
  return {
    productId: product._id,
    name: product.name,
    sku: product.sku || '',
    barcode: product.barcode || '',
    price: product.price ?? null,
    stock: product.stockQuantity ?? null,
    unit: typeof product.unit === 'string' ? product.unit : product.unit?.name || product.unit?.symbol || '',
    imageUrl: product.images?.[0]?.url || product.image?.url || '',
    masterProductId: product.masterProductId || null,
  };
}

/* ── Media uploads ─────────────────────────────────────────────────────── */

// Only files in OUR Cloudinary account can be attached — not any Cloudinary URL.
const attachmentHost = () =>
  new RegExp(`^https://res\\.cloudinary\\.com/${config.cloudinary.cloudName ? `${escapeRegex(config.cloudinary.cloudName)}/` : ''}`);

const mediaKind = (mimeType = '') => {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
};

const clock = (seconds) => {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/** WhatsApp-style list preview: "📷 Photo", "🎥 Video", "🎵 Audio", "🎤 Voice message (0:13)", "📄 invoice.pdf" (+ caption). */
function attachmentPreview(attachments, caption) {
  if (attachments.length === 1 && attachments[0].voice) {
    const { duration } = attachments[0];
    return `🎤 Voice message${duration ? ` (${clock(duration)})` : ''}`;
  }
  const kinds = [...new Set(attachments.map((a) => mediaKind(a.mimeType)))];
  let label;
  if (kinds.length === 1 && kinds[0] === 'image') label = attachments.length > 1 ? `📷 ${attachments.length} photos` : '📷 Photo';
  else if (kinds.length === 1 && kinds[0] === 'video') label = attachments.length > 1 ? `🎥 ${attachments.length} videos` : '🎥 Video';
  else if (kinds.every((k) => k === 'image' || k === 'video')) label = `🖼️ ${attachments.length} photos & videos`;
  else if (kinds.length === 1 && kinds[0] === 'audio') label = '🎵 Audio';
  else if (attachments.length === 1) label = `📄 ${attachments[0].name || 'Document'}`;
  else label = `📎 ${attachments.length} files`;
  return caption ? `${label.split(' ')[0]} ${caption}` : label;
}

/**
 * A short-lived signature for uploading one file straight from the browser to Cloudinary
 * (WhatsApp-style: the bubble shows the local file with real upload progress, and big
 * videos never pass through this server's memory). The folder is part of the signature, so
 * a client can only upload into its own organization's chat folder.
 */
async function uploadSignature(user) {
  await assertChatUser(user);
  const { cloudName, apiKey, apiSecret } = config.cloudinary;
  if (!cloudName || !apiKey || !apiSecret) throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'File uploads are not configured');
  const folder = `chat/${user.organizationId}`;
  const timestamp = Math.round(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request({ folder, timestamp }, apiSecret);
  return { cloudName, apiKey, folder, timestamp, signature };
}

async function sendMessage(user, conversationId, body, { branchId } = {}) {
  const conversation = await getAccessibleConversation(user, conversationId);
  const text = String(body.text || '').slice(0, MAX_TEXT);
  const host = attachmentHost();
  const attachments = (body.attachments || [])
    .filter((a) => a && host.test(String(a.url)))
    .slice(0, 10)
    .map((a) => (a.voice && mediaKind(a.mimeType) === 'audio' ? a : { ...a, voice: false, waveform: undefined }));
  let kind = 'text';
  let product = null;
  if (body.productId) {
    kind = 'product';
    product = await productSnapshot(user, body.productId);
  } else if (attachments.length) {
    kind = 'attachment';
  }
  if (kind === 'text' && !text.trim()) throw new ApiError(httpStatus.BAD_REQUEST, 'Message is empty');

  let replyTo = null;
  if (body.replyToId && mongoose.Types.ObjectId.isValid(String(body.replyToId))) {
    const original = await ChatMessage.findOne({ _id: body.replyToId, conversationId: conversation._id }).lean();
    if (original && !original.deletedAt) {
      replyTo = {
        messageId: original._id,
        text: (original.attachments?.length
          ? attachmentPreview(original.attachments, original.text)
          : original.text || (original.product?.name ? `📦 ${original.product.name}` : '')
        ).slice(0, 200),
        senderName: original.senderName,
      };
    }
  }

  let senderBranchName = '';
  if (branchId && mongoose.Types.ObjectId.isValid(String(branchId))) {
    const branch = await Branch.findOne({ _id: branchId, organizationId: user.organizationId }).select('name').lean();
    senderBranchName = branch?.name || '';
  }

  const message = await ChatMessage.create({
    organizationId: user.organizationId,
    conversationId: conversation._id,
    senderId: user._id,
    senderName: user.name || user.email,
    senderBranchId: senderBranchName ? branchId : null,
    senderBranchName,
    kind,
    text,
    attachments,
    product: product || undefined,
    replyTo: replyTo || undefined,
    clientId: String(body.clientId || '').slice(0, 80),
  });

  const preview =
    kind === 'product' ? `📦 ${product.name}${text ? ` — ${text}` : ''}` : kind === 'attachment' ? attachmentPreview(attachments, text) : text;
  await Promise.all([
    ChatConversation.updateOne(
      { _id: conversation._id },
      {
        $set: {
          lastMessage: { text: preview.slice(0, 160), kind, senderId: user._id, senderName: message.senderName, at: message.createdAt },
          lastMessageAt: message.createdAt,
        },
        $inc: { messageCount: 1 },
      }
    ),
    ChatReadState.updateOne(
      { conversationId: conversation._id, userId: user._id },
      {
        $set: { lastReadAt: message.createdAt },
        $max: { lastDeliveredAt: message.createdAt },
        $setOnInsert: { organizationId: user.organizationId },
      },
      { upsert: true }
    ),
  ]);

  const presented = presentMessage(message);
  chatBus.publish(audienceRooms(conversation), 'chat:message', { conversationId: String(conversation._id), message: presented });
  return presented;
}

async function getOwnMessage(user, messageId, { allowAdmin = false } = {}) {
  if (!mongoose.Types.ObjectId.isValid(String(messageId))) throw new ApiError(httpStatus.NOT_FOUND, 'Message not found');
  const message = await ChatMessage.findOne({ _id: messageId, organizationId: user.organizationId });
  if (!message || message.deletedAt) throw new ApiError(httpStatus.NOT_FOUND, 'Message not found');
  const conversation = await getAccessibleConversation(user, message.conversationId);
  const mine = String(message.senderId) === String(user._id);
  if (!mine && !(allowAdmin && isAdmin(user))) throw new ApiError(httpStatus.FORBIDDEN, 'You can only change your own messages');
  return { message, conversation };
}

async function editMessage(user, messageId, { text }) {
  const { message, conversation } = await getOwnMessage(user, messageId);
  if (message.kind === 'system') throw new ApiError(httpStatus.BAD_REQUEST, 'This message cannot be edited');
  if (Date.now() - message.createdAt.getTime() > EDIT_WINDOW_MS) throw new ApiError(httpStatus.BAD_REQUEST, 'Messages can only be edited within 24 hours');
  const next = String(text || '').slice(0, MAX_TEXT);
  if (!next.trim() && message.kind === 'text') throw new ApiError(httpStatus.BAD_REQUEST, 'Message is empty');
  message.text = next;
  message.editedAt = new Date();
  await message.save();
  const presented = presentMessage(message);
  chatBus.publish(audienceRooms(conversation), 'chat:message-updated', { conversationId: String(conversation._id), message: presented });
  return presented;
}

async function deleteMessage(user, messageId) {
  const { message, conversation } = await getOwnMessage(user, messageId, { allowAdmin: true });
  message.deletedAt = new Date();
  await message.save();
  const presented = presentMessage(message);
  chatBus.publish(audienceRooms(conversation), 'chat:message-updated', { conversationId: String(conversation._id), message: presented });
  return presented;
}

async function toggleReaction(user, messageId, emoji) {
  if (!REACTIONS.includes(emoji)) throw new ApiError(httpStatus.BAD_REQUEST, 'Unsupported reaction');
  if (!mongoose.Types.ObjectId.isValid(String(messageId))) throw new ApiError(httpStatus.NOT_FOUND, 'Message not found');
  const message = await ChatMessage.findOne({ _id: messageId, organizationId: user.organizationId });
  if (!message || message.deletedAt || message.kind === 'system') throw new ApiError(httpStatus.NOT_FOUND, 'Message not found');
  const conversation = await getAccessibleConversation(user, message.conversationId);
  const me = String(user._id);
  const reactions = message.reactions || [];
  const existing = reactions.find((r) => r.emoji === emoji);
  if (existing) {
    const had = existing.userIds.some((u) => String(u) === me);
    existing.userIds = had ? existing.userIds.filter((u) => String(u) !== me) : [...existing.userIds, user._id];
  } else {
    reactions.push({ emoji, userIds: [user._id] });
  }
  message.reactions = reactions.filter((r) => r.userIds.length > 0);
  await message.save();
  const presented = presentMessage(message);
  chatBus.publish(audienceRooms(conversation), 'chat:message-updated', { conversationId: String(conversation._id), message: presented });
  return presented;
}

/**
 * Someone other than the sender played a voice note. Recorded once per person; the sender's
 * bubble turns its mic blue (WhatsApp's "played"), and the listener's own other devices stop
 * showing it as new.
 */
async function markPlayed(user, messageId) {
  if (!mongoose.Types.ObjectId.isValid(String(messageId))) throw new ApiError(httpStatus.NOT_FOUND, 'Message not found');
  const message = await ChatMessage.findOne({ _id: messageId, organizationId: user.organizationId });
  if (!message || message.deletedAt || !message.attachments?.some((a) => a.voice)) throw new ApiError(httpStatus.NOT_FOUND, 'Message not found');
  const conversation = await getAccessibleConversation(user, message.conversationId);
  if (String(message.senderId) === String(user._id) || (message.playedBy || []).some((u) => String(u) === String(user._id))) {
    return presentMessage(message);
  }
  const updated = await ChatMessage.findOneAndUpdate({ _id: message._id }, { $addToSet: { playedBy: user._id } }, { new: true });
  const presented = presentMessage(updated);
  chatBus.publish(audienceRooms(conversation), 'chat:message-updated', { conversationId: String(conversation._id), message: presented });
  return presented;
}

async function markRead(user, conversationId) {
  const conversation = await getAccessibleConversation(user, conversationId);
  const at = new Date();
  await ChatReadState.updateOne(
    { conversationId: conversation._id, userId: user._id },
    { $set: { lastReadAt: at }, $max: { lastDeliveredAt: at }, $setOnInsert: { organizationId: user.organizationId } },
    { upsert: true }
  );
  // Blue ticks: every thread type, like WhatsApp groups (blue once everyone has read).
  await publishReceipt(conversation, user._id).catch(logReceiptError);
  // The reader's other tabs/devices clear their badge too.
  chatBus.publish([`user:${user._id}`], 'chat:read-self', { conversationId: String(conversation._id), lastReadAt: at });
  return { lastReadAt: at };
}

/**
 * The person's device has received this conversation's messages up to `at` (the grey
 * double tick). Sent by the client the moment a pushed message lands, on any page.
 */
async function markDelivered(user, conversationId, at) {
  const conversation = await getAccessibleConversation(user, conversationId);
  const now = new Date();
  const asked = at ? new Date(at) : now;
  // Never in the future, so a skewed client clock can't pre-tick messages not yet sent.
  const cut = Number.isNaN(asked.getTime()) || asked > now ? now : asked;
  const result = await ChatReadState.updateOne(
    { conversationId: conversation._id, userId: user._id },
    { $max: { lastDeliveredAt: cut }, $setOnInsert: { organizationId: user.organizationId } },
    { upsert: true }
  );
  if (result.modifiedCount || result.upsertedCount) await publishReceipt(conversation, user._id);
  return { lastDeliveredAt: cut };
}

async function unreadTotal(user) {
  const conversations = await listConversations(user);
  return conversations.filter((c) => !c.muted).reduce((sum, c) => sum + c.unread, 0);
}

async function searchMessages(user, q) {
  await assertChatUser(user);
  const term = String(q || '').trim();
  if (term.length < 2) return [];
  const conversations = await listConversations(user);
  const nameBy = new Map(conversations.map((c) => [c.id, c.name]));
  const rows = await ChatMessage.find({
    conversationId: { $in: conversations.map((c) => oid(c.id)) },
    deletedAt: null,
    kind: { $ne: 'system' },
    $or: [{ text: { $regex: escapeRegex(term), $options: 'i' } }, { 'product.name': { $regex: escapeRegex(term), $options: 'i' } }],
  })
    .sort({ createdAt: -1 })
    .limit(40)
    .lean();
  return rows.map((row) => ({
    id: String(row._id),
    conversationId: String(row.conversationId),
    conversationName: nameBy.get(String(row.conversationId)) || '',
    senderName: row.senderName,
    senderBranchName: row.senderBranchName,
    text: row.text || row.product?.name || '',
    createdAt: row.createdAt,
  }));
}

/**
 * "Do you have this?" — the same product's stock in every branch of the organization.
 * Branches keep their own product rows, so the same item is matched by master product,
 * then barcode, then SKU, then exact name.
 */
async function productStockAcrossBranches(user, productId) {
  await assertChatUser(user);
  if (!mongoose.Types.ObjectId.isValid(String(productId))) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
  const product = await Product.findOne({ _id: productId, organizationId: user.organizationId })
    .select('name sku barcode masterProductId')
    .lean();
  if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
  const matchers = [];
  if (product.masterProductId) matchers.push({ masterProductId: product.masterProductId });
  if (product.barcode) matchers.push({ barcode: product.barcode });
  if (product.sku) matchers.push({ sku: product.sku });
  matchers.push({ name: { $regex: `^${escapeRegex(product.name)}$`, $options: 'i' } });
  const [siblings, branches] = await Promise.all([
    Product.find({ organizationId: user.organizationId, isActive: { $ne: false }, $or: matchers })
      .select('branchId stockQuantity price name')
      .lean(),
    Branch.find({ organizationId: user.organizationId }).select('_id name').lean(),
  ]);
  const branchName = new Map(branches.map((b) => [String(b._id), b.name]));
  const byBranch = new Map();
  siblings.forEach((s) => {
    const key = String(s.branchId);
    if (!branchName.has(key)) return;
    // The exact product wins over a looser match in the same branch.
    const prev = byBranch.get(key);
    if (!prev || String(s._id) === String(productId)) byBranch.set(key, s);
  });
  return branches.map((b) => {
    const row = byBranch.get(String(b._id));
    return {
      branchId: String(b._id),
      branchName: b.name,
      productId: row ? String(row._id) : null,
      stock: row ? row.stockQuantity : null,
      price: row ? row.price : null,
    };
  });
}

module.exports = {
  REACTIONS,
  isPortalUser,
  isAdmin,
  assertChatUser,
  getUserBranchIds,
  audienceRooms,
  canAccess,
  listDirectory,
  listConversations,
  getConversationDetail,
  getOrCreateDirect,
  createGroup,
  updateGroup,
  leaveGroup,
  setPreferences,
  listMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  toggleReaction,
  markPlayed,
  markRead,
  markDelivered,
  unreadTotal,
  uploadSignature,
  searchMessages,
  productStockAcrossBranches,
};
