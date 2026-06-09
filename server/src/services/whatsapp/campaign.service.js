const httpStatus = require('http-status');
const ApiError = require('../../utils/ApiError');
const {
  WhatsAppCampaign,
  WhatsAppTemplate,
  Student,
  Customer,
} = require('../../models');
const messagingService = require('./messaging.service');
const { normalizePhone } = require('../../utils/whatsappPhone');

async function resolveAudience(organizationId, branchId, audience) {
  const phones = new Set();

  if (audience.type === 'custom_list' && audience.phones?.length) {
    audience.phones.forEach((p) => {
      const n = normalizePhone(p);
      if (n) phones.add(n);
    });
    return [...phones];
  }

  if (audience.type === 'all_customers' || audience.type === 'customers') {
    const filter = { organizationId, branchId };
    if (audience.customerIds?.length) filter._id = { $in: audience.customerIds };
    const customers = await Customer.find(filter).select('phone whatsapp');
    customers.forEach((c) => {
      const n = normalizePhone(c.whatsapp || c.phone);
      if (n) phones.add(n);
    });
    return [...phones];
  }

  if (['all_parents', 'class', 'section', 'students'].includes(audience.type)) {
    const filter = { organizationId, branchId, status: 'active' };
    if (audience.classId) filter.classId = audience.classId;
    if (audience.sectionId) filter.sectionId = audience.sectionId;
    if (audience.studentIds?.length) filter._id = { $in: audience.studentIds };

    const students = await Student.find(filter).select('parent.phone');
    students.forEach((s) => {
      const n = normalizePhone(s.parent?.phone);
      if (n) phones.add(n);
    });
    return [...phones];
  }

  return [];
}

function buildTemplateComponents(template, params = {}) {
  if (!params || Object.keys(params).length === 0) return [];
  const bodyParams = Object.values(params).map((v) => ({ type: 'text', text: String(v) }));
  return [{ type: 'body', parameters: bodyParams }];
}

async function createCampaign(data) {
  const template = await WhatsAppTemplate.findOne({
    _id: data.templateId,
    organizationId: data.organizationId,
    branchId: data.branchId,
  });
  if (!template) throw new ApiError(httpStatus.NOT_FOUND, 'Template not found');
  if (template.status !== 'APPROVED') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Template must be APPROVED before sending campaign');
  }

  const phones = await resolveAudience(data.organizationId, data.branchId, data.audience);
  const campaign = await WhatsAppCampaign.create({
    ...data,
    stats: { total: phones.length, sent: 0, delivered: 0, read: 0, failed: 0 },
    status: data.scheduledAt ? 'scheduled' : 'draft',
  });
  return { campaign, phones };
}

async function runCampaign(campaign, phones, sentBy) {
  campaign.status = 'running';
  campaign.startedAt = new Date();
  await campaign.save();

  const template = await WhatsAppTemplate.findById(campaign.templateId);
  const components = buildTemplateComponents(template, campaign.templateParams);

  for (const phone of phones) {
    try {
      await messagingService.sendTemplate({
        organizationId: campaign.organizationId,
        branchId: campaign.branchId,
        phone,
        templateName: template.name,
        language: template.language,
        components,
        source: 'campaign',
        sentBy,
        campaignId: campaign._id,
      });
      campaign.stats.sent += 1;
    } catch {
      campaign.stats.failed += 1;
    }
    await new Promise((r) => setTimeout(r, 80));
  }

  campaign.status = 'completed';
  campaign.completedAt = new Date();
  await campaign.save();
  return campaign;
}

async function listCampaigns(filter, options) {
  return WhatsAppCampaign.paginate(filter, options);
}

async function getCampaign(organizationId, branchId, id) {
  return WhatsAppCampaign.findOne({ _id: id, organizationId, branchId }).populate('templateId');
}

module.exports = {
  createCampaign,
  runCampaign,
  resolveAudience,
  listCampaigns,
  getCampaign,
};
