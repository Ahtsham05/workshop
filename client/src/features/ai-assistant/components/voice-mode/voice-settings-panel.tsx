import { Settings2, Sparkles, TriangleAlert } from 'lucide-react'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectSeparator } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { VOICE_LANGUAGES, type VoiceLanguageOption, type VoiceLanguageSelection } from '../../lib/voice-languages'
import type { useSpeechSynthesis } from '../../hooks/use-speech-synthesis'

export function VoiceSettingsPanel({
  synthesis,
  voiceLanguage,
  voiceLanguageSelection,
  onVoiceLanguageChange,
}: {
  synthesis: ReturnType<typeof useSpeechSynthesis>
  voiceLanguage: VoiceLanguageOption
  voiceLanguageSelection: VoiceLanguageSelection
  onVoiceLanguageChange: (code: VoiceLanguageSelection) => void
}) {
  const isAuto = voiceLanguageSelection === 'auto'

  return (
    <div className='w-full max-w-[220px] space-y-4 rounded-2xl border bg-background/60 p-4 backdrop-blur'>
      <p className='flex items-center gap-1.5 text-xs font-semibold text-muted-foreground'>
        <Settings2 className='h-3.5 w-3.5' />
        Voice Settings
      </p>

      <div className='space-y-1.5'>
        <Label className='text-xs text-muted-foreground'>Language</Label>
        <Select value={voiceLanguageSelection} onValueChange={(v) => onVoiceLanguageChange(v as VoiceLanguageSelection)}>
          <SelectTrigger className='h-8 text-xs'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='auto'>
              <Sparkles className='h-3.5 w-3.5' /> Auto detect
            </SelectItem>
            <SelectSeparator />
            {VOICE_LANGUAGES.map((lang) => (
              <SelectItem key={lang.code} value={lang.code}>
                {lang.flag} {lang.nativeLabel}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className='text-[10px] leading-snug text-muted-foreground/70'>
          {isAuto
            ? 'Listens for any of the supported languages and replies in a matching voice — no need to pick one.'
            : 'Pinned to one language for both listening and replies — separate from your app display language.'}
        </p>
      </div>

      {synthesis.isSupported && (
        <div className='flex items-center justify-between gap-2'>
          <Label htmlFor='voice-feedback' className='text-xs text-muted-foreground'>
            Voice feedback
          </Label>
          <Switch id='voice-feedback' checked={synthesis.feedbackEnabled} onCheckedChange={synthesis.setFeedbackEnabled} />
        </div>
      )}

      {synthesis.isSupported && synthesis.feedbackEnabled && !isAuto && !synthesis.hasVoiceForLanguage && (
        <p className='flex items-start gap-1.5 text-[10px] leading-snug text-amber-600 dark:text-amber-400'>
          <TriangleAlert className='mt-0.5 h-3 w-3 shrink-0' />
          No {voiceLanguage.label} voice is installed on this device, so replies won't be spoken in this language.
        </p>
      )}

      {synthesis.isSupported && synthesis.feedbackEnabled && isAuto && (
        <VoiceCoverageWarning synthesis={synthesis} />
      )}
    </div>
  )
}

/** In auto mode the spoken language varies per reply, so instead of one static warning this
 *  checks coverage across all supported languages up front and only speaks up about gaps. */
function VoiceCoverageWarning({ synthesis }: { synthesis: ReturnType<typeof useSpeechSynthesis> }) {
  const missing = VOICE_LANGUAGES.filter((lang) => !synthesis.hasVoiceForLang(lang.bcp47))
  if (missing.length === 0) return null

  return (
    <p className='flex items-start gap-1.5 text-[10px] leading-snug text-amber-600 dark:text-amber-400'>
      <TriangleAlert className='mt-0.5 h-3 w-3 shrink-0' />
      No voice installed for {missing.map((l) => l.label).join(', ')} — replies in{' '}
      {missing.length === 1 ? 'that language' : 'those languages'} will show as text only.
    </p>
  )
}
