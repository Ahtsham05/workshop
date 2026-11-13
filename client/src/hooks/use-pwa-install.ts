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
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
  // iPadOS 13+ Safari asks for the desktop site and reports itself as a Mac —
  // only the touch screen gives it away.
  return /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
}

export function isIPad(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

/**
 * Which iOS browser the page is open in — the "Add to Home Screen" steps differ.
 * `in-app` = WhatsApp / Facebook / Instagram / etc. web views, which cannot install
 * at all; the user has to open the link in Safari first.
 */
export type IOSBrowser = 'safari' | 'chrome' | 'edge' | 'firefox' | 'in-app' | 'other';

export function getIOSBrowser(): IOSBrowser {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|Line\/|Snapchat|TikTok|musical_ly|WhatsApp|Twitter|MicroMessenger|GSA\//i.test(ua)) {
    return 'in-app';
  }
  if (/CriOS/.test(ua)) return 'chrome';
  if (/EdgiOS/.test(ua)) return 'edge';
  if (/FxiOS/.test(ua)) return 'firefox';
  // Real Safari has "Safari/" and a "Version/" token; WKWebView-based in-app browsers lack one.
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return 'safari';
  return 'in-app';
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
