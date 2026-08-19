import { Mic, MessageSquareText, Pause, Play, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { VoiceOrb } from './voice-orb'
import { SpeakingWaveform } from './voice-waveform'
import { BusinessResponse } from '../business-responses/business-response'
import type { VoiceReply } from '../../hooks/use-voice-mode'
import type { useSpeechSynthesis } from '../../hooks/use-speech-synthesis'

export function VoiceSpeaking({
  reply,
  synthesis,
  onAskAnother,
  onClose,
}: {
  reply: VoiceReply
  synthesis: ReturnType<typeof useSpeechSynthesis>
  onAskAnother: () => void
  onClose: () => void
}) {
  return (
    <div className='flex h-full flex-col items-center justify-center gap-6 px-6 py-8 text-center'>
      <h2 className='text-xl font-semibold'>{synthesis.isSpeaking ? 'Speaking…' : 'Here’s what I found'}</h2>

      <VoiceOrb state='speaking' />
      {synthesis.isSpeaking && <SpeakingWaveform />}

      <ScrollArea className='max-h-56 w-full max-w-md'>
        <div className='flex flex-col items-center gap-2 px-2'>
          <p className='text-balance text-sm text-foreground'>{reply.text}</p>
          <BusinessResponse toolCalls={reply.toolCalls} />
        </div>
      </ScrollArea>

      {synthesis.isSpeaking && (
        <div className='flex items-center gap-2'>
          <Button variant='outline' size='sm' onClick={synthesis.togglePause} className='gap-1.5'>
            {synthesis.isPaused ? <Play className='h-3.5 w-3.5' /> : <Pause className='h-3.5 w-3.5' />}
            {synthesis.isPaused ? 'Resume' : 'Pause'}
          </Button>
          <Button variant='outline' size='sm' onClick={synthesis.cancel} className='gap-1.5'>
            <VolumeX className='h-3.5 w-3.5' />
            Stop speaking
          </Button>
        </div>
      )}

      <div className='flex flex-wrap items-center justify-center gap-2'>
        <Button onClick={onAskAnother} className='gap-1.5'>
          <Mic className='h-4 w-4' />
          Ask Another
        </Button>
        <Button variant='outline' onClick={onClose} className='gap-1.5'>
          <MessageSquareText className='h-4 w-4' />
          Done — Back to Chat
        </Button>
      </div>
    </div>
  )
}
