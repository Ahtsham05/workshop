import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { toast } from 'sonner';

const BANNER_HEIGHT = '3.25rem';

interface PushNotificationPromptProps {
  message?: string;
}

export function PushNotificationPrompt({ message }: PushNotificationPromptProps = {}) {
  const { supported, subscribed, loading, dismissed, subscribe, dismiss } = usePushNotifications();

  const visible = supported && !subscribed && !dismissed;

  useEffect(() => {
    if (!visible) {
      document.documentElement.style.removeProperty('--push-banner-height');
      return;
    }
    document.documentElement.style.setProperty('--push-banner-height', BANNER_HEIGHT);
    return () => {
      document.documentElement.style.removeProperty('--push-banner-height');
    };
  }, [visible]);

  if (!visible) return null;

  const handleEnable = async () => {
    const ok = await subscribe();
    if (ok) {
      toast.success('Notifications enabled — you will receive alerts on this device.');
    } else {
      toast.error('Could not enable push notifications. Check browser permissions.');
    }
  };

  // Fixed to the bottom (portaled to <body>) and stacked above the PWA install
  // banner via --pwa-banner-height, rather than pushing page content down from
  // under the header.
  return createPortal(
    <div
      className="fixed left-0 right-0 z-[100] border-t border-blue-200 bg-blue-50/95 backdrop-blur-sm shadow-[0_-4px_20px_rgba(0,0,0,0.1)] dark:border-blue-900 dark:bg-blue-950/90"
      style={{ bottom: 'var(--pwa-banner-height, 0px)' }}
      role="region"
      aria-label="Enable notifications"
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0 text-sm text-blue-900 dark:text-blue-100">
          <Bell className="h-4 w-4 shrink-0" />
          <span className="truncate">
            {message || 'Enable notifications to receive school announcements and attendance alerts on your device.'}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" variant="default" className="h-8" onClick={handleEnable} disabled={loading}>
            {loading ? 'Enabling…' : 'Enable'}
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={dismiss} title="Dismiss">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
