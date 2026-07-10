const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const httpStatus = require('http-status');
const config = require('../../config/config');
const ApiError = require('../../utils/ApiError');
const { encrypt, decrypt } = require('../../utils/tokenEncryption');
const { WhatsAppConnection } = require('../../models');
const logger = require('../../config/logger');

function graphBaseUrl(apiVersion) {
  const v = String(apiVersion || 'v21.0').replace(/^\//, '');
  return `https://graph.facebook.com/${v}`;
}

function getRedirectUri() {
  const base = config.whatsapp.backendPublicUrl || `http://localhost:${config.port}`;
  return `${base.replace(/\/+$/, '')}/v1/whatsapp-cloud/connection/callback`;
}

function getFrontendRedirectUrl() {
  return (config.whatsapp.frontendUrl || 'http://localhost:5173').replace(/\/+$/, '');
}

function buildEmbeddedSignupState({ organizationId, branchId, userId }) {
  return jwt.sign({ organizationId, branchId, userId, purpose: 'wa_embedded_signup' }, config.jwt.secret, {
    expiresIn: '15m',
  });
}

function verifyState(state) {
  const payload = jwt.verify(state, config.jwt.secret);
  if (payload.purpose !== 'wa_embedded_signup') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid OAuth state');
  }
  return payload;
}

async function startEmbeddedSignup({ organizationId, branchId, userId }) {
  const { appId, embeddedSignupConfigId } = config.whatsapp.meta;
  if (!appId || !embeddedSignupConfigId) {
    throw new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      'Meta Embedded Signup is not configured. Set META_APP_ID and META_EMBEDDED_SIGNUP_CONFIG_ID.',
    );
  }

  const state = buildEmbeddedSignupState({ organizationId, branchId, userId });
  return {
    appId,
    configId: embeddedSignupConfigId,
    redirectUri: getRedirectUri(),
    frontendRedirectUrl: `${getFrontendRedirectUrl()}/settings/whatsapp?connected=1`,
    state,
  };
}

async function exchangeCodeForToken(code) {
  const { appId, appSecret } = config.whatsapp.meta;
  // No redirect_uri here: this code comes from the JS SDK's FB.login (config_id)
  // popup flow, which manages its own internal redirect_uri. Passing our backend
  // callback URL here doesn't match what was actually used and Meta rejects the
  // exchange with "Error validating verification code... redirect_uri is identical".
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    code,
  });
  const res = await fetch(`${graphBaseUrl('v21.0')}/oauth/access_token?${params}`);
  const body = await res.json();
  if (!body.access_token) {
    logger.error('WhatsApp OAuth token exchange failed:', body);
    throw new ApiError(httpStatus.BAD_REQUEST, body.error?.message || 'OAuth token exchange failed');
  }
  return body;
}

async function fetchWabaAndPhone(accessToken) {
  const debugRes = await fetch(
    `${graphBaseUrl('v21.0')}/debug_token?input_token=${accessToken}&access_token=${config.whatsapp.meta.appId}|${config.whatsapp.meta.appSecret}`,
  );
  const debugBody = await debugRes.json();
  const granular = debugBody.data?.granular_scopes || [];
  const wabaScope = granular.find((s) => s.scope === 'whatsapp_business_management');
  const wabaId = wabaScope?.target_ids?.[0];

  if (!wabaId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No WhatsApp Business Account found after signup');
  }

  const phonesRes = await fetch(`${graphBaseUrl('v21.0')}/${wabaId}/phone_numbers?access_token=${accessToken}`);
  const phonesBody = await phonesRes.json();
  const phone = phonesBody.data?.[0];
  if (!phone) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No phone number registered on WhatsApp Business Account');
  }

  return { wabaId, phone };
}

/**
 * A phone number connected via Embedded Signup is only added to the WABA — it
 * still won't send/receive on the Cloud API until explicitly registered (Meta's
 * dashboard shows this as "Phone Number: Not registered"). Without this call,
 * message sends return success but never actually reach the recipient.
 */
async function registerPhoneNumber(phoneNumberId, accessToken, apiVersion = 'v21.0') {
  const pin = String(crypto.randomInt(100000, 1000000));
  const res = await fetch(`${graphBaseUrl(apiVersion)}/${phoneNumberId}/register`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
  });
  const body = await res.json().catch(() => ({}));
  if (body.success) {
    return { success: true, pin };
  }
  if (/already\s+(registered|verified)/i.test(body?.error?.message || '')) {
    return { success: true, pin: null, alreadyRegistered: true };
  }
  logger.warn('WhatsApp phone number registration failed:', body);
  return { success: false, pin: null, error: body?.error?.message || 'Phone number registration failed' };
}

async function subscribeAppToWaba(wabaId, accessToken, apiVersion = 'v21.0') {
  const res = await fetch(`${graphBaseUrl(apiVersion)}/${wabaId}/subscribed_apps`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await res.json();
  if (!body.success) {
    logger.warn('WABA webhook subscription response:', body);
  }
  return Boolean(body.success);
}

async function handleOAuthCallback({ code, state }) {
  const { organizationId, branchId, userId } = verifyState(state);
  const tokenData = await exchangeCodeForToken(code);
  const { wabaId, phone } = await fetchWabaAndPhone(tokenData.access_token);
  const registration = await registerPhoneNumber(phone.id, tokenData.access_token);

  const connection = await WhatsAppConnection.findOneAndUpdate(
    { organizationId, branchId },
    {
      organizationId,
      branchId,
      wabaId,
      phoneNumberId: phone.id,
      displayPhoneNumber: phone.display_phone_number,
      verifiedName: phone.verified_name,
      accessTokenEnc: encrypt(tokenData.access_token),
      connectedBy: userId,
      connectedAt: new Date(),
      status: 'webhook_pending',
      phoneRegistered: registration.success,
      registrationPinEnc: registration.pin ? encrypt(registration.pin) : undefined,
      lastError: registration.success ? null : registration.error,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  const subscribed = await subscribeAppToWaba(wabaId, tokenData.access_token, connection.apiVersion);
  connection.webhookSubscribed = subscribed;
  connection.status = subscribed ? 'connected' : 'webhook_pending';
  if (subscribed) connection.webhookVerifiedAt = new Date();
  await connection.save();

  return connection;
}

async function completeManualConnect({ organizationId, branchId, userId, wabaId, phoneNumberId, accessToken, displayPhoneNumber, verifiedName, businessAccountId }) {
  const registration = await registerPhoneNumber(phoneNumberId, accessToken);
  const subscribed = await subscribeAppToWaba(wabaId, accessToken, 'v21.0');
  const connection = await WhatsAppConnection.findOneAndUpdate(
    { organizationId, branchId },
    {
      organizationId,
      branchId,
      businessAccountId,
      wabaId,
      phoneNumberId,
      displayPhoneNumber,
      verifiedName,
      accessTokenEnc: encrypt(accessToken),
      connectedBy: userId,
      connectedAt: new Date(),
      webhookSubscribed: subscribed,
      webhookVerifiedAt: subscribed ? new Date() : undefined,
      status: subscribed ? 'connected' : 'webhook_pending',
      phoneRegistered: registration.success,
      registrationPinEnc: registration.pin ? encrypt(registration.pin) : undefined,
      lastError: registration.success ? null : registration.error,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return connection;
}

async function getConnection(organizationId, branchId) {
  return WhatsAppConnection.findOne({ organizationId, branchId });
}

async function getActiveConnection(organizationId, branchId) {
  return WhatsAppConnection.findOne({ organizationId, branchId, status: 'connected' });
}

async function getConnectionByPhoneNumberId(phoneNumberId) {
  return WhatsAppConnection.findOne({ phoneNumberId, status: { $in: ['connected', 'webhook_pending'] } });
}

function getDecryptedToken(connection) {
  if (!connection?.accessTokenEnc) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'WhatsApp access token not found');
  }
  return decrypt(connection.accessTokenEnc);
}

async function disconnect(organizationId, branchId) {
  const connection = await WhatsAppConnection.findOne({ organizationId, branchId });
  if (!connection) {
    throw new ApiError(httpStatus.NOT_FOUND, 'WhatsApp connection not found');
  }
  connection.status = 'disconnected';
  connection.accessTokenEnc = undefined;
  connection.webhookSubscribed = false;
  connection.lastError = null;
  await connection.save();
  return connection;
}

async function reconnect(organizationId, branchId, userId) {
  const connection = await getConnection(organizationId, branchId);
  if (!connection?.accessTokenEnc) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No stored token. Use Embedded Signup to connect again.');
  }
  const accessToken = getDecryptedToken(connection);
  if (connection.phoneNumberId && !connection.phoneRegistered) {
    const registration = await registerPhoneNumber(connection.phoneNumberId, accessToken, connection.apiVersion);
    connection.phoneRegistered = registration.success;
    if (registration.pin) connection.registrationPinEnc = encrypt(registration.pin);
    if (!registration.success) connection.lastError = registration.error;
  }
  if (connection.wabaId) {
    const subscribed = await subscribeAppToWaba(connection.wabaId, accessToken, connection.apiVersion);
    connection.webhookSubscribed = subscribed;
    connection.status = subscribed ? 'connected' : 'webhook_pending';
    connection.connectedBy = userId;
    connection.connectedAt = new Date();
  }
  await connection.save();
  return connection;
}

function toPublicConnection(connection) {
  if (!connection) {
    return {
      status: 'disconnected',
      connected: false,
      webhookSubscribed: false,
    };
  }
  const doc = connection.toJSON ? connection.toJSON() : connection;
  return {
    id: doc.id,
    status: doc.status,
    connected: doc.status === 'connected',
    wabaId: doc.wabaId,
    phoneNumberId: doc.phoneNumberId,
    displayPhoneNumber: doc.displayPhoneNumber,
    verifiedName: doc.verifiedName,
    webhookSubscribed: doc.webhookSubscribed,
    phoneRegistered: doc.phoneRegistered,
    qualityRating: doc.qualityRating,
    messagingLimit: doc.messagingLimit,
    connectedAt: doc.connectedAt,
    lastError: doc.lastError,
  };
}

module.exports = {
  startEmbeddedSignup,
  handleOAuthCallback,
  completeManualConnect,
  getConnection,
  getActiveConnection,
  getConnectionByPhoneNumberId,
  getDecryptedToken,
  disconnect,
  reconnect,
  toPublicConnection,
  getFrontendRedirectUrl,
  registerPhoneNumber,
  subscribeAppToWaba,
  graphBaseUrl,
};
