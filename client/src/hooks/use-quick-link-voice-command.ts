import { useCallback } from 'react'
import toast from 'react-hot-toast'
import { useNavigate } from '@tanstack/react-router'
import { useVoiceInput } from '@/hooks/use-voice-input'
import { useLanguage } from '@/context/language-context'
import { matchVoiceCommand } from '@/lib/quick-link-voice-match'
import type { QuickLinkAction } from '@/stores/quickLinks.api'

/**
 * "Open stock transfer" style voice navigation for Quick Links. Reuses the same
 * useVoiceInput hook (Web Speech API wrapper) already powering dictation on invoice
 * forms — no new speech-recognition plumbing — and matches against the exact action
 * list the Quick Links panel itself pins from, so nothing needs a separate command
 * list to stay in sync. Shared by the dashboard's Quick Links panel and the global
 * floating voice widget (components/quick-links-voice-widget.tsx).
 */
export function useQuickLinkVoiceCommand(actions: QuickLinkAction[], options?: { onNavigate?: () => void }) {
  const navigate = useNavigate()
  const { t } = useLanguage()

  const handleResult = useCallback(
    (transcript: string) => {
      const match = matchVoiceCommand(transcript, actions)
      if (!match) {
        toast.error(`${t('No matching quick link for')} "${transcript}"`)
        return
      }
      toast.success(`${t('Opening')} ${match.action.label}`)
      options?.onNavigate?.()
      navigate({ to: match.action.route, search: match.action.routeSearch })
    },
    [actions, navigate, t, options],
  )

  const { isListening, isSupported, startListening, stopListening } = useVoiceInput({
    onResult: handleResult,
    onError: (error) => toast.error(error),
  })

  return { isListening, isSupported, startListening, stopListening }
}
