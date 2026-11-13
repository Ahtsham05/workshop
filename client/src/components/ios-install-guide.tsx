import { useMemo, useState } from 'react';
import { Check, Compass, Copy, Ellipsis, Menu, Share, SquarePlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { getIOSBrowser, isIPad, type IOSBrowser } from '@/hooks/use-pwa-install';

/**
 * iPhone / iPad install guide. iOS has no install prompt (Apple gives web apps no
 * `beforeinstallprompt`), so the user adds the app from the browser's Share menu —
 * this walks them through it for the browser they are actually in, including the
 * WhatsApp / Facebook in-app browsers, which can't install at all.
 */

const APP_NAME = 'Logix Plus';

type Step = { icon: React.ReactNode; text: React.ReactNode };

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-1 rounded-md border bg-muted px-1.5 py-0.5 align-middle text-[0.8125rem] font-semibold text-foreground">
    {children}
  </span>
);

const ShareKey = () => (
  <Kbd>
    <Share className="h-3.5 w-3.5 text-[#007AFF]" /> Share
  </Kbd>
);

const AddKey = () => (
  <Kbd>
    <SquarePlus className="h-3.5 w-3.5" /> Add to Home Screen
  </Kbd>
);

function stepsFor(browser: IOSBrowser, ipad: boolean): Step[] {
  const finish: Step = {
    icon: <Check className="h-4 w-4" />,
    text: (
      <>
        Keep <strong>Open as Web App</strong> on (if shown) and tap <strong>Add</strong>.
      </>
    ),
  };
  const add: Step = {
    icon: <SquarePlus className="h-4 w-4" />,
    text: (
      <>
        Scroll down the list and tap <AddKey />.
      </>
    ),
  };

  switch (browser) {
    case 'chrome':
      return [
        { icon: <Share className="h-4 w-4" />, text: <>Tap <ShareKey /> at the right end of the address bar.</> },
        add,
        finish,
      ];
    case 'edge':
      return [
        { icon: <Ellipsis className="h-4 w-4" />, text: <>Tap the <Kbd><Ellipsis className="h-3.5 w-3.5" /></Kbd> menu, then <ShareKey />.</> },
        add,
        finish,
      ];
    case 'firefox':
      return [
        { icon: <Menu className="h-4 w-4" />, text: <>Tap the <Kbd><Menu className="h-3.5 w-3.5" /></Kbd> menu, then <ShareKey />.</> },
        add,
        finish,
      ];
    default:
      return [
        {
          icon: <Share className="h-4 w-4" />,
          text: ipad ? (
            <>Tap <ShareKey /> at the top right of Safari, next to the address bar.</>
          ) : (
            <>
              Tap <ShareKey /> in Safari's toolbar. On iOS 26, tap <Kbd><Ellipsis className="h-3.5 w-3.5" /></Kbd> first,
              then <strong>Share</strong>.
            </>
          ),
        },
        add,
        finish,
      ];
  }
}

function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="space-y-2.5">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-3 rounded-xl border bg-card p-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
            {i + 1}
          </span>
          <p className="pt-0.5 text-sm leading-relaxed text-foreground">{s.text}</p>
        </li>
      ))}
    </ol>
  );
}

/** The guide's body — used inside the dialog and on the public /install page. */
export function IOSInstallSteps() {
  const browser = useMemo(getIOSBrowser, []);
  const ipad = useMemo(isIPad, []);
  const [copied, setCopied] = useState(false);
  const installUrl = `${window.location.origin}/install`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(installUrl);
      setCopied(true);
      toast.success('Link copied — paste it in Safari');
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast(installUrl, { duration: 8000 });
    }
  };

  if (browser === 'in-app') {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
          This page is open inside another app (like WhatsApp). Apps can only be installed from <strong>Safari</strong>.
        </div>
        <StepList
          steps={[
            {
              icon: <Compass className="h-4 w-4" />,
              text: (
                <>
                  Tap <Kbd><Ellipsis className="h-3.5 w-3.5" /></Kbd> or <Kbd><Compass className="h-3.5 w-3.5 text-[#007AFF]" /></Kbd> and
                  choose <strong>Open in Safari</strong> — or copy the link below and paste it in Safari.
                </>
              ),
            },
            { icon: <Share className="h-4 w-4" />, text: <>In Safari, tap <ShareKey />, then <AddKey />.</> },
          ]}
        />
        <Button variant="outline" className="h-11 w-full gap-2" onClick={copyLink}>
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy link for Safari'}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <StepList steps={stepsFor(browser, ipad)} />
      <p className="rounded-xl bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
        Then open <strong className="text-foreground">{APP_NAME}</strong> from your Home Screen. It runs full-screen like a
        normal app. Sign in once inside the app (iPhone keeps it separate from Safari).
      </p>
    </div>
  );
}

function GuideHeading() {
  return (
    <div className="flex items-center gap-3 text-left">
      <img
        src="/images/apple-touch-icon.png"
        alt=""
        className="h-14 w-14 shrink-0 rounded-[22%] border shadow-sm"
      />
      <div className="min-w-0">
        <p className="text-base font-semibold leading-tight text-foreground">Install {APP_NAME}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Free · No App Store needed · 10 seconds</p>
      </div>
    </div>
  );
}

/** iPhone → bottom sheet (like iOS's own share sheet); iPad → centred dialog. */
export function IOSInstallGuideDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const ipad = useMemo(isIPad, []);

  if (ipad) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle asChild>
              <div><GuideHeading /></div>
            </DialogTitle>
            <DialogDescription className="sr-only">How to add {APP_NAME} to your iPad Home Screen</DialogDescription>
          </DialogHeader>
          {open && <IOSInstallSteps />}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        // No focus ring on the ✕ the moment it slides up.
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="max-h-[90svh] gap-2 overflow-y-auto rounded-t-2xl px-4 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-muted-foreground/25" />
        <SheetHeader className="p-0 pb-3">
          <SheetTitle asChild>
            <div><GuideHeading /></div>
          </SheetTitle>
          <SheetDescription className="sr-only">How to add {APP_NAME} to your iPhone Home Screen</SheetDescription>
        </SheetHeader>
        {open && <IOSInstallSteps />}
      </SheetContent>
    </Sheet>
  );
}
