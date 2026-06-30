import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  StatusBar,
} from 'react-native';

interface Config {
  serverUrl: string;
  deviceToken: string;
  deviceName: string;
}

interface Props {
  initialConfig: Config | null;
  onSave: (config: Config) => void;
  onBack: () => void;
}

export default function SettingsScreen({ initialConfig, onSave, onBack }: Props) {
  const [serverUrl, setServerUrl] = useState(initialConfig?.serverUrl || '');
  const [deviceToken, setDeviceToken] = useState(initialConfig?.deviceToken || '');
  const [deviceName, setDeviceName] = useState(initialConfig?.deviceName || 'My Android Phone');

  const handleSave = () => {
    const url = serverUrl.trim().replace(/\/+$/, '');
    const token = deviceToken.trim();
    const name = deviceName.trim() || 'Android Device';

    if (!url) { Alert.alert('Error', 'Server URL is required'); return; }
    if (!token) { Alert.alert('Error', 'Device token is required'); return; }

    try { new URL(url); } catch { Alert.alert('Error', 'Invalid server URL (example: https://workshop-qxya.onrender.com)'); return; }

    onSave({ serverUrl: url, deviceToken: token, deviceName: name });
  };

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#1a1a2e" barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.label}>Server URL</Text>
          <TextInput
            style={styles.input}
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder="https://your-backend.onrender.com"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Text style={styles.hint}>Your backend server URL (no trailing slash)</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Device Token</Text>
          <TextInput
            style={styles.input}
            value={deviceToken}
            onChangeText={setDeviceToken}
            placeholder="Paste the token from your web dashboard"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.hint}>Go to Settings → SMS Gateway → Add Device to get a token</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Device Name</Text>
          <TextInput
            style={styles.input}
            value={deviceName}
            onChangeText={setDeviceName}
            placeholder="My Android Phone"
            placeholderTextColor="#9ca3af"
          />
          <Text style={styles.hint}>A label to identify this device in the dashboard</Text>
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>Save & Connect</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: { backgroundColor: '#1a1a2e', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16 },
  backBtn: { padding: 4 },
  backText: { color: '#fff', fontSize: 15 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  content: { padding: 20, gap: 16 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 1 },
  label: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, fontSize: 14, color: '#111827', backgroundColor: '#f9fafb' },
  hint: { fontSize: 11, color: '#9ca3af', marginTop: 6 },
  saveBtn: { backgroundColor: '#25D366', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
