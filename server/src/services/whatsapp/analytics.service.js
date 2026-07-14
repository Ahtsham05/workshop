const { WhatsAppConnection, WhatsAppMessage, WhatsAppConversation, WhatsAppTemplate } = require('../../models');

const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
const RANGE_TO_DAYS = { today: 1, '7d': 7, '30d': 30 };

function rangeStart(range) {
  const days = RANGE_TO_DAYS[range] || RANGE_TO_DAYS['7d'];
  const since = new Date();
  if (range === 'today') {
    since.setHours(0, 0, 0, 0);
  } else {
    since.setDate(since.getDate() - days);
  }
  return since;
}

// Pakistani numbers (the only ones this app currently serves) are 92 + 10 digits;
// mask the middle of the subscriber number while keeping the area code and last 4
// digits, e.g. 923227770790 -> "+92 322 ***0790". Falls back to a generic mask for
// any other length rather than guessing at unfamiliar country-code boundaries.
function maskPhone(phone) {
  if (!phone) return undefined;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('92')) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 5)} ***${digits.slice(-4)}`;
  }
  if (digits.length <= 6) return digits;
  return `${digits.slice(0, 3)}***${digits.slice(-4)}`;
}

async function getOverview(organizationId, branchId, { from, to } = {}) {
  const dateFilter = {};
  if (from || to) {
    dateFilter.createdAt = {};
    if (from) dateFilter.createdAt.$gte = new Date(from);
    if (to) dateFilter.createdAt.$lte = new Date(to);
  }

  const baseMatch = { organizationId, branchId, ...dateFilter };

  const [connection, messageStats, activeConversations] = await Promise.all([
    WhatsAppConnection.findOne({ organizationId, branchId }),
    WhatsAppMessage.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: '$direction',
          count: { $sum: 1 },
          delivered: { $sum: { $cond: [{ $in: ['$status', ['delivered', 'read']] }, 1, 0] } },
          read: { $sum: { $cond: [{ $eq: ['$status', 'read'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        },
      },
    ]),
    WhatsAppConversation.countDocuments({ organizationId, branchId, status: 'open' }),
  ]);

  const outbound = messageStats.find((s) => s._id === 'outbound') || {};
  const inbound = messageStats.find((s) => s._id === 'inbound') || {};
  const sent = outbound.count || 0;

  return {
    connection: connection
      ? {
          status: connection.status,
          displayPhoneNumber: connection.displayPhoneNumber,
          verifiedName: connection.verifiedName,
        }
      : null,
    messagesSent: sent,
    messagesReceived: inbound.count || 0,
    deliveryRate: sent ? Math.round(((outbound.delivered || 0) / sent) * 100) : 0,
    readRate: sent ? Math.round(((outbound.read || 0) / sent) * 100) : 0,
    failedMessages: outbound.failed || 0,
    activeConversations,
  };
}

async function getMessageTimeSeries(organizationId, branchId, days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  return WhatsAppMessage.aggregate([
    { $match: { organizationId, branchId, createdAt: { $gte: since } } },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          direction: '$direction',
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.date': 1 } },
  ]);
}

/**
 * Sent -> Delivered -> Read -> Replied funnel, counted at the message level for the
 * first three stages (they're per-message states) and "replied" as the count of
 * those outbound messages whose conversation received an inbound message afterward
 * — reusing WhatsAppConversation.lastInboundAt rather than re-scanning every inbound
 * message per conversation.
 */
async function getFunnelStats(organizationId, branchId, range = '7d') {
  const since = rangeStart(range);

  const [result] = await WhatsAppMessage.aggregate([
    { $match: { organizationId, branchId, direction: 'outbound', createdAt: { $gte: since } } },
    {
      $lookup: {
        from: 'whatsappconversations',
        localField: 'conversationId',
        foreignField: '_id',
        as: 'conversation',
      },
    },
    { $unwind: { path: '$conversation', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: null,
        sent: { $sum: 1 },
        delivered: { $sum: { $cond: [{ $in: ['$status', ['delivered', 'read']] }, 1, 0] } },
        read: { $sum: { $cond: [{ $eq: ['$status', 'read'] }, 1, 0] } },
        replied: {
          $sum: { $cond: [{ $gt: ['$conversation.lastInboundAt', '$createdAt'] }, 1, 0] },
        },
      },
    },
  ]);

  const sent = result?.sent || 0;
  const delivered = result?.delivered || 0;
  const read = result?.read || 0;
  const replied = result?.replied || 0;

  const pct = (n) => (sent ? Math.round((n / sent) * 100) : 0);

  return {
    range,
    since,
    stages: [
      { key: 'sent', label: 'Sent', count: sent, percentOfSent: 100 },
      { key: 'delivered', label: 'Delivered', count: delivered, percentOfSent: pct(delivered) },
      { key: 'read', label: 'Read', count: read, percentOfSent: pct(read) },
      { key: 'replied', label: 'Replied', count: replied, percentOfSent: pct(replied) },
    ],
  };
}

/**
 * Synthesizes a unified activity log from data that already exists — no new
 * collection. One entry per message reflects its *current* status rather than
 * replaying full statusHistory, which is what a live feed actually wants (you
 * don't want three rows for one message's queued->sent->delivered->read climb).
 */
async function getActivityFeed(organizationId, branchId, limit = 15) {
  const [messages, templates, conversations] = await Promise.all([
    WhatsAppMessage.find({ organizationId, branchId })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .populate('conversationId', 'contactPhone contactName')
      .lean(),
    WhatsAppTemplate.find({ organizationId, branchId, status: 'APPROVED' })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean(),
    WhatsAppConversation.find({ organizationId, branchId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
  ]);

  const messageEvents = messages.map((m) => {
    const contact = m.conversationId;
    const name = contact?.contactName || contact?.contactPhone || 'a customer';
    const type = m.direction === 'inbound' ? 'message_received' : `message_${m.status}`;
    const description =
      m.direction === 'inbound'
        ? `New message from ${name}`
        : {
            read: `Message read by ${name}`,
            delivered: `Message delivered to ${name}`,
            failed: `Message failed to ${name}`,
            sent: `Message sent to ${name}`,
            queued: `Message queued for ${name}`,
          }[m.status] || `Message update for ${name}`;

    return {
      id: String(m._id),
      type,
      description,
      phone: maskPhone(contact?.contactPhone),
      timestamp: m.updatedAt,
    };
  });

  const templateEvents = templates.map((t) => ({
    id: String(t._id),
    type: 'template_approved',
    description: `Template "${t.name}" approved`,
    phone: undefined,
    timestamp: t.updatedAt,
  }));

  const conversationEvents = conversations.map((c) => ({
    id: String(c._id),
    type: 'conversation_started',
    description: `New conversation with ${c.contactName || c.contactPhone}`,
    phone: maskPhone(c.contactPhone),
    timestamp: c.createdAt,
  }));

  return [...messageEvents, ...templateEvents, ...conversationEvents]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
}

/**
 * Open conversations whose 24h customer-service window (measured from the
 * customer's last inbound message) hasn't expired yet, soonest-expiring first.
 */
async function getExpiringWindows(organizationId, branchId) {
  const cutoff = new Date(Date.now() - CUSTOMER_SERVICE_WINDOW_MS);

  const conversations = await WhatsAppConversation.find({
    organizationId,
    branchId,
    status: 'open',
    lastInboundAt: { $gte: cutoff },
  })
    .sort({ lastInboundAt: 1 })
    .limit(50)
    .lean();

  const now = Date.now();
  const items = conversations.map((c) => {
    const expiresAt = new Date(new Date(c.lastInboundAt).getTime() + CUSTOMER_SERVICE_WINDOW_MS);
    const minutesRemaining = Math.max(0, Math.round((expiresAt.getTime() - now) / 60000));
    return {
      conversationId: String(c._id),
      name: c.contactName || c.contactPhone,
      phone: maskPhone(c.contactPhone),
      lastInboundAt: c.lastInboundAt,
      expiresAt,
      minutesRemaining,
    };
  });

  return {
    expiringWithinHour: items.filter((i) => i.minutesRemaining <= 60).length,
    items,
  };
}

module.exports = { getOverview, getMessageTimeSeries, getFunnelStats, getActivityFeed, getExpiringWindows };
