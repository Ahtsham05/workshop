const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { pushNotificationService } = require('../services');

const getVapidPublicKey = catchAsync(async (req, res) => {
  const publicKey = pushNotificationService.getVapidPublicKey();
  if (!publicKey) {
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'Push notifications are not configured on this server');
  }
  res.send({ publicKey });
});

const subscribe = catchAsync(async (req, res) => {
  const doc = await pushNotificationService.subscribe(req.user, req.body.subscription, {
    userAgent: req.headers['user-agent'],
  });
  res.status(httpStatus.CREATED).send(doc);
});

const unsubscribe = catchAsync(async (req, res) => {
  await pushNotificationService.unsubscribe(req.user, req.body.endpoint);
  res.send({ ok: true });
});

module.exports = { getVapidPublicKey, subscribe, unsubscribe };
