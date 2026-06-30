import { useCallback } from 'react'
import { toast } from 'sonner'
import { useStartEmbeddedSignupMutation } from '@/stores/whatsappCloud.api'

declare global {
  interface Window {
    FB?: {
      init: (opts: { appId: string; cookie: boolean; xfbml: boolean; version: string }) => void
      login: (
        cb: (res: { authResponse?: { code?: string }; status?: 'connected' | 'not_authorized' | 'unknown' }) => void,
        opts: Record<string, unknown>,
      ) => void
    }
    fbAsyncInit?: () => void
  }
}

/**
 * The FB JS SDK callback never carries Meta's actual error text (e.g. the
 * "Feature Unavailable" dialog Meta shows for incomplete app settings) —
 * it just closes with no code. `status` is the only signal we get, so map
 * it to a message that points at the likely cause instead of always saying
 * "cancelled".
 */
function describeLoginFailure(status?: 'connected' | 'not_authorized' | 'unknown'): string {
  if (status === 'not_authorized') {
    return 'WhatsApp permissions were not granted. Please accept the requested permissions to connect.'
  }
  return (
    'WhatsApp signup did not complete. If a Facebook dialog showed "Feature Unavailable" or a similar error, ' +
    'the Meta App is missing required settings (Privacy Policy URL, Terms of Service URL, App Icon, Category, ' +
    'or Data Deletion URL) — check developers.facebook.com → your app → Settings → Basic.'
  )
}

function loadFacebookSdk(appId: string): Promise<void> {
  if (window.FB) return Promise.resolve()
  return new Promise((resolve) => {
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, cookie: true, xfbml: true, version: 'v21.0' })
      resolve()
    }
    if (!document.getElementById('facebook-jssdk')) {
      const script = document.createElement('script')
      script.id = 'facebook-jssdk'
      script.src = 'https://connect.facebook.net/en_US/sdk.js'
      script.async = true
      script.defer = true
      document.body.appendChild(script)
    }
  })
}

export function useEmbeddedWhatsAppSignup() {
  const [startSignup, { isLoading }] = useStartEmbeddedSignupMutation()

  const connect = useCallback(async () => {
    try {
      const payload = await startSignup().unwrap()
      await loadFacebookSdk(payload.appId)
      window.FB?.login(
        (response) => {
          if (response.authResponse?.code) {
            window.location.href = `${payload.redirectUri}?code=${response.authResponse.code}&state=${payload.state}`
          } else {
            toast.error(describeLoginFailure(response.status))
          }
        },
        {
          config_id: payload.configId,
          response_type: 'code',
          override_default_response_type: true,
          extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding' },
        },
      )
    } catch (err: unknown) {
      const e = err as { data?: { message?: string } }
      toast.error(e.data?.message || 'Failed to start Meta Embedded Signup')
    }
  }, [startSignup])

  return { connect, isLoading }
}
