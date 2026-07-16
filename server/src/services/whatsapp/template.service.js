const { WhatsAppTemplate, Organization } = require('../../models');
const connectionService = require('./connection.service');
const ApiError = require('../../utils/ApiError');
const httpStatus = require('http-status');
const logger = require('../../config/logger');
const { getSuggestedTemplates, countVariables } = require('../../config/whatsappTemplateDefaults');

const PLACEHOLDER_RE = /\{\{\s*\d+\s*\}\}/g;

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

// Placeholders must be exactly {{1}}..{{n}} with no gaps/duplicates — this is what Meta's
// template engine requires, and it's also what keeps our positional templateParams
// (messaging.service.js#sendMessage) lined up with the approved template's body.
function assertValidPlaceholders(bodyText) {
  const found = (String(bodyText || '').match(PLACEHOLDER_RE) || []).map((m) => Number(m.replace(/\D/g, '')));
  if (found.length === 0) return;
  const unique = [...new Set(found)].sort((a, b) => a - b);
  const expected = unique.map((_, i) => i + 1);
  if (unique.join(',') !== expected.join(',')) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Template variables must be numbered sequentially starting at {{1}} with no gaps (e.g. {{1}}, {{2}}, {{3}}).',
    );
  }
}

// Meta rejects a body that starts or ends right at a variable — punctuation alone after
// the last {{n}} (e.g. a trailing ".") doesn't count as real content in Meta's eyes.
const WORD_RE = /[\p{L}\p{N}]/u;

function assertNoLeadingTrailingVariable(bodyText) {
  const text = String(bodyText || '');
  const matches = [...text.matchAll(PLACEHOLDER_RE)];
  if (!matches.length) return;

  const before = text.slice(0, matches[0].index);
  const last = matches[matches.length - 1];
  const after = text.slice(last.index + last[0].length);

  if (!WORD_RE.test(before) || !WORD_RE.test(after)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Template text needs real words before the first variable and after the last one — punctuation alone (like a trailing period) is not enough for WhatsApp.',
    );
  }
}

// Meta requires an `example.body_text` sample for every BODY component that contains
// {{n}} placeholders — without it, template creation fails with a bare "Invalid parameter"
// (no field-level detail). We don't collect real sample values from the submitter, so we
// fill in generic-but-plausible placeholders just to satisfy the API contract.
const EXAMPLE_VALUE_POOL = ['John Doe', '12345', '500', '2026-07-16', '1000'];

function buildBodyExample(bodyText) {
  const count = countVariables(bodyText);
  if (!count) return undefined;
  return Array.from({ length: count }, (_, i) => EXAMPLE_VALUE_POOL[i] || `Value${i + 1}`);
}

async function createTemplate(organizationId, branchId, { name, language = 'en', category, bodyText, internalCategory = 'general' }) {
  if (!/^[a-z0-9_]+$/.test(name || '')) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Template name must be lowercase letters, numbers and underscores only');
  }
  assertValidPlaceholders(bodyText);
  assertNoLeadingTrailingVariable(bodyText);

  const connection = await connectionService.getActiveConnection(organizationId, branchId);
  if (!connection?.wabaId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'WhatsApp not connected');
  }
  const accessToken = connectionService.getDecryptedToken(connection);

  const bodyComponent = { type: 'BODY', text: bodyText };
  const exampleValues = buildBodyExample(bodyText);
  if (exampleValues) {
    bodyComponent.example = { body_text: [exampleValues] };
  }
  const components = [bodyComponent];
  const url = `${connectionService.graphBaseUrl(connection.apiVersion)}/${connection.wabaId}/message_templates`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, language, category, components }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.error('WhatsApp template submission failed:', JSON.stringify(body?.error || body));
    const metaError = body?.error || {};
    const detail =
      metaError.error_user_msg ||
      metaError.error_data?.details ||
      metaError.message ||
      'Template submission to Meta failed';
    throw new ApiError(httpStatus.BAD_REQUEST, detail);
  }

  return WhatsAppTemplate.findOneAndUpdate(
    { organizationId, branchId, name, language },
    {
      organizationId,
      branchId,
      metaTemplateId: body.id ? String(body.id) : undefined,
      name,
      language,
      category,
      status: body.status || 'PENDING',
      components,
      internalCategory,
      variableCount: countVariables(bodyText),
      lastSyncedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

// Complements the message_template_status_update webhook (webhook.service.js) with an
// on-demand check the UI can trigger, for setups where the webhook hasn't fired yet.
async function checkApprovalStatus(organizationId, branchId, id) {
  const template = await getTemplate(organizationId, branchId, id);
  if (!template) throw new ApiError(httpStatus.NOT_FOUND, 'Template not found');
  if (!template.metaTemplateId) return template;

  const connection = await connectionService.getActiveConnection(organizationId, branchId);
  if (!connection) throw new ApiError(httpStatus.BAD_REQUEST, 'WhatsApp not connected');
  const accessToken = connectionService.getDecryptedToken(connection);

  const url = `${connectionService.graphBaseUrl(connection.apiVersion)}/${template.metaTemplateId}?fields=status,rejected_reason,category`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(httpStatus.BAD_REQUEST, body.error?.message || 'Template status check failed');
  }

  template.status = body.status || template.status;
  template.rejectionReason = body.rejected_reason || template.rejectionReason;
  template.lastSyncedAt = new Date();
  await template.save();
  return template;
}

async function listSuggestedTemplates(organizationId, branchId) {
  const organization = await Organization.findById(organizationId).select('businessType').lean();
  const suggestions = getSuggestedTemplates(organization?.businessType);
  const existing = await WhatsAppTemplate.find({ organizationId, branchId, name: { $in: suggestions.map((s) => s.name) } })
    .select('name status')
    .lean();
  const existingByName = new Map(existing.map((t) => [t.name, t.status]));

  return suggestions.map((s) => ({
    ...s,
    alreadyCreated: existingByName.has(s.name),
    status: existingByName.get(s.name) || null,
  }));
}

module.exports = {
  syncFromMeta,
  listTemplates,
  getTemplate,
  createTemplate,
  checkApprovalStatus,
  listSuggestedTemplates,
};
