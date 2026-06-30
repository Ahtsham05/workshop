import { io, Socket } from 'socket.io-client';
import { NativeModules } from 'react-native';

const { SmsModule } = NativeModules;

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SmsGatewayConfig {
  serverUrl: string;
  deviceToken: string;
  deviceName: string;
}

type StatusListener = (status: ConnectionStatus) => void;
type StatsListener = (stats: { sent: number; failed: number }) => void;

class SocketService {
  private socket: Socket | null = null;
  private statusListeners: StatusListener[] = [];
  private statsListeners: StatsListener[] = [];
  private smsSent = 0;
  private smsFailed = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connect(config: SmsGatewayConfig) {
    if (this.socket?.connected) this.disconnect();

    this.notifyStatus('connecting');

    this.socket = io(config.serverUrl, {
      path: '/socket/sms-gateway',
      transports: ['websocket'],
      auth: {
        token: config.deviceToken,
        deviceName: config.deviceName,
        appVersion: '1.0.0',
      },
      reconnection: true,
      reconnectionDelay: 3000,
      reconnectionAttempts: Infinity,
    });

    this.socket.on('connect', () => {
      this.notifyStatus('connected');
    });

    this.socket.on('registered', (data: any) => {
      console.log('Device registered:', data);
    });

    this.socket.on('auth_error', (data: any) => {
      console.error('Auth error:', data.message);
      this.notifyStatus('error');
      this.socket?.disconnect();
    });

    this.socket.on('disconnect', () => {
      this.notifyStatus('disconnected');
    });

    this.socket.on('connect_error', () => {
      this.notifyStatus('error');
    });

    // Backend sends SMS to send
    this.socket.on('sms:send', async (payload: { messageId: string; to: string; message: string; simSlot: number }) => {
      try {
        await SmsModule.sendSms(payload.to, payload.message, payload.simSlot ?? 0);
        this.smsSent++;
        this.notifyStats();
        this.socket?.emit('sms:status', { messageId: payload.messageId, status: 'sent' });
      } catch (err: any) {
        this.smsFailed++;
        this.notifyStats();
        this.socket?.emit('sms:status', {
          messageId: payload.messageId,
          status: 'failed',
          error: err?.message || 'SMS send failed',
        });
      }
    });

    this.socket.on('pong', () => {});

    // Heartbeat every 30s to keep connection alive
    const heartbeat = setInterval(() => {
      if (this.socket?.connected) this.socket.emit('ping');
    }, 30000);

    this.socket.on('disconnect', () => clearInterval(heartbeat));
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.notifyStatus('disconnected');
  }

  isConnected() {
    return this.socket?.connected ?? false;
  }

  getStats() {
    return { sent: this.smsSent, failed: this.smsFailed };
  }

  onStatusChange(listener: StatusListener) {
    this.statusListeners.push(listener);
    return () => { this.statusListeners = this.statusListeners.filter(l => l !== listener); };
  }

  onStatsChange(listener: StatsListener) {
    this.statsListeners.push(listener);
    return () => { this.statsListeners = this.statsListeners.filter(l => l !== listener); };
  }

  private notifyStatus(status: ConnectionStatus) {
    this.statusListeners.forEach(l => l(status));
  }

  private notifyStats() {
    this.statsListeners.forEach(l => l(this.getStats()));
  }
}

export const socketService = new SocketService();
