/** Web Audio API beep feedback — no external audio asset needed. */

let sharedCtx: AudioContext | null = null

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!sharedCtx || sharedCtx.state === 'closed') sharedCtx = new Ctor()
  if (sharedCtx.state === 'suspended') void sharedCtx.resume()
  return sharedCtx
}

function tone(ctx: AudioContext, freq: number, startAt: number, duration: number, gainPeak: number) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0, startAt)
  gain.gain.linearRampToValueAtTime(gainPeak, startAt + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(startAt)
  osc.stop(startAt + duration + 0.02)
}

export function playBeep(kind: 'success' | 'error') {
  const ctx = getContext()
  if (!ctx) return
  const now = ctx.currentTime
  if (kind === 'success') {
    tone(ctx, 1046.5, now, 0.09, 0.18)
  } else {
    tone(ctx, 220, now, 0.14, 0.2)
    tone(ctx, 180, now + 0.15, 0.16, 0.2)
  }
}
