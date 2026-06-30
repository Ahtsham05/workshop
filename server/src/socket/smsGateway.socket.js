const { Server } = require('socket.io');
const logger = require('../config/logger');
const smsGatewayService = require('../services/smsGateway.service');

function initSmsGatewaySocket(httpServer, corsOptions) {
  const io = new Server(httpServer, {
    path: '/socket/sms-gateway',
    cors: corsOptions,
    transports: ['websocket', 'polling'],
  });

  io.on('connection', async (socket) => {
    const { token, deviceName, deviceId: clientDeviceId, appVersion } = socket.handshake.auth || {};

    if (!token) {
      socket.emit('auth_error', { message: 'Device token required' });
      socket.disconnect(true);
      return;
    }

    let device;
    try {
      device = await smsGatewayService.authenticateDevice(token);
    } catch {
      socket.emit('auth_error', { message: 'Invalid device token' });
      socket.disconnect(true);
      return;
    }

    // Update device info and mark online
    if (deviceName) device.deviceName = deviceName;
    if (appVersion) device.appVersion = appVersion;
    await device.save();
    await smsGatewayService.markDeviceOnline(device.deviceId, socket.id);
    smsGatewayService.registerSocket(device.deviceId, socket);

    logger.info(`SMS Gateway device connected: ${device.deviceName} (${device.deviceId})`);

    socket.emit('registered', {
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      simSlot: device.simSlot,
    });

    // Mobile reports SMS sent/delivered/failed
    socket.on('sms:status', async ({ messageId, status, error }) => {
      if (!messageId || !status) return;
      try {
        await smsGatewayService.updateMessageStatus({ messageId, status, error });
        if (status === 'sent' || status === 'delivered') {
          await smsGatewayService.updateDeviceStats(device.deviceId);
        }
        logger.info(`SMS ${messageId} → ${status}`);
      } catch (err) {
        logger.error('Error updating SMS status:', err.message);
      }
    });

    // Mobile sends heartbeat to keep connection alive
    socket.on('ping', () => {
      socket.emit('pong');
      smsGatewayService.markDeviceOnline(device.deviceId, socket.id).catch(() => {});
    });

    socket.on('disconnect', async (reason) => {
      logger.info(`SMS Gateway device disconnected: ${device.deviceName} — ${reason}`);
      smsGatewayService.unregisterSocket(device.deviceId);
      await smsGatewayService.markDeviceOffline(device.deviceId);
    });
  });

  return io;
}

module.exports = { initSmsGatewaySocket };
