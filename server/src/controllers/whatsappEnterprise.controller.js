const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const pick = require('../utils/pick');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');
const { templateService, campaignService, analyticsService, integrationService } = require('../services/whatsapp');

const syncTemplates = catchAsync(async (req, res) => {
  const templates = await templateService.syncFromMeta(req.organizationId, req.branchId);
  res.send({ synced: templates.length, templates });
});

const listTemplates = catchAsync(async (req, res) => {
  const filter = applyBranchFilter(pick(req.query, ['status', 'internalCategory']), req);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await templateService.listTemplates(filter, options);
  res.send(result);
});

const getTemplate = catchAsync(async (req, res) => {
  const template = await templateService.getTemplate(req.organizationId, req.branchId, req.params.id);
  if (!template) throw new ApiError(httpStatus.NOT_FOUND, 'Template not found');
  res.send(template);
});

const listCampaigns = catchAsync(async (req, res) => {
  const filter = applyBranchFilter(pick(req.query, ['status']), req);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await campaignService.listCampaigns(filter, options);
  res.send(result);
});

const createCampaign = catchAsync(async (req, res) => {
  const { campaign, phones } = await campaignService.createCampaign({
    ...req.body,
    ...getBranchContext(req),
  });
  res.status(httpStatus.CREATED).send({ campaign, audienceSize: phones.length });
});

const runCampaign = catchAsync(async (req, res) => {
  const campaign = await campaignService.getCampaign(req.organizationId, req.branchId, req.params.id);
  if (!campaign) throw new ApiError(httpStatus.NOT_FOUND, 'Campaign not found');
  const phones = await campaignService.resolveAudience(req.organizationId, req.branchId, campaign.audience);
  const result = await campaignService.runCampaign(campaign, phones, req.user.id);
  res.send(result);
});

const getCampaignReport = catchAsync(async (req, res) => {
  const campaign = await campaignService.getCampaign(req.organizationId, req.branchId, req.params.id);
  if (!campaign) throw new ApiError(httpStatus.NOT_FOUND, 'Campaign not found');
  res.send(campaign);
});

const getAnalyticsOverview = catchAsync(async (req, res) => {
  const overview = await analyticsService.getOverview(req.organizationId, req.branchId, pick(req.query, ['from', 'to']));
  res.send(overview);
});

const getAnalyticsTimeSeries = catchAsync(async (req, res) => {
  const data = await analyticsService.getMessageTimeSeries(
    req.organizationId,
    req.branchId,
    Number(req.query.days) || 7,
  );
  res.send(data);
});

const sendInvoicePdf = catchAsync(async (req, res) => {
  const { phone, pdfBase64, filename, caption } = req.body;
  const result = await integrationService.sendInvoicePdf({
    organizationId: req.organizationId,
    branchId: req.branchId,
    phone,
    pdfBase64,
    filename,
    caption,
    sentBy: req.user.id,
  });
  res.send({ success: true, ...result });
});

const sendPaymentReminder = catchAsync(async (req, res) => {
  const result = await integrationService.sendPaymentReminder({
    organizationId: req.organizationId,
    branchId: req.branchId,
    customerId: req.body.customerId,
    sentBy: req.user.id,
  });
  res.send({ success: true, ...result });
});

const sendAttendanceAlert = catchAsync(async (req, res) => {
  const result = await integrationService.sendAttendanceAlert({
    organizationId: req.organizationId,
    branchId: req.branchId,
    studentId: req.body.studentId,
    date: req.body.date || new Date(),
    sentBy: req.user.id,
  });
  res.send({ success: true, ...result });
});

const sendFeeReminder = catchAsync(async (req, res) => {
  const result = await integrationService.sendFeeReminder({
    organizationId: req.organizationId,
    branchId: req.branchId,
    voucherId: req.body.voucherId,
    sentBy: req.user.id,
  });
  res.send({ success: true, ...result });
});

const sendResultNotification = catchAsync(async (req, res) => {
  const result = await integrationService.sendResultNotification({
    organizationId: req.organizationId,
    branchId: req.branchId,
    studentId: req.body.studentId,
    examName: req.body.examName,
    sentBy: req.user.id,
  });
  res.send({ success: true, ...result });
});

const sendHolidayNotice = catchAsync(async (req, res) => {
  const results = await integrationService.sendHolidayNotice({
    organizationId: req.organizationId,
    branchId: req.branchId,
    audience: req.body.audience,
    message: req.body.message,
    sentBy: req.user.id,
  });
  res.send({ success: true, results });
});

module.exports = {
  syncTemplates,
  listTemplates,
  getTemplate,
  listCampaigns,
  createCampaign,
  runCampaign,
  getCampaignReport,
  getAnalyticsOverview,
  getAnalyticsTimeSeries,
  sendInvoicePdf,
  sendPaymentReminder,
  sendAttendanceAlert,
  sendFeeReminder,
  sendResultNotification,
  sendHolidayNotice,
};
