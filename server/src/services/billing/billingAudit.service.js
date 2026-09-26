const { BillingAudit } = require('../../models');
const logger = require('../../config/logger');

/**
 * Append one billing audit entry. Audit writes must never undo or block the billing change
 * they describe, so a failure here is logged, not thrown.
 * @param {{ organizationId?, actorType: 'user'|'admin'|'polar'|'system', actorId?, actorLabel?,
 *           action: string, from?, to?, meta? }} entry
 */
const record = async (entry) => {
  try {
    await BillingAudit.create(entry);
  } catch (err) {
    logger.error(`billing audit write failed (${entry.action}): ${err.message}`);
  }
};

/** Actor fields for a request's signed-in user. */
const actorFromUser = (user, actorType = 'user') => ({
  actorType,
  actorId: user?._id || user?.id || null,
  actorLabel: user?.email || user?.name || null,
});

const list = (filter, options) =>
  BillingAudit.paginate(filter, {
    sortBy: 'createdAt:desc',
    ...options,
    populate: [{ path: 'actorId', select: 'name email' }],
  });

module.exports = { record, actorFromUser, list };
