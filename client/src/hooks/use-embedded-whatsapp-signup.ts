import { useCallback } from 'react'
import { toast } from 'sonner'
import { useStartEmbeddedSignupMutation } from '@/stores/whatsappCloud.api'

declare global {
  interface Window {
    FB?: {
      init: (opts: { appId: string; cookie: boolean; xfbml: boolean; version: string }) => void
      login: (
        cb: (res: { authResponse?: { code?: string } }) => void,
        opts: Record<string, unknown>,
      ) => void
    }
    fbAsyncInit?: () => void
  }
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
            toast.error('WhatsApp signup was cancelled')
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
