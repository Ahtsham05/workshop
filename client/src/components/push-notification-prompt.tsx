import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { toast } from 'sonner';

export function PushNotificationPrompt() {
  const { supported, subscribed, loading, dismissed, subscribe, dismiss } = usePushNotifications();

  if (!supported || subscribed || dismissed) return null;

  const handleEnable = async () => {
    const ok = await subscribe();
    if (ok) {
      toast.success('Notifications enabled — you will receive alerts on this device.');
    } else {
      toast.error('Could not enable push notifications. Check browser permissions.');
    }
  };

  return (
    <div className="border-b bg-blue-50/80 dark:bg-blue-950/30">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0 text-sm text-blue-900 dark:text-blue-100">
          <Bell className="h-4 w-4 shrink-0" />
          <span className="truncate">
            Enable notifications to receive school announcements and attendance alerts on your device.
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
    </div>
  );
}
