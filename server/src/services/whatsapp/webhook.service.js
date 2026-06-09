const logger = require('../../config/logger');
const {
  WhatsAppConnection,
  WhatsAppMessage,
  WhatsAppTemplate,
  WhatsAppWebhookLog,
  WhatsAppCampaign,
} = require('../../models');
const connectionService = require('./connection.service');
const inboxService = require('./inbox.service');
const parentAssistant = require('./ai/parentAssistant.service');

async function processWebhookPayload(body) {
  const entry = body.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  if (!value) return { processed: false };

  const phoneNumberId = value.metadata?.phone_number_id;
  const connection = await connectionService.getConnectionByPhoneNumberId(phoneNumberId);
  if (!connection) {
    await WhatsAppWebhookLog.create({
      phoneNumberId,
      eventType: change.field,
      payload: body,
      processed: false,
      processingError: 'No matching WhatsApp connection',
    });
    return { processed: false, reason: 'unknown_phone_number_id' };
  }

  const log = await WhatsAppWebhookLog.create({
    organizationId: connection.organizationId,
    branchId: connection.branchId,
    phoneNumberId,
    eventType: change.field,
    payload: body,
  });

  try {
    if (value.messages?.length) {
      for (const msg of value.messages) {
        await handleInboundMessage(connection, msg, value.contacts?.[0]);
      }
    }
    if (value.statuses?.length) {
      for (const status of value.statuses) {
        await handleStatusUpdate(connection, status);
      }
    }
    if (change.field === 'message_template_status_update') {
      await handleTemplateStatusUpdate(connection, value);
    }

    log.processed = true;
    await log.save();
    return { processed: true };
  } catch (err) {
    log.processingError = err.message;
    await log.save();
    logger.error('Webhook processing error:', err);
    throw err;
  }
}

async function handleInboundMessage(connection, msg, contact) {
  const conversation = await inboxService.upsertConversation(connection, {
    contactPhone: msg.from,
    contactName: contact?.profile?.name,
    contactWaId: contact?.wa_id,
  });

  const messageDoc = await inboxService.storeInboundMessage(connection, conversation, msg);

  if (['text', 'audio'].includes(msg.type)) {
    parentAssistant.handleInbound(connection, conversation, messageDoc).catch((err) => {
      logger.error('Parent AI assistant error:', err);
    });
  }
}

async function handleStatusUpdate(connection, status) {
  const update = {
    status: status.status,
    $push: {
      statusHistory: {
        status: status.status,
        at: new Date(),
        error: status.errors?.[0]?.message,
      },
    },
  };
  if (status.status === 'failed') {
    update.errorCode = String(status.errors?.[0]?.code || '');
    update.errorMessage = status.errors?.[0]?.message;
  }

  const message = await WhatsAppMessage.findOneAndUpdate(
    {
      organizationId: connection.organizationId,
      branchId: connection.branchId,
      wamid: status.id,
    },
    update,
    { new: true },
  );

  if (message?.campaignId) {
    const statField = { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed' }[status.status];
    if (statField) {
      await WhatsAppCampaign.updateOne({ _id: message.campaignId }, { $inc: { [`stats.${statField}`]: 1 } });
    }
  }
}

async function handleTemplateStatusUpdate(connection, value) {
  const event = value.event;
  const templateName = value.message_template_name;
  const templateId = value.message_template_id;
  if (!templateName) return;

  await WhatsAppTemplate.findOneAndUpdate(
    {
      organizationId: connection.organizationId,
      branchId: connection.branchId,
      name: templateName,
    },
    {
      metaTemplateId: templateId ? String(templateId) : undefined,
      status: event || 'PENDING',
      rejectionReason: value.reason,
      lastSyncedAt: new Date(),
    },
    { upsert: false },
  );
}

module.exports = { processWebhookPayload };
