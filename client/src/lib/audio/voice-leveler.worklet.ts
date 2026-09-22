/**
 * Automatic speech leveller, run on the audio thread (main-thread timers are throttled in a
 * hidden tab, which would freeze the gain mid-recording).
 *
 * It sits after the noise suppressor, which leaves speech noticeably quieter. It measures how loud
 * the voice is and eases the gain toward a target — up slowly, down quickly, and only while there
 * is actual speech, so the silence RNNoise leaves between phrases stays silent instead of being
 * boosted back into hiss. A soft limiter catches whatever peaks remain.
 */
import {
  LEVELER_GATE_DBFS,
  LEVELER_MAX_BOOST_DB,
  LEVELER_MAX_CUT_DB,
  LEVELER_TARGET_DBFS,
  VOICE_LEVELER_NAME,
} from './voice-leveler-config'

// The AudioWorkletGlobalScope isn't part of the DOM typings this project compiles against.
declare class AudioWorkletProcessor {
  readonly port: MessagePort
  constructor()
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean
}
declare function registerProcessor(name: string, processor: new () => AudioWorkletProcessor): void
declare const sampleRate: number

const fromDb = (db: number) => 10 ** (db / 20)
const TARGET = fromDb(LEVELER_TARGET_DBFS)
const GATE = fromDb(LEVELER_GATE_DBFS)
const MAX_GAIN = fromDb(LEVELER_MAX_BOOST_DB)
const MIN_GAIN = fromDb(-LEVELER_MAX_CUT_DB)
const LIMIT_KNEE = 0.85

/** Passes |v| up to the knee unchanged, then rounds off smoothly toward 1.0 instead of clipping. */
function softLimit(v: number): number {
  const a = Math.abs(v)
  if (a <= LIMIT_KNEE) return v
  const room = 1 - LIMIT_KNEE
  return Math.sign(v) * (LIMIT_KNEE + room * Math.tanh((a - LIMIT_KNEE) / room))
}

class VoiceLeveler extends AudioWorkletProcessor {
  private level = 0
  private gain = 1

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0]
    const output = outputs[0]?.[0]
    if (!input || !output) return true

    let sum = 0
    for (let i = 0; i < input.length; i++) sum += input[i] * input[i]
    const blockRms = Math.sqrt(sum / input.length)
    const dt = input.length / sampleRate

    // Loudness follower: quick to notice speech starting, slow to forget it across a short pause.
    const follow = 1 - Math.exp(-dt / (blockRms > this.level ? 0.03 : 0.4))
    this.level += (blockRms - this.level) * follow

    if (this.level > GATE) {
      const wanted = Math.min(MAX_GAIN, Math.max(MIN_GAIN, TARGET / this.level))
      const seconds = wanted < this.gain ? 0.06 : 0.8 // loud → duck fast; quiet → lift gently
      this.gain += (wanted - this.gain) * (1 - Math.exp(-dt / seconds))
    }

    for (let i = 0; i < input.length; i++) output[i] = softLimit(input[i] * this.gain)
    return true
  }
}

registerProcessor(VOICE_LEVELER_NAME, VoiceLeveler)
