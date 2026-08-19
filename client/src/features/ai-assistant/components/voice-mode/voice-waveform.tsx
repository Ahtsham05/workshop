/** Real mic-amplitude bars — same data source as the old inline recording bar, at overlay scale. */
export function MicWaveform({ levels }: { levels: number[] }) {
  return (
    <div className='flex h-12 items-center justify-center gap-[3px]'>
      {levels.map((level, i) => (
        <span
          key={i}
          className='w-[3px] shrink-0 rounded-full bg-primary/70 transition-[height] duration-75 ease-out'
          style={{ height: `${Math.max(8, Math.round(level * 100))}%` }}
        />
      ))}
    </div>
  )
}

const SPEAKING_BAR_COUNT = 24

/** No real TTS amplitude is available from SpeechSynthesis, so this is a decorative — not
 *  data-driven — equalizer loop, purely to signal "audio is playing" while speaking. */
export function SpeakingWaveform() {
  return (
    <div className='flex h-12 items-center justify-center gap-[3px]'>
      {Array.from({ length: SPEAKING_BAR_COUNT }).map((_, i) => (
        <span
          key={i}
          className='w-[3px] shrink-0 rounded-full bg-violet-500/70 motion-safe:animate-pulse'
          style={{
            height: '40%',
            animationDuration: `${600 + (i % 5) * 120}ms`,
            animationDelay: `${(i % 7) * 80}ms`,
          }}
        />
      ))}
    </div>
  )
}
