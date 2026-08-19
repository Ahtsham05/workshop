import { Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { VoiceOrb } from './voice-orb'

export function VoiceProcessing({ onStop }: { onStop: () => void }) {
  return (
    <div className='flex h-full flex-col items-center justify-center gap-6 px-6 py-8 text-center'>
      <div>
        <h2 className='text-xl font-semibold'>Analyzing your data…</h2>
        <p className='text-sm text-muted-foreground'>Please wait while I process your request</p>
      </div>

      <VoiceOrb state='processing' />

      <Button variant='outline' onClick={onStop} className='gap-1.5'>
        <Square className='h-3.5 w-3.5 fill-current' />
        Stop
      </Button>
    </div>
  )
}
