const logger = require('../../config/logger');
const ApiError = require('../../utils/ApiError');
const httpStatus = require('http-status');
const connectionService = require('./connection.service');
const { WhatsAppMessage } = require('../../models');
const { normalizePhone } = require('../../utils/whatsappPhone');

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
  if (!conversationId) return { wamid, success: true };

  const message = await WhatsAppMessage.create({
    organizationId,
    branchId,
    conversationId,
    direction: 'outbound',
    type: 'text',
    content: { text },
    wamid,
    metaMessageId: wamid,
    status: 'sent',
    statusHistory: [{ status: 'sent', at: new Date() }],
    source,
    sentBy,
  });
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
  const message = conversationId
    ? await WhatsAppMessage.create({
        organizationId,
        branchId,
        conversationId,
        direction: 'outbound',
        type: 'template',
        content: { templateName, templateParams: components },
        wamid,
        metaMessageId: wamid,
        status: 'sent',
        statusHistory: [{ status: 'sent', at: new Date() }],
        source,
        sentBy,
        campaignId,
      })
    : null;

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
  const message = conversationId
    ? await WhatsAppMessage.create({
        organizationId,
        branchId,
        conversationId,
        direction: 'outbound',
        type: 'document',
        content: { caption, filename: safeFilename, mediaId },
        wamid,
        metaMessageId: wamid,
        status: 'sent',
        statusHistory: [{ status: 'sent', at: new Date() }],
        source,
        sentBy,
      })
    : null;

  return { wamid, message, success: true };
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
  isConnected,
  uploadMedia,
};
