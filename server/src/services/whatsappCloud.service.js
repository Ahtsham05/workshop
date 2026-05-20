/**
 * Meta WhatsApp Cloud API (official Business API)
 * https://developers.facebook.com/docs/whatsapp/cloud-api
 */

const logger = require('../config/logger');

function normalizePhone(phone) {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 11) {
    digits = `92${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    digits = `92${digits}`;
  }
  return digits || null;
}

function decodePdfBuffer(data) {
  if (Buffer.isBuffer(data)) return data;
  if (typeof data === 'string') {
    const base64 = data.replace(/^data:application\/pdf;base64,/, '').trim();
    return Buffer.from(base64, 'base64');
  }
  return null;
}

function graphBaseUrl(apiVersion) {
  const v = String(apiVersion || 'v21.0').replace(/^\//, '');
  return `https://graph.facebook.com/${v}`;
}

/**
 * @param {{ accessToken: string, phoneNumberId: string, apiVersion?: string }} config
 */
async function uploadDocumentMedia(config, buffer, filename) {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', 'application/pdf');
  const blob = new Blob([buffer], { type: 'application/pdf' });
  form.append('file', blob, filename);

  const url = `${graphBaseUrl(config.apiVersion)}/${config.phoneNumberId}/media`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.accessToken}` },
    body: form,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err =
      body?.error?.message ||
      body?.error?.error_user_msg ||
      `Media upload failed (${res.status})`;
    throw new Error(err);
  }
  if (!body.id) {
    throw new Error('Media upload did not return a media id');
  }
  return body.id;
}

/**
 * @param {{ accessToken: string, phoneNumberId: string, apiVersion?: string }} config
 */
async function sendDocumentMessage(config, phone, { mediaId, caption, filename }) {
  const to = normalizePhone(phone);
  if (!to) {
    return { success: false, error: `Invalid phone number: ${phone}` };
  }

  const url = `${graphBaseUrl(config.apiVersion)}/${config.phoneNumberId}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'document',
    document: {
      id: mediaId,
      caption: String(caption || '').slice(0, 1024),
      filename: String(filename || 'document.pdf').replace(/[^\w.\-() ]/g, '_') || 'document.pdf',
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err =
      body?.error?.message ||
      body?.error?.error_user_msg ||
      `WhatsApp API send failed (${res.status})`;
    logger.error('WhatsApp Cloud API send failed:', body?.error || body);
    return { success: false, error: err };
  }

  return { success: true, messageId: body?.messages?.[0]?.id };
}

function isConfigured(config) {
  return Boolean(config?.accessToken && config?.phoneNumberId);
}

/**
 * Send PDF document via Meta WhatsApp Cloud API.
 */
async function sendDocument(phone, { data, filename = 'document.pdf', caption = '' }, config) {
  if (!isConfigured(config)) {
    return {
      success: false,
      error: 'WhatsApp Cloud API is not configured. Add Access Token and Phone Number ID in Settings.',
    };
  }

  const buffer = decodePdfBuffer(data);
  if (!buffer || buffer.length === 0) {
    return { success: false, error: 'Invalid or empty PDF data' };
  }

  try {
    const mediaId = await uploadDocumentMedia(config, buffer, filename);
    return sendDocumentMessage(config, phone, { mediaId, caption, filename });
  } catch (err) {
    logger.error(`WhatsApp Cloud sendDocument to ${phone} failed:`, err);
    return { success: false, error: err.message || 'Failed to send document via WhatsApp Cloud API' };
  }
}

module.exports = {
  isConfigured,
  normalizePhone,
  sendDocument,
};
