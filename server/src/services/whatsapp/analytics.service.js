const { WhatsAppConnection, WhatsAppMessage, WhatsAppConversation } = require('../../models');

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

module.exports = { getOverview, getMessageTimeSeries };
