import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { VoiceOrb } from './voice-orb'
import { MicWaveform } from './voice-waveform'
import { VoiceSettingsPanel } from './voice-settings-panel'
import type { useSpeechSynthesis } from '../../hooks/use-speech-synthesis'
import type { VoiceLanguageOption, VoiceLanguageSelection } from '../../lib/voice-languages'

const EXAMPLE_PROMPTS = ['How much profit did I make this month?', 'Show unpaid customers', 'Which products are low in stock?']

export function VoiceListening({
  levels,
  liveTranscript,
  synthesis,
  voiceLanguage,
  voiceLanguageSelection,
  onVoiceLanguageChange,
  onFinish,
  onCancel,
}: {
  levels: number[]
  liveTranscript: string
  synthesis: ReturnType<typeof useSpeechSynthesis>
  voiceLanguage: VoiceLanguageOption
  voiceLanguageSelection: VoiceLanguageSelection
  onVoiceLanguageChange: (code: VoiceLanguageSelection) => void
  onFinish: () => void
  onCancel: () => void
}) {
  const currentLevel = levels[levels.length - 1] ?? 0

  return (
    <div className='flex h-full flex-col items-center justify-center gap-8 px-6 py-8 md:flex-row md:gap-12'>
      <div className='flex flex-col items-center gap-6 text-center'>
        <div>
          <h2 className='text-xl font-semibold'>Listening…</h2>
          <p className='text-sm text-muted-foreground'>Speak naturally, tap the mic when you're done</p>
        </div>

        <VoiceOrb state='listening' level={currentLevel} onClick={onFinish} />

        <MicWaveform levels={levels} />

        <div className='min-h-[3rem] max-w-md px-4'>
          {liveTranscript ? (
            <p className='text-balance text-base text-foreground'>"{liveTranscript}"</p>
          ) : (
            <div className='space-y-2'>
              <p className='text-xs text-muted-foreground'>You can say something like:</p>
              <div className='flex flex-wrap justify-center gap-1.5'>
                {EXAMPLE_PROMPTS.map((p) => (
                  <span key={p} className='rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground'>
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <Button variant='outline' onClick={onCancel} className='gap-1.5'>
          <X className='h-4 w-4' />
          Cancel
        </Button>
      </div>

      <div className='hidden md:block'>
        <VoiceSettingsPanel
          synthesis={synthesis}
          voiceLanguage={voiceLanguage}
          voiceLanguageSelection={voiceLanguageSelection}
          onVoiceLanguageChange={onVoiceLanguageChange}
        />
      </div>
    </div>
  )
}
