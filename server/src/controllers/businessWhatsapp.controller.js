const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const {
  whatsappService,
  whatsappDispatchService,
  whatsappIntegrationService,
} = require('../services');

const IS_SERVERLESS = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.FUNCTION_NAME,
);

const rejectIfServerlessAndNoCloud = async (res) => {
  if (!IS_SERVERLESS) return false;
  const status = await whatsappDispatchService.getStatus();
  if (status.cloud?.configured) return false;
  res.status(503).json({
    state: 'SERVERLESS_UNSUPPORTED',
    error:
      'Local WhatsApp (QR) requires a persistent server. Configure WhatsApp Cloud API in Settings instead.',
  });
  return true;
};

const getStatus = catchAsync(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.send(await whatsappDispatchService.getStatus());
});

const getCloudConfig = catchAsync(async (req, res) => {
  res.send(await whatsappIntegrationService.getPublicConfig());
});

const updateCloudConfig = catchAsync(async (req, res) => {
  await whatsappIntegrationService.upsertIntegration(req.body);
  res.send(await whatsappIntegrationService.getPublicConfig());
});

const connect = catchAsync(async (req, res) => {
  if (await rejectIfServerlessAndNoCloud(res)) return;
  const current = whatsappService.getStatus();
  if (current.state === 'READY') {
    return res.send({ message: 'Already connected', state: 'READY' });
  }
  await whatsappService.disconnect();
  whatsappService.initialize().catch(() => {});
  res.send({ message: 'Initialising WhatsApp. Poll status for QR code.', state: 'LOADING' });
});

const disconnectWhatsApp = catchAsync(async (req, res) => {
  await whatsappService.disconnect();
  res.send({ message: 'WhatsApp disconnected', state: 'DISCONNECTED' });
});

const clearSession = catchAsync(async (req, res) => {
  await whatsappService.clearSession();
  res.send({ message: 'Session cleared', state: 'DISCONNECTED' });
});

/**
 * POST /business-whatsapp/send-invoice-pdf
 * Body: { phone, pdfBase64, filename?, caption?, invoiceNumber? }
 */
const sendInvoicePdf = catchAsync(async (req, res) => {
  const { phone, pdfBase64, filename, caption, invoiceNumber } = req.body;
  if (!phone || !pdfBase64) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'phone and pdfBase64 are required');
  }

  const dispatchStatus = await whatsappDispatchService.getStatus();
  const canSendCloud = dispatchStatus.cloud?.configured;
  const canSendWeb = dispatchStatus.web?.ready;

  if (IS_SERVERLESS && !canSendCloud) {
    throw new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      'Configure WhatsApp Cloud API in Settings (Meta Business). Local QR WhatsApp is not available on serverless hosts.',
    );
  }

  if (!canSendCloud && !canSendWeb) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'WhatsApp is not ready. Configure Cloud API in Settings → WhatsApp, or scan QR for local connection.',
    );
  }

  const safeFilename =
    filename ||
    `Invoice-${String(invoiceNumber || 'invoice').replace(/[^\w.-]/g, '-')}.pdf`;

  const defaultCaption = invoiceNumber ? `Invoice ${invoiceNumber}` : 'Invoice';

  const result = await whatsappDispatchService.sendDocument(phone, {
    data: pdfBase64,
    mimetype: 'application/pdf',
    filename: safeFilename,
    caption: caption || defaultCaption,
  });

  if (!result.success) {
    throw new ApiError(httpStatus.BAD_REQUEST, result.error || 'Failed to send invoice on WhatsApp');
  }

  const via =
    result.provider === 'cloud'
      ? 'WhatsApp Cloud API'
      : 'connected WhatsApp (local)';

  res.send({
    success: true,
    provider: result.provider,
    message: `Invoice PDF sent via ${via}`,
    messageId: result.messageId,
  });
});

module.exports = {
  getStatus,
  getCloudConfig,
  updateCloudConfig,
  connect,
  disconnectWhatsApp,
  clearSession,
  sendInvoicePdf,
};
