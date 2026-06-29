import { X } from 'lucide-react'

function formatTimer(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function RecordingBar({ elapsedSeconds, onCancel }: { elapsedSeconds: number; onCancel: () => void }) {
  return (
    <div className='flex flex-1 items-center gap-3 px-2 py-1.5'>
      <span className='relative flex h-2.5 w-2.5'>
        <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75' />
        <span className='relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500' />
      </span>
      <span className='text-sm font-medium tabular-nums'>{formatTimer(elapsedSeconds)}</span>
      <span className='ml-auto text-xs text-muted-foreground'>Listening… release to send</span>
      <button
        type='button'
        onClick={onCancel}
        className='shrink-0 rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
        title='Cancel recording'
      >
        <X className='h-4 w-4' />
      </button>
    </div>
  )
}
