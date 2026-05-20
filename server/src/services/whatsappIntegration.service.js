const config = require('../config/config');
const { WhatsAppIntegration } = require('../models');

async function getIntegrationDoc() {
  return WhatsAppIntegration.findOne().sort({ updatedAt: -1 });
}

/**
 * Resolved Cloud API config: DB settings override env vars.
 */
async function getCloudConfig() {
  const doc = await getIntegrationDoc();
  const env = config.whatsapp?.cloud || {};

  return {
    provider: doc?.provider || env.provider || 'auto',
    accessToken: (doc?.cloudAccessToken || env.accessToken || '').trim(),
    phoneNumberId: (doc?.cloudPhoneNumberId || env.phoneNumberId || '').trim(),
    apiVersion: (doc?.cloudApiVersion || env.apiVersion || 'v21.0').trim(),
    businessAccountId: (doc?.cloudBusinessAccountId || env.businessAccountId || '').trim(),
  };
}

async function getPublicConfig() {
  const doc = await getIntegrationDoc();
  const cloud = await getCloudConfig();
  const hasToken = Boolean(cloud.accessToken);

  return {
    provider: cloud.provider,
    cloud: {
      configured: Boolean(hasToken && cloud.phoneNumberId),
      phoneNumberId: cloud.phoneNumberId || null,
      apiVersion: cloud.apiVersion,
      hasAccessToken: hasToken,
      businessAccountId: cloud.businessAccountId || null,
      source: doc?.cloudAccessToken ? 'database' : cloud.accessToken ? 'environment' : 'none',
    },
  };
}

async function upsertIntegration(update) {
  const existing = await getIntegrationDoc();
  const payload = {};

  if (update.provider !== undefined) payload.provider = update.provider;
  if (update.cloudPhoneNumberId !== undefined) payload.cloudPhoneNumberId = update.cloudPhoneNumberId;
  if (update.cloudApiVersion !== undefined) payload.cloudApiVersion = update.cloudApiVersion;
  if (update.cloudBusinessAccountId !== undefined) payload.cloudBusinessAccountId = update.cloudBusinessAccountId;
  if (update.cloudAccessToken !== undefined && String(update.cloudAccessToken).trim()) {
    payload.cloudAccessToken = String(update.cloudAccessToken).trim();
  }

  if (existing) {
    Object.assign(existing, payload);
    await existing.save();
    return existing;
  }

  return WhatsAppIntegration.create(payload);
}

module.exports = {
  getIntegrationDoc,
  getCloudConfig,
  getPublicConfig,
  upsertIntegration,
};
