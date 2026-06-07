import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { usePWAInstall } from '@/hooks/use-pwa-install';
import toast from 'react-hot-toast';

const BANNER_HEIGHT = '4.25rem';

export function PWAInstallBanner() {
  const {
    showInstallBanner,
    isInstallable,
    isIOS,
    install,
    dismissBanner,
  } = usePWAInstall();
  const [iosHintOpen, setIosHintOpen] = useState(false);
  const [visible, setVisible] = useState(showInstallBanner);

  useEffect(() => {
    setVisible(showInstallBanner);
  }, [showInstallBanner]);

  useEffect(() => {
    if (!visible) {
      document.documentElement.style.removeProperty('--pwa-banner-height');
      return;
    }
    document.documentElement.style.setProperty('--pwa-banner-height', BANNER_HEIGHT);
    return () => {
      document.documentElement.style.removeProperty('--pwa-banner-height');
    };
  }, [visible]);

  if (!visible) return null;

  const handleInstall = async () => {
    if (isInstallable) {
      const ok = await install();
      if (ok) {
        toast.success('App installed! Open it from your home screen.');
        setVisible(false);
      } else {
        toast.error('Installation cancelled. Try again from the banner below.');
      }
      return;
    }

    if (isIOS) {
      setIosHintOpen(true);
      return;
    }

    toast('Open browser menu and choose "Install app" or "Add to home screen".', {
      duration: 5000,
    });
  };

  const handleDismiss = () => {
    dismissBanner();
    setVisible(false);
  };

  return (
    <>
      <div
        className="fixed bottom-0 left-0 right-0 z-[100] border-t border-blue-200 bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-2.5 text-white shadow-[0_-4px_20px_rgba(0,0,0,0.15)] pb-[max(0.625rem,env(safe-area-inset-bottom))]"
        role="region"
        aria-label="Install app"
      >
        <div className="mx-auto flex max-w-lg items-center gap-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">Get the Logix Plus app</p>
            <p className="truncate text-xs text-blue-100/90">Install for quick access from your home screen</p>
          </div>
          <Button
            size="sm"
            onClick={handleInstall}
            className="shrink-0 gap-1.5 bg-white font-semibold text-blue-700 hover:bg-blue-50"
          >
            <Download className="h-4 w-4" />
            Download App
          </Button>
          <button
            type="button"
            onClick={handleDismiss}
            className="shrink-0 rounded-md p-1.5 text-blue-100 hover:bg-white/15 hover:text-white"
            aria-label="Dismiss install banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <Dialog open={iosHintOpen} onOpenChange={setIosHintOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Install on iPhone / iPad</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-1 text-sm text-muted-foreground">
                <p>To add Logix Plus to your home screen:</p>
                <ol className="list-decimal space-y-2 pl-5">
                  <li className="flex items-start gap-2">
                    <span>Tap the <Share className="inline h-4 w-4 shrink-0" /> Share button in Safari</span>
                  </li>
                  <li>Scroll down and tap <strong>Add to Home Screen</strong></li>
                  <li>Tap <strong>Add</strong> in the top-right corner</li>
                </ol>
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
}
