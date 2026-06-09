const { WhatsAppTemplate } = require('../../models');
const connectionService = require('./connection.service');
const ApiError = require('../../utils/ApiError');
const httpStatus = require('http-status');

async function syncFromMeta(organizationId, branchId) {
  const connection = await connectionService.getActiveConnection(organizationId, branchId);
  if (!connection?.wabaId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'WhatsApp not connected');
  }

  const accessToken = connectionService.getDecryptedToken(connection);
  const url = `${connectionService.graphBaseUrl(connection.apiVersion)}/${connection.wabaId}/message_templates?limit=100`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const body = await res.json();
  if (!res.ok) {
    throw new ApiError(httpStatus.BAD_REQUEST, body.error?.message || 'Template sync failed');
  }

  const synced = [];
  for (const tpl of body.data || []) {
    const doc = await WhatsAppTemplate.findOneAndUpdate(
      { organizationId, branchId, name: tpl.name, language: tpl.language },
      {
        organizationId,
        branchId,
        metaTemplateId: tpl.id,
        name: tpl.name,
        language: tpl.language,
        category: tpl.category,
        status: tpl.status,
        components: tpl.components,
        lastSyncedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    synced.push(doc);
  }
  return synced;
}

async function listTemplates(filter, options) {
  return WhatsAppTemplate.paginate(filter, options);
}

async function getTemplate(organizationId, branchId, id) {
  return WhatsAppTemplate.findOne({ _id: id, organizationId, branchId });
}

module.exports = { syncFromMeta, listTemplates, getTemplate };
