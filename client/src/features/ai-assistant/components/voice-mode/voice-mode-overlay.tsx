import { useEffect, useRef } from 'react'
import { VoiceListening } from './voice-listening'
import { VoiceProcessing } from './voice-processing'
import { VoiceSpeaking } from './voice-speaking'
import type { useVoiceMode } from '../../hooks/use-voice-mode'
import type { VoiceLanguageOption, VoiceLanguageSelection } from '../../lib/voice-languages'

const STATE_LABEL: Record<string, string> = {
  listening: 'Voice assistant — listening',
  processing: 'Voice assistant — processing your question',
  speaking: 'Voice assistant — speaking the answer',
}

/** Full-bleed takeover of the chat workspace while voice mode is active — closed state renders nothing. */
export function VoiceModeOverlay({
  voiceMode,
  voiceLanguage,
  voiceLanguageSelection,
  onVoiceLanguageChange,
}: {
  voiceMode: ReturnType<typeof useVoiceMode>
  voiceLanguage: VoiceLanguageOption
  voiceLanguageSelection: VoiceLanguageSelection
  onVoiceLanguageChange: (code: VoiceLanguageSelection) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { isOpen, close } = voiceMode

  // Moves keyboard focus into the overlay the moment it opens (there's no natural first form
  // field to land on — the whole panel is voice-driven) and lets Escape close it, matching
  // standard dialog behavior. Focus naturally returns to the mic button that opened this once
  // the overlay unmounts, since that button is still the last real element in the DOM.
  useEffect(() => {
    if (!isOpen) return undefined
    containerRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, close])

  if (!voiceMode.isOpen) return null

  return (
    <div
      ref={containerRef}
      role='dialog'
      aria-modal='true'
      aria-label={STATE_LABEL[voiceMode.state] || 'Voice assistant'}
      tabIndex={-1}
      className='absolute inset-0 z-30 flex flex-col bg-background/98 backdrop-blur-sm outline-none motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200'
    >
      {/* Screen-reader-only running commentary — sighted users already get this from the
          headings/orb/live transcript text below; this just narrates the same state changes
          for anyone using voice mode non-visually. */}
      <div className='sr-only' aria-live='polite'>
        {voiceMode.state === 'listening' && (voiceMode.liveTranscript || 'Listening…')}
        {voiceMode.state === 'processing' && 'Thinking…'}
        {voiceMode.state === 'speaking' && voiceMode.lastReply?.text}
      </div>

      {voiceMode.state === 'listening' && (
        <VoiceListening
          levels={voiceMode.levels}
          liveTranscript={voiceMode.liveTranscript}
          synthesis={voiceMode.synthesis}
          voiceLanguage={voiceLanguage}
          voiceLanguageSelection={voiceLanguageSelection}
          onVoiceLanguageChange={onVoiceLanguageChange}
          onFinish={voiceMode.finishListening}
          onCancel={voiceMode.close}
        />
      )}
      {voiceMode.state === 'processing' && <VoiceProcessing onStop={voiceMode.close} />}
      {voiceMode.state === 'speaking' && voiceMode.lastReply && (
        <VoiceSpeaking
          reply={voiceMode.lastReply}
          synthesis={voiceMode.synthesis}
          canBargeIn={voiceMode.canBargeIn}
          onAskAnother={voiceMode.askAnother}
          onClose={voiceMode.close}
        />
      )}
    </div>
  )
}
