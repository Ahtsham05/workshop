const logger = require('../../config/logger');
const ApiError = require('../../utils/ApiError');
const httpStatus = require('http-status');
const connectionService = require('./connection.service');
const mediaService = require('./media.service');
const { WhatsAppMessage, WhatsAppConversation, WhatsAppTemplate } = require('../../models');
const { normalizePhone } = require('../../utils/whatsappPhone');

const MEDIA_PREVIEWS = { image: '📷 Photo', video: '📹 Video', audio: '🎤 Voice message' };

const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

function graphUrl(apiVersion, path) {
  return `${connectionService.graphBaseUrl(apiVersion)}/${path}`;
}

async function resolveConnection(organizationId, branchId) {
  const conn = await connectionService.getActiveConnection(organizationId, branchId);
  if (!conn) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'WhatsApp Cloud API is not connected for this branch. Connect via Settings → WhatsApp.',
    );
  }
  const accessToken = connectionService.getDecryptedToken(conn);
  return { conn, accessToken };
}

// Every outbound send needs a conversation row so the webhook (matched by wamid) has
// something to update with delivery status — not just sends initiated from the inbox UI.
async function resolveConversation(organizationId, branchId, phone) {
  return WhatsAppConversation.findOneAndUpdate(
    { organizationId, branchId, contactPhone: phone },
    { $setOnInsert: { organizationId, branchId, contactPhone: phone, contactWaId: phone, status: 'open' } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

async function touchConversationOnOutbound(conversation, preview) {
  conversation.lastMessageAt = new Date();
  conversation.lastMessagePreview = String(preview || '').slice(0, 200);
  conversation.lastMessageDirection = 'outbound';
  await conversation.save();
}

function decodePdfBuffer(data) {
  if (Buffer.isBuffer(data)) return data;
  if (typeof data === 'string') {
    const base64 = data.replace(/^data:application\/pdf;base64,/, '').trim();
    return Buffer.from(base64, 'base64');
  }
  return null;
}

async function uploadMedia(config, buffer, mimeType, filename) {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mimeType);
  const blob = new Blob([buffer], { type: mimeType });
  form.append('file', blob, filename);

  const url = graphUrl(config.apiVersion, `${config.phoneNumberId}/media`);
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.accessToken}` },
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error?.message || `Media upload failed (${res.status})`);
  }
  return body.id;
}

async function callSendApi(conn, accessToken, payload) {
  const url = graphUrl(conn.apiVersion, `${conn.phoneNumberId}/messages`);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.error('WhatsApp send failed:', body?.error || body);
    throw new ApiError(httpStatus.BAD_REQUEST, body?.error?.message || 'WhatsApp send failed');
  }
  return body;
}

async function sendText({
  organizationId,
  branchId,
  phone,
  text,
  source = 'inbox',
  sentBy,
  conversationId,
}) {
  const { conn, accessToken } = await resolveConnection(organizationId, branchId);
  const to = normalizePhone(phone);
  if (!to) throw new ApiError(httpStatus.BAD_REQUEST, `Invalid phone number: ${phone}`);

  const body = await callSendApi(conn, accessToken, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: String(text).slice(0, 4096) },
  });

  const wamid = body.messages?.[0]?.id;
  const conversation = conversationId
    ? await WhatsAppConversation.findById(conversationId)
    : await resolveConversation(organizationId, branchId, to);

  const message = await WhatsAppMessage.create({
    organizationId,
    branchId,
    conversationId: conversation._id,
    direction: 'outbound',
    type: 'text',
    content: { text },
    wamid,
    metaMessageId: wamid,
    status: 'queued',
    statusHistory: [{ status: 'queued', at: new Date() }],
    source,
    sentBy,
  });
  await touchConversationOnOutbound(conversation, text);

  return { wamid, message, success: true };
}

async function sendTemplate({
  organizationId,
  branchId,
  phone,
  templateName,
  language = 'en',
  components = [],
  source = 'api',
  sentBy,
  conversationId,
  campaignId,
}) {
  const { conn, accessToken } = await resolveConnection(organizationId, branchId);
  const to = normalizePhone(phone);
  if (!to) throw new ApiError(httpStatus.BAD_REQUEST, `Invalid phone number: ${phone}`);

  const body = await callSendApi(conn, accessToken, {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language },
      components,
    },
  });

  const wamid = body.messages?.[0]?.id;
  const conversation = conversationId
    ? await WhatsAppConversation.findById(conversationId)
    : await resolveConversation(organizationId, branchId, to);

  const message = await WhatsAppMessage.create({
    organizationId,
    branchId,
    conversationId: conversation._id,
    direction: 'outbound',
    type: 'template',
    content: { templateName, templateParams: components },
    wamid,
    metaMessageId: wamid,
    status: 'queued',
    statusHistory: [{ status: 'queued', at: new Date() }],
    source,
    sentBy,
    campaignId,
  });
  await touchConversationOnOutbound(conversation, `[Template: ${templateName}]`);

  return { wamid, message, success: true };
}

async function sendDocument({
  organizationId,
  branchId,
  phone,
  data,
  filename = 'document.pdf',
  caption = '',
  source = 'invoice',
  sentBy,
  conversationId,
}) {
  const { conn, accessToken } = await resolveConnection(organizationId, branchId);
  const to = normalizePhone(phone);
  if (!to) throw new ApiError(httpStatus.BAD_REQUEST, `Invalid phone number: ${phone}`);

  const buffer = decodePdfBuffer(data);
  if (!buffer?.length) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid or empty PDF data');

  const safeFilename = String(filename || 'document.pdf').replace(/[^\w.\-() ]/g, '_') || 'document.pdf';
  const mediaId = await uploadMedia(
    { accessToken, phoneNumberId: conn.phoneNumberId, apiVersion: conn.apiVersion },
    buffer,
    'application/pdf',
    safeFilename,
  );

  const body = await callSendApi(conn, accessToken, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'document',
    document: {
      id: mediaId,
      caption: String(caption || '').slice(0, 1024),
      filename: safeFilename,
    },
  });

  const wamid = body.messages?.[0]?.id;
  const conversation = conversationId
    ? await WhatsAppConversation.findById(conversationId)
    : await resolveConversation(organizationId, branchId, to);

  const message = await WhatsAppMessage.create({
    organizationId,
    branchId,
    conversationId: conversation._id,
    direction: 'outbound',
    type: 'document',
    content: { caption, filename: safeFilename, mediaId },
    wamid,
    metaMessageId: wamid,
    status: 'queued',
    statusHistory: [{ status: 'queued', at: new Date() }],
    source,
    sentBy,
  });
  await touchConversationOnOutbound(conversation, caption || `📄 ${safeFilename}`);

  return { wamid, message, success: true };
}

// image/video/audio/document/sticker via the Cloud API, mirroring the manual sendDocument
// flow above but generalized across media types and uploading a copy to Cloudinary so the
// inbox UI has a stable URL to render (WhatsApp media IDs alone can't be fetched by the browser).
async function sendMedia({
  organizationId,
  branchId,
  phone,
  buffer,
  mimeType,
  filename,
  caption = '',
  mediaType,
  source = 'inbox',
  sentBy,
  conversationId,
}) {
  const { conn, accessToken } = await resolveConnection(organizationId, branchId);
  const to = normalizePhone(phone);
  if (!to) throw new ApiError(httpStatus.BAD_REQUEST, `Invalid phone number: ${phone}`);
  if (!buffer?.length) throw new ApiError(httpStatus.BAD_REQUEST, 'File is required');

  const safeFilename = filename ? String(filename).replace(/[^\w.\-() ]/g, '_') : undefined;
  const trimmedCaption = String(caption || '').slice(0, 1024);

  const [mediaId, mediaUrl] = await Promise.all([
    uploadMedia({ accessToken, phoneNumberId: conn.phoneNumberId, apiVersion: conn.apiVersion }, buffer, mimeType, safeFilename),
    mediaService.uploadToCloudinary(buffer, mimeType, 'whatsapp'),
  ]);

  const mediaPayload = { id: mediaId };
  if (mediaType === 'document') {
    mediaPayload.filename = safeFilename || 'document';
    if (trimmedCaption) mediaPayload.caption = trimmedCaption;
  } else if (mediaType === 'image' || mediaType === 'video') {
    if (trimmedCaption) mediaPayload.caption = trimmedCaption;
  }

  const body = await callSendApi(conn, accessToken, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: mediaType,
    [mediaType]: mediaPayload,
  });

  const wamid = body.messages?.[0]?.id;
  const conversation = conversationId
    ? await WhatsAppConversation.findById(conversationId)
    : await resolveConversation(organizationId, branchId, to);

  const message = await WhatsAppMessage.create({
    organizationId,
    branchId,
    conversationId: conversation._id,
    direction: 'outbound',
    type: mediaType,
    content: { caption: trimmedCaption || undefined, filename: safeFilename, mediaId, mediaUrl, mediaMimeType: mimeType },
    wamid,
    metaMessageId: wamid,
    status: 'queued',
    statusHistory: [{ status: 'queued', at: new Date() }],
    source,
    sentBy,
  });
  await touchConversationOnOutbound(conversation, trimmedCaption || MEDIA_PREVIEWS[mediaType] || `📄 ${safeFilename}`);

  return { wamid, message, success: true };
}

/**
 * Single entry point that picks free-form text vs. an approved template automatically,
 * based on Meta's 24h customer-service window (measured from the customer's last inbound
 * message). Outside the window, Meta rejects free-form text outright, so callers must
 * supply a templateCategory (WhatsAppTemplate.internalCategory) to fall back to, plus the
 * ordered params for that template's body variables.
 */
async function sendMessage({
  organizationId,
  branchId,
  phone,
  text,
  templateCategory,
  templateParams = [],
  source = 'api',
  sentBy,
  conversationId,
  campaignId,
}) {
  const to = normalizePhone(phone);
  if (!to) throw new ApiError(httpStatus.BAD_REQUEST, `Invalid phone number: ${phone}`);

  const conversation = conversationId
    ? await WhatsAppConversation.findOne({ _id: conversationId, organizationId, branchId })
    : await WhatsAppConversation.findOne({ organizationId, branchId, contactPhone: to });

  const withinWindow =
    conversation?.lastInboundAt &&
    Date.now() - new Date(conversation.lastInboundAt).getTime() < CUSTOMER_SERVICE_WINDOW_MS;

  if (withinWindow) {
    if (!text) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Text is required to send a free-form message');
    }
    return sendText({
      organizationId,
      branchId,
      phone: to,
      text,
      source,
      sentBy,
      conversationId: conversation?._id,
    });
  }

  if (!templateCategory) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'This customer has not messaged you in the last 24 hours — an approved message template is required to reach them.',
    );
  }

  const template = await WhatsAppTemplate.findOne({
    organizationId,
    branchId,
    internalCategory: templateCategory,
    status: 'APPROVED',
  }).sort({ updatedAt: -1 });

  if (!template) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `No approved "${templateCategory}" message template found for this business. Create and get one approved in WhatsApp Templates first.`,
    );
  }

  const params = Array.isArray(templateParams) ? templateParams : Object.values(templateParams || {});
  const components = params.length
    ? [{ type: 'body', parameters: params.map((v) => ({ type: 'text', text: String(v) })) }]
    : [];

  return sendTemplate({
    organizationId,
    branchId,
    phone: to,
    templateName: template.name,
    language: template.language,
    components,
    source,
    sentBy,
    conversationId: conversation?._id,
    campaignId,
  });
}

async function isConnected(organizationId, branchId) {
  const conn = await connectionService.getActiveConnection(organizationId, branchId);
  return Boolean(conn);
}

module.exports = {
  resolveConnection,
  sendText,
  sendTemplate,
  sendDocument,
  sendMedia,
  sendMessage,
  isConnected,
  uploadMedia,
};
