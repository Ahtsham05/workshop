const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const config = require('../config/config');
const connectionService = require('../services/whatsapp/connection.service');

const getConnection = catchAsync(async (req, res) => {
  const connection = await connectionService.getConnection(req.organizationId, req.branchId);
  res.send(connectionService.toPublicConnection(connection));
});

/* SWAP TO EMBEDDED SIGNUP HERE — pre-App-Review fallback: serves the static
 * Meta-hosted Embedded Signup link. Once the app is approved, the frontend's
 * FB.login flow (useEmbeddedWhatsAppSignup) is the primary path and this can
 * be removed. */
const getMetaHostedLink = catchAsync(async (req, res) => {
  if (!config.whatsapp.meta.hostedLink) {
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'META_HOSTED_LINK is not configured');
  }
  res.send({ link: config.whatsapp.meta.hostedLink });
});

const startEmbeddedSignup = catchAsync(async (req, res) => {
  const payload = await connectionService.startEmbeddedSignup({
    organizationId: req.organizationId,
    branchId: req.branchId,
    userId: req.user.id,
  });
  res.send(payload);
});

const oauthCallback = catchAsync(async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) {
    return res.redirect(`${connectionService.getFrontendRedirectUrl()}/settings/whatsapp?error=missing_code`);
  }
  await connectionService.handleOAuthCallback({ code, state });
  res.redirect(`${connectionService.getFrontendRedirectUrl()}/settings/whatsapp?connected=1`);
});

const reconnect = catchAsync(async (req, res) => {
  const connection = await connectionService.reconnect(req.organizationId, req.branchId, req.user.id);
  res.send(connectionService.toPublicConnection(connection));
});

const disconnect = catchAsync(async (req, res) => {
  const connection = await connectionService.disconnect(req.organizationId, req.branchId);
  res.send(connectionService.toPublicConnection(connection));
});

const manualConnect = catchAsync(async (req, res) => {
  const { wabaId, phoneNumberId, accessToken, displayPhoneNumber, verifiedName, businessAccountId } = req.body;
  const connection = await connectionService.completeManualConnect({
    organizationId: req.organizationId,
    branchId: req.branchId,
    userId: req.user.id,
    wabaId,
    phoneNumberId,
    accessToken,
    displayPhoneNumber,
    verifiedName,
    businessAccountId,
  });
  res.status(httpStatus.CREATED).send(connectionService.toPublicConnection(connection));
});

module.exports = {
  getConnection,
  getMetaHostedLink,
  startEmbeddedSignup,
  oauthCallback,
  reconnect,
  disconnect,
  manualConnect,
};
