import { VoiceListening } from './voice-listening'
import { VoiceProcessing } from './voice-processing'
import { VoiceSpeaking } from './voice-speaking'
import type { useVoiceMode } from '../../hooks/use-voice-mode'
import type { VoiceLanguageOption, VoiceLanguageSelection } from '../../lib/voice-languages'

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
  if (!voiceMode.isOpen) return null

  return (
    <div className='absolute inset-0 z-30 flex flex-col bg-background/98 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200'>
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
          onAskAnother={voiceMode.askAnother}
          onClose={voiceMode.close}
        />
      )}
    </div>
  )
}
