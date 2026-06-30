import React, { useEffect } from 'react';
import { PermissionsAndroid, Platform, Alert } from 'react-native';
import HomeScreen from './src/screens/HomeScreen';

async function requestSmsPermission() {
  if (Platform.OS !== 'android') return;
  try {
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.SEND_SMS, {
      title: 'SMS Permission',
      message: 'This app needs permission to send SMS messages on your behalf from this device.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    });
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      Alert.alert('Permission Denied', 'SMS permission is required for this app to work.');
    }
  } catch (err) {
    console.warn('SMS permission error:', err);
  }
}

export default function App() {
  useEffect(() => {
    requestSmsPermission();
  }, []);

  return <HomeScreen />;
}
