import { useCallback, useEffect, useRef, useState } from 'react';
import { useLazyGetVapidPublicKeyQuery, useSubscribePushMutation } from '@/stores/school.api';

const PUSH_DISMISSED_KEY = 'push-notifications-dismissed';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function ensureServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  try {
    return await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
  } catch {
    return null;
  }
}

export function usePushNotifications() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(PUSH_DISMISSED_KEY) === '1');
  const autoTried = useRef(false);

  const [fetchVapidKey] = useLazyGetVapidPublicKeyQuery();
  const [subscribePush] = useSubscribePushMutation();

  useEffect(() => {
    setSupported(
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  }, []);

  const subscribe = useCallback(async (requestPermission = true) => {
    if (!supported) return false;
    setLoading(true);
    try {
      if (requestPermission && Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return false;
      } else if (Notification.permission === 'denied') {
        return false;
      }

      const { data: vapidData, error: vapidError } = await fetchVapidKey();
      if (vapidError || !vapidData?.publicKey) return false;

      const registration = await ensureServiceWorker();
      if (!registration) return false;

      await navigator.serviceWorker.ready;

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidData.publicKey),
        });
      }

      const subJson = subscription.toJSON();
      await subscribePush({
        subscription: {
          endpoint: subJson.endpoint!,
          keys: {
            p256dh: subJson.keys!.p256dh!,
            auth: subJson.keys!.auth!,
          },
        },
      }).unwrap();

      setSubscribed(true);
      localStorage.removeItem(PUSH_DISMISSED_KEY);
      setDismissed(false);
      return true;
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  }, [supported, fetchVapidKey, subscribePush]);

  // Detect existing subscription or auto-subscribe when permission already granted
  useEffect(() => {
    if (!supported || autoTried.current) return;
    autoTried.current = true;

    (async () => {
      try {
        const registration = await ensureServiceWorker();
        const existing = await registration?.pushManager?.getSubscription();
        if (existing) {
          setSubscribed(true);
          return;
        }
        if (Notification.permission === 'granted') {
          await subscribe(false);
        }
      } catch {
        // ignore
      }
    })();
  }, [supported, subscribe]);

  const dismiss = useCallback(() => {
    localStorage.setItem(PUSH_DISMISSED_KEY, '1');
    setDismissed(true);
  }, []);

  return { supported, subscribed, loading, dismissed, subscribe, dismiss };
}
