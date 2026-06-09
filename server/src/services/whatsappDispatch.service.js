/**
 * WhatsApp dispatch — official Meta Cloud API only (per-branch connection).
 */

const { connectionService, messagingService } = require('./whatsapp');

async function getStatus(reqContext = {}) {
  const { organizationId, branchId } = reqContext;
  if (!organizationId || !branchId) {
    return {
      provider: 'cloud',
      activeProvider: 'none',
      cloud: { ready: false, branchConnection: null },
      state: 'DISCONNECTED',
    };
  }

  const connection = await connectionService.getActiveConnection(organizationId, branchId);
  const branchConnection = connectionService.toPublicConnection(connection);
  const ready = Boolean(branchConnection.connected);

  return {
    provider: 'cloud',
    activeProvider: ready ? 'cloud' : 'none',
    cloud: {
      ready,
      branchConnection,
      displayPhoneNumber: branchConnection.displayPhoneNumber,
      verifiedName: branchConnection.verifiedName,
    },
    state: ready ? 'READY' : 'DISCONNECTED',
    connected: ready,
  };
}

async function sendDocument(phone, payload, reqContext = {}) {
  const { organizationId, branchId, sentBy } = reqContext;
  if (!organizationId || !branchId) {
    return {
      success: false,
      provider: 'none',
      error: 'Branch context required. Connect WhatsApp in Settings → WhatsApp.',
    };
  }

  const connected = await messagingService.isConnected(organizationId, branchId);
  if (!connected) {
    return {
      success: false,
      provider: 'none',
      error: 'WhatsApp Cloud API is not connected for this branch. Connect via Settings → WhatsApp.',
    };
  }

  const result = await messagingService.sendDocument({
    organizationId,
    branchId,
    phone,
    data: payload.data,
    filename: payload.filename,
    caption: payload.caption,
    source: payload.source || 'invoice',
    sentBy,
  });
  return { ...result, provider: 'cloud' };
}

module.exports = {
  getStatus,
  sendDocument,
};
