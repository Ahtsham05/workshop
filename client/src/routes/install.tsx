import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Check, CheckCircle2, Copy, Download, EllipsisVertical, MonitorDown, Smartphone } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { IOSInstallSteps } from '@/components/ios-install-guide'
import { isMobileBrowser, usePWAInstall } from '@/hooks/use-pwa-install'

/**
 * Public "get the app" page — one link (https://<app>/install) a business can send its
 * staff on WhatsApp. Shows the right steps for the device it is opened on: Safari's
 * Add to Home Screen on iPhone/iPad, the one-tap install prompt on Android/desktop Chrome.
 */
export const Route = createFileRoute('/install')({
  component: InstallPage,
})

function Card({ children }: { children: React.ReactNode }) {
  return <div className='rounded-2xl border bg-card p-4 shadow-sm sm:p-5'>{children}</div>
}

function InstallPage() {
  const { isInstalled, isInstallable, isIOS, install } = usePWAInstall()
  const [copied, setCopied] = useState(false)
  const mobile = isMobileBrowser()
  const installUrl = `${window.location.origin}/install`

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(installUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      toast(installUrl, { duration: 8000 })
    }
  }

  const promptInstall = async () => {
    if (await install()) toast.success('Installed! Open Logix Plus from your home screen.')
  }

  let body: React.ReactNode
  if (isInstalled) {
    body = (
      <Card>
        <div className='flex flex-col items-center gap-3 py-2 text-center'>
          <CheckCircle2 className='h-10 w-10 text-emerald-600' />
          <p className='font-semibold'>Logix Plus is installed</p>
          <Button asChild className='h-11 w-full'>
            <Link to='/'>Open the app</Link>
          </Button>
        </div>
      </Card>
    )
  } else if (isIOS) {
    body = (
      <Card>
        <IOSInstallSteps />
      </Card>
    )
  } else if (isInstallable) {
    body = (
      <Card>
        <Button onClick={promptInstall} className='h-12 w-full gap-2 text-base font-semibold'>
          <Download className='h-5 w-5' /> Install app
        </Button>
        <p className='mt-3 text-center text-xs text-muted-foreground'>
          Adds Logix Plus to your {mobile ? 'home screen' : 'desktop and Start menu'} — opens in its own window.
        </p>
      </Card>
    )
  } else if (mobile) {
    body = (
      <Card>
        <ol className='space-y-2.5 text-sm'>
          <li className='flex gap-3'>
            <Step n={1} />
            <span className='pt-0.5'>
              Open this page in <strong>Chrome</strong>, then tap the{' '}
              <EllipsisVertical className='inline h-4 w-4 align-text-bottom' /> menu at the top right.
            </span>
          </li>
          <li className='flex gap-3'>
            <Step n={2} />
            <span className='pt-0.5'>
              Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>), then <strong>Install</strong>.
            </span>
          </li>
        </ol>
      </Card>
    )
  } else {
    body = (
      <Card>
        <div className='flex items-start gap-3 text-sm'>
          <MonitorDown className='mt-0.5 h-5 w-5 shrink-0 text-primary' />
          <p>
            In <strong>Chrome</strong> or <strong>Edge</strong>, click the install icon at the right end of the address
            bar, then <strong>Install</strong>.
          </p>
        </div>
      </Card>
    )
  }

  return (
    <div className='min-h-svh bg-muted/40 px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]'>
      <div className='mx-auto flex max-w-md flex-col gap-5'>
        <div className='flex flex-col items-center gap-3 pt-4 text-center'>
          <img
            src='/images/apple-touch-icon.png'
            alt='Logix Plus'
            className='h-20 w-20 rounded-[22%] border bg-white shadow-md'
          />
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>Get the Logix Plus app</h1>
            <p className='mt-1 text-sm text-muted-foreground'>
              Billing, stock and accounts on your phone. Free, no App Store needed.
            </p>
          </div>
        </div>

        {body}

        {!mobile && !isIOS && (
          <Card>
            <div className='flex items-start gap-3 text-sm'>
              <Smartphone className='mt-0.5 h-5 w-5 shrink-0 text-primary' />
              <div className='min-w-0 flex-1'>
                <p>On your phone, open this link:</p>
                <p className='mt-1 truncate font-mono text-xs text-muted-foreground'>{installUrl}</p>
              </div>
              <Button variant='outline' size='sm' className='shrink-0 gap-1.5' onClick={copyLink}>
                {copied ? <Check className='h-4 w-4 text-emerald-600' /> : <Copy className='h-4 w-4' />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </Card>
        )}

        {!isInstalled && (
          <Link to='/' className='text-center text-sm text-muted-foreground underline-offset-4 hover:underline'>
            Continue in the browser
          </Link>
        )}
      </div>
    </div>
  )
}

function Step({ n }: { n: number }) {
  return (
    <span className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground'>
      {n}
    </span>
  )
}
