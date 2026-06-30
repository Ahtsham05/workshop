import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { socketService, ConnectionStatus } from '../services/SocketService';
import SettingsScreen from './SettingsScreen';

const CONFIG_KEY = 'sms_gateway_config';

export default function HomeScreen() {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [stats, setStats] = useState({ sent: 0, failed: 0 });
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState<{ serverUrl: string; deviceToken: string; deviceName: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const loadConfig = useCallback(async () => {
    const raw = await AsyncStorage.getItem(CONFIG_KEY);
    if (raw) {
      setConfig(JSON.parse(raw));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    const unsubStatus = socketService.onStatusChange(setStatus);
    const unsubStats = socketService.onStatsChange(setStats);
    return () => { unsubStatus(); unsubStats(); };
  }, []);

  const handleConnect = useCallback(() => {
    if (!config?.serverUrl || !config?.deviceToken) {
      Alert.alert('Setup Required', 'Please configure server URL and device token first.');
      setShowSettings(true);
      return;
    }
    socketService.connect(config);
  }, [config]);

  const handleDisconnect = useCallback(() => {
    socketService.disconnect();
  }, []);

  const handleSaveSettings = useCallback(async (newConfig: typeof config) => {
    await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(newConfig));
    setConfig(newConfig);
    setShowSettings(false);
    socketService.disconnect();
  }, []);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#25D366" /></View>;
  }

  if (showSettings) {
    return (
      <SettingsScreen
        initialConfig={config}
        onSave={handleSaveSettings}
        onBack={() => setShowSettings(false)}
      />
    );
  }

  const statusColor = { connected: '#25D366', connecting: '#f59e0b', disconnected: '#6b7280', error: '#ef4444' }[status];
  const statusLabel = { connected: 'Connected', connecting: 'Connecting…', disconnected: 'Disconnected', error: 'Connection Error' }[status];

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#1a1a2e" barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>SMS Gateway</Text>
        <TouchableOpacity style={styles.settingsBtn} onPress={() => setShowSettings(true)}>
          <Text style={styles.settingsBtnText}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Status Card */}
        <View style={styles.card}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          {config?.serverUrl ? (
            <Text style={styles.serverUrl} numberOfLines={1}>{config.serverUrl}</Text>
          ) : null}
          {config?.deviceName ? (
            <Text style={styles.deviceName}>{config.deviceName}</Text>
          ) : null}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { borderColor: '#22c55e' }]}>
            <Text style={[styles.statNumber, { color: '#22c55e' }]}>{stats.sent}</Text>
            <Text style={styles.statLabel}>Sent</Text>
          </View>
          <View style={[styles.statCard, { borderColor: '#ef4444' }]}>
            <Text style={[styles.statNumber, { color: '#ef4444' }]}>{stats.failed}</Text>
            <Text style={styles.statLabel}>Failed</Text>
          </View>
        </View>

        {/* Info box */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>How it works</Text>
          <Text style={styles.infoText}>1. Register a device token from your web dashboard</Text>
          <Text style={styles.infoText}>2. Enter the server URL and token below</Text>
          <Text style={styles.infoText}>3. Tap Connect — SMS will be sent from this phone's SIM</Text>
          <Text style={styles.infoText}>4. Keep this app open (or battery saver off)</Text>
        </View>

        {/* Connect / Disconnect */}
        {status === 'connected' ? (
          <TouchableOpacity style={[styles.btn, styles.btnRed]} onPress={handleDisconnect}>
            <Text style={styles.btnText}>Disconnect</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.btn, styles.btnGreen, (status === 'connecting') && styles.btnDisabled]}
            onPress={handleConnect}
            disabled={status === 'connecting'}
          >
            {status === 'connecting' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Connect</Text>
            )}
          </TouchableOpacity>
        )}

        {!config && (
          <TouchableOpacity style={[styles.btn, styles.btnOutline]} onPress={() => setShowSettings(true)}>
            <Text style={[styles.btnText, { color: '#6b7280' }]}>Configure Settings</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: '#1a1a2e', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  settingsBtn: { padding: 6 },
  settingsBtnText: { fontSize: 22 },
  content: { padding: 20, gap: 16 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 24, alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8 },
  statusDot: { width: 16, height: 16, borderRadius: 8, marginBottom: 10 },
  statusText: { fontSize: 20, fontWeight: '700', marginBottom: 6 },
  serverUrl: { color: '#6b7280', fontSize: 12, marginTop: 4 },
  deviceName: { color: '#374151', fontSize: 14, fontWeight: '500', marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 20, alignItems: 'center', borderWidth: 1.5, elevation: 1 },
  statNumber: { fontSize: 32, fontWeight: '800' },
  statLabel: { color: '#6b7280', fontSize: 13, marginTop: 4 },
  infoBox: { backgroundColor: '#eff6ff', borderRadius: 12, padding: 16, gap: 6, borderWidth: 1, borderColor: '#bfdbfe' },
  infoTitle: { color: '#1d4ed8', fontWeight: '700', fontSize: 14, marginBottom: 4 },
  infoText: { color: '#1e40af', fontSize: 13 },
  btn: { borderRadius: 12, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  btnGreen: { backgroundColor: '#25D366' },
  btnRed: { backgroundColor: '#ef4444' },
  btnOutline: { borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff' },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
