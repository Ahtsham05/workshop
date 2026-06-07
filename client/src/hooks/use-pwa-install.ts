import { useEffect, useState, useCallback } from 'react';

export interface PWAInstallPrompt {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const LEGACY_DISMISS_KEY = 'pwa-install-banner-dismissed-at';

export function isAppInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function isMobileBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  const mobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  return mobileUa || window.innerWidth < 768;
}

export function usePWAInstall() {
  const [installPrompt, setInstallPrompt] = useState<PWAInstallPrompt | null>(null);
  const [isInstalled, setIsInstalled] = useState(() => isAppInstalled());
  const [isInstallable, setIsInstallable] = useState(false);
  const [isMobileWeb, setIsMobileWeb] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_DISMISS_KEY);
    } catch {
      // ignore
    }

    const syncState = () => {
      const installed = isAppInstalled();
      setIsInstalled(installed);
      setIsMobileWeb(isMobileBrowser() && !installed);
      setIsIOS(isIOSDevice());
    };

    syncState();

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as unknown as PWAInstallPrompt);
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setIsMobileWeb(false);
      setInstallPrompt(null);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') syncState();
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('focus', syncState);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('focus', syncState);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const install = useCallback(async () => {
    if (!installPrompt) return false;

    try {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;

      if (outcome === 'accepted') {
        setIsInstalled(true);
        setIsInstallable(false);
        setIsMobileWeb(false);
      }

      setInstallPrompt(null);
      return outcome === 'accepted';
    } catch (error) {
      console.error('Installation failed:', error);
      return false;
    }
  }, [installPrompt]);

  const showInstallBanner = isMobileWeb && !isInstalled;

  return {
    installPrompt,
    isInstalled,
    isInstallable,
    isMobileWeb,
    isIOS,
    showInstallBanner,
    install,
  };
}
