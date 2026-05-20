/**
 * Routes WhatsApp sends to Meta Cloud API and/or local whatsapp-web.js session.
 */

const whatsappService = require('./whatsapp.service');
const whatsappCloud = require('./whatsappCloud.service');
const whatsappIntegration = require('./whatsappIntegration.service');

async function getStatus() {
  const cloudConfig = await whatsappIntegration.getCloudConfig();
  const publicConfig = await whatsappIntegration.getPublicConfig();
  const webStatus = whatsappService.getStatus();

  const cloudReady = whatsappCloud.isConfigured(cloudConfig);
  const webReady = webStatus.state === 'READY';

  let activeProvider = 'none';
  if (cloudConfig.provider === 'cloud' && cloudReady) {
    activeProvider = 'cloud';
  } else if (cloudConfig.provider === 'web' && webReady) {
    activeProvider = 'web';
  } else if (cloudConfig.provider === 'auto') {
    if (cloudReady) activeProvider = 'cloud';
    else if (webReady) activeProvider = 'web';
  }

  return {
    provider: cloudConfig.provider,
    activeProvider,
    cloud: {
      ...publicConfig.cloud,
      ready: cloudReady,
    },
    web: {
      state: webStatus.state,
      qrImage: webStatus.qrImage,
      ready: webReady,
    },
    // Back-compat for existing UI polling web state
    state: cloudReady && cloudConfig.provider !== 'web' ? 'READY' : webStatus.state,
    qrImage: webStatus.qrImage,
  };
}

async function sendDocument(phone, payload) {
  const cloudConfig = await whatsappIntegration.getCloudConfig();
  const provider = cloudConfig.provider || 'auto';
  const cloudReady = whatsappCloud.isConfigured(cloudConfig);

  if ((provider === 'cloud' || provider === 'auto') && cloudReady) {
    const cloudResult = await whatsappCloud.sendDocument(phone, payload, cloudConfig);
    if (cloudResult.success) {
      return { ...cloudResult, provider: 'cloud' };
    }
    if (provider === 'cloud') {
      return { ...cloudResult, provider: 'cloud' };
    }
  }

  if (provider === 'web' || provider === 'auto') {
    const webResult = await whatsappService.sendDocument(phone, payload);
    return { ...webResult, provider: 'web' };
  }

  return {
    success: false,
    provider: 'none',
    error:
      'WhatsApp is not configured. Set up WhatsApp Cloud API in Settings, or connect local WhatsApp (QR scan).',
  };
}

module.exports = {
  getStatus,
  sendDocument,
};
