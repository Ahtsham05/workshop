const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const smsGatewayService = require('../services/smsGateway.service');

const registerDevice = catchAsync(async (req, res) => {
  const { deviceName, simSlot, phoneNumber } = req.body;
  const device = await smsGatewayService.registerDevice({
    organizationId: req.organizationId,
    branchId: req.branchId,
    deviceName,
    simSlot,
    phoneNumber,
  });
  res.status(httpStatus.CREATED).send({
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    token: device.token,
    simSlot: device.simSlot,
  });
});

const listDevices = catchAsync(async (req, res) => {
  const devices = await smsGatewayService.listDevices({
    organizationId: req.organizationId,
    branchId: req.branchId,
  });
  res.send(devices.map((d) => ({
    deviceId: d.deviceId,
    deviceName: d.deviceName,
    token: d.token,
    isOnline: d.isOnline,
    lastSeen: d.lastSeen,
    simSlot: d.simSlot,
    phoneNumber: d.phoneNumber,
    smsSentToday: d.smsSentToday,
    smsSentTotal: d.smsSentTotal,
    createdAt: d.createdAt,
  })));
});

const deleteDevice = catchAsync(async (req, res) => {
  await smsGatewayService.deleteDevice({
    deviceId: req.params.deviceId,
    organizationId: req.organizationId,
  });
  res.status(httpStatus.NO_CONTENT).send();
});

const sendSms = catchAsync(async (req, res) => {
  const { to, message, source, refId } = req.body;
  if (!to || !message) throw new ApiError(httpStatus.BAD_REQUEST, 'to and message are required');
  const msg = await smsGatewayService.sendSms({
    organizationId: req.organizationId,
    branchId: req.branchId,
    to,
    message,
    source,
    refId,
  });
  res.status(httpStatus.CREATED).send(msg);
});

const sendBulkSms = catchAsync(async (req, res) => {
  const { recipients, message, source, refId } = req.body;
  if (!recipients?.length || !message) throw new ApiError(httpStatus.BAD_REQUEST, 'recipients and message are required');
  const results = await smsGatewayService.sendBulkSms({
    organizationId: req.organizationId,
    branchId: req.branchId,
    recipients,
    message,
    source,
    refId,
  });
  res.send({ results, total: results.length, sent: results.filter((r) => r.status !== 'failed').length });
});

const getMessages = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const { status, source, search } = req.query;
  const data = await smsGatewayService.getMessages({
    organizationId: req.organizationId,
    branchId: req.branchId,
    page,
    limit,
    status,
    source,
    search,
  });
  res.send(data);
});

const resendSms = catchAsync(async (req, res) => {
  const result = await smsGatewayService.resendSms({
    organizationId: req.organizationId,
    branchId: req.branchId,
    messageId: req.params.id,
  });
  res.send(result);
});

const deleteSms = catchAsync(async (req, res) => {
  await smsGatewayService.deleteSms({
    organizationId: req.organizationId,
    branchId: req.branchId,
    messageId: req.params.id,
  });
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  registerDevice,
  listDevices,
  deleteDevice,
  sendSms,
  sendBulkSms,
  getMessages,
  resendSms,
  deleteSms,
};
