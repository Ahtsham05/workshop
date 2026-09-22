import { formatBusinessFileStamp } from '@/lib/business-timezone'
import { checkMicUsable, connectCleanMic, type CleanMic } from '@/lib/mic-capture'
import { isElectronApp } from '@/lib/sync/electron'

/** Recording chunks live in memory until saved, so a forgotten recording is cut off here. */
export const MAX_RECORDING_SECONDS = 300

const VIDEO_MIME_CANDIDATES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
/** Same containers when a microphone track rides along — name the audio codec so the pick is deterministic. */
const VIDEO_WITH_AUDIO_MIME_CANDIDATES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']

const TRANSFORM_PROPS = ['transform', 'translate', 'rotate', 'scale']

/** Layout/paint state copied from the <svg> onto its replacement <img>, as computed values, so
 * no page CSS (which targets `svg`, not `img`) has to be re-matched. */
const SVG_BOX_PROPS = [
  ...TRANSFORM_PROPS,
  'transform-origin',
  'display',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'flex-shrink',
  'flex-grow',
  'align-self',
  'vertical-align',
  'z-index',
  'opacity',
  'visibility',
]

/** Inherited paint properties an SVG needs once it is a standalone image: nothing from the page's CSS reaches it. */
const SVG_PAINT_PROPS = ['color', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'fill-opacity']

/**
 * html2canvas resets an element's CSS transform before measuring its box — but only for HTML
 * elements, not <svg>. A transformed icon (sidebar chevrons `rotate-90`, the search magnifier's
 * `-translate-y-1/2`, the sun/moon toggle) is therefore measured post-transform and transformed
 * again when painted, so it lands rotated twice or off in a corner. HTML elements are handled
 * correctly, so each such <svg> is swapped for an <img> of the same drawing that carries the transform.
 */
async function swapTransformedSvgsForImages(doc: Document): Promise<void> {
  const view = doc.defaultView
  if (!view) return
  const swaps: HTMLImageElement[] = []

  doc.querySelectorAll('svg').forEach((svg) => {
    if (svg.parentElement?.closest('svg')) return // nested <svg>: the outer one carries it
    try {
      const style = view.getComputedStyle(svg)
      if (!TRANSFORM_PROPS.some((prop) => (style.getPropertyValue(prop) || 'none') !== 'none')) return

      // Untransformed size = the box the icon actually occupies in the layout.
      const saved = TRANSFORM_PROPS.map((prop) => svg.style.getPropertyValue(prop))
      TRANSFORM_PROPS.forEach((prop) => svg.style.setProperty(prop, 'none'))
      const { width, height } = svg.getBoundingClientRect()
      TRANSFORM_PROPS.forEach((prop, i) => svg.style.setProperty(prop, saved[i]))
      if (!width || !height) return

      const standalone = svg.cloneNode(true) as SVGSVGElement
      standalone.removeAttribute('class')
      standalone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      standalone.setAttribute('width', `${width}`)
      standalone.setAttribute('height', `${height}`)
      standalone.setAttribute('style', SVG_PAINT_PROPS.map((prop) => `${prop}:${style.getPropertyValue(prop)}`).join(';'))

      const img = doc.createElement('img')
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(standalone))}`
      SVG_BOX_PROPS.forEach((prop) => img.style.setProperty(prop, style.getPropertyValue(prop)))
      img.style.setProperty('width', `${width}px`)
      img.style.setProperty('height', `${height}px`)
      img.style.setProperty('transition', 'none')
      svg.replaceWith(img)
      swaps.push(img)
    } catch {
      // A drawing we can't convert keeps html2canvas's own (imperfect) rendering; never fail the capture over an icon.
    }
  })

  // html2canvas reads an <img>'s natural size while parsing, so the data URIs must be decoded first.
  await Promise.all(swaps.map((img) => img.decode().catch(() => undefined)))
}

/**
 * Settles the clone html2canvas renders, which differs from the live page in two ways:
 *  - it is a fresh document, so every CSS animation starts over from its first frame — a dialog
 *    that finished opening seconds ago would be photographed half transparent and mis-scaled;
 *  - it cannot blur, so a soft `shadow-lg` comes out as a hard grey frame that reads like an extra
 *    border or padding, which would mislead anyone looking at a bug report for spacing problems.
 */
function settleClone(doc: Document): void {
  const style = doc.createElement('style')
  style.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; box-shadow: none !important; }'
  doc.head.appendChild(style)
}

/**
 * Fallback screenshot: the page is re-drawn from its DOM. Needs no permission and works on any
 * device, but it is a re-creation, not a photo — blur, video, iframes and some CSS come out
 * differently — so it is only used where tab capture doesn't exist. The
 * `data-html2canvas-ignore` attribute is honoured by the library itself; toasts are excluded
 * here so "Capturing screenshot…" never ends up in the image.
 */
async function captureDomScreenshot(): Promise<Blob> {
  // Lets a just-closed menu finish its exit animation before the page is read.
  await new Promise((resolve) => window.setTimeout(resolve, 150))
  // Loaded on demand — the library is large and only needed for this fallback.
  const { default: html2canvas } = await import('html2canvas-pro')
  const canvas = await html2canvas(document.documentElement, {
    scale: Math.min(window.devicePixelRatio || 1, 2),
    useCORS: true,
    logging: false,
    x: window.scrollX,
    y: window.scrollY,
    width: window.innerWidth,
    height: window.innerHeight,
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
    ignoreElements: (el) => el.hasAttribute('data-sonner-toaster'),
    onclone: (clonedDoc) => {
      settleClone(clonedDoc)
      return swapTransformedSvgsForImages(clonedDoc)
    },
  })
  return canvasToPng(canvas)
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

/** True when every sampled pixel is black — some platforms hand back an empty first frame. */
function isBlankFrame(canvas: HTMLCanvasElement): boolean {
  const probe = document.createElement('canvas')
  probe.width = 32
  probe.height = 20
  const ctx = probe.getContext('2d', { willReadFrequently: true })
  if (!ctx) return false
  ctx.drawImage(canvas, 0, 0, probe.width, probe.height)
  const { data } = ctx.getImageData(0, 0, probe.width, probe.height)
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] + data[i + 1] + data[i + 2] > 12) return false
  }
  return true
}

/** Reads one frame from a live capture stream. The <video> has to be in the DOM to receive
 * frames at all; 2px and near-transparent keeps it out of sight (and out of the picture). */
async function readFrame(stream: MediaStream): Promise<HTMLCanvasElement> {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none'
  document.body.appendChild(video)
  try {
    video.srcObject = stream
    await video.play()
    await new Promise<void>((resolve) => {
      if ('requestVideoFrameCallback' in video) video.requestVideoFrameCallback(() => resolve())
      else window.setTimeout(resolve, 300)
    })
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    return canvas
  } finally {
    video.srcObject = null
    video.remove()
  }
}

/**
 * Exact screenshot: the browser hands over what it actually painted for this tab (sidebar,
 * gradients, open dialogs, blur, video, iframes — everything), and one frame of that is kept.
 * The browser asks the person to confirm "share this tab" each time; nothing is recorded or sent.
 * Rejects with the browser's own error if they decline (`NotAllowedError`).
 */
async function captureTabScreenshot(): Promise<Blob> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    // Ask for more than any screen has; the browser caps it at the tab's real pixel size.
    video: { width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 10, max: 15 } },
    audio: false,
    // Chromium hints (ignored elsewhere): offer only "this tab", no window/screen list.
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
    surfaceSwitching: 'exclude',
  } as DisplayMediaStreamOptions)
  try {
    await sleep(200) // the very first composited frame can be stale or empty
    let frame = await readFrame(stream)
    for (let attempt = 0; attempt < 4 && isBlankFrame(frame); attempt++) {
      await sleep(150)
      frame = await readFrame(stream)
    }
    if (isBlankFrame(frame)) throw new Error('Tab capture returned only empty frames')
    return await canvasToPng(frame)
  } finally {
    stream.getTracks().forEach((track) => track.stop())
  }
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the screenshot'))), 'image/png')
  })
}

/** The person dismissed the browser's "share this tab" prompt (or it was blocked for this site). */
export class CaptureCancelledError extends Error {}

export type ScreenshotMethod = 'tab' | 'dom'

/** Take a screenshot with the most accurate method the browser offers.
 * `onDomFallback` fires just before the slower DOM re-drawing starts, so the UI can show progress. */
export async function captureScreenshot(options: { onDomFallback?: () => void } = {}): Promise<{ blob: Blob; method: ScreenshotMethod }> {
  if (canCaptureTab()) {
    try {
      return { blob: await captureTabScreenshot(), method: 'tab' }
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError')) {
        throw new CaptureCancelledError()
      }
      // Anything else (unsupported surface, empty frames…): fall through to the DOM route.
    }
  }
  options.onDomFallback?.()
  return { blob: await captureDomScreenshot(), method: 'dom' }
}

/** Tab/screen capture needs getDisplayMedia (desktop browsers). Phones don't expose it. The
 * Electron desktop app only has it when its main process answers the request (which the preload
 * advertises), so an older desktop build falls back to the DOM route instead of failing. */
export function canCaptureTab(): boolean {
  return (
    (!isElectronApp() || window.electronAPI?.supportsDisplayCapture === true) &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getDisplayMedia === 'function'
  )
}

/** Video additionally needs MediaRecorder. */
export function canRecordScreen(): boolean {
  return canCaptureTab() && typeof MediaRecorder !== 'undefined'
}

export type ScreenRecording = {
  /** Ends the recording. Safe to call more than once. */
  stop: () => void
  /** Settles once the recording ends — by `stop()`, the time limit, or the browser's own "Stop sharing" bar. */
  finished: Promise<Blob>
  /** Present when the recording carries microphone audio: mute it, read its level, see how it was cleaned. */
  mic?: CleanMic
}

/**
 * Rejects with the browser's error if the user dismisses the share picker (`NotAllowedError`), or
 * with `MicUnavailableError` if a microphone was asked for but can't be used (nothing is recorded).
 */
export async function startScreenRecording(options: { mic?: boolean } = {}): Promise<ScreenRecording> {
  const wantsMic = options.mic === true

  // Fail before the share prompt if the mic can never work. If access is already granted, open it
  // now — in parallel with the picker — so the noise suppressor is tuned in by the time we record.
  let micEarly: Promise<CleanMic> | undefined
  if (wantsMic && (await checkMicUsable()) === 'granted') {
    micEarly = connectCleanMic()
    micEarly.catch(() => {}) // surfaced below; this only keeps an early failure from being "unhandled"
  }

  let display: MediaStream
  try {
    display = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30, max: 30 } },
      // Never the tab's own sound: the voice is the only audio, and only when the person switched it on.
      audio: false,
      // Chromium hint (ignored elsewhere): offer "this tab" first instead of a full screen list.
      preferCurrentTab: true,
    } as DisplayMediaStreamOptions)
  } catch (error) {
    ;(await micEarly?.catch(() => undefined))?.stop()
    throw error
  }

  let mic: CleanMic | undefined
  if (wantsMic) {
    try {
      mic = await (micEarly ?? connectCleanMic())
    } catch (error) {
      display.getTracks().forEach((track) => track.stop())
      throw error
    }
  }

  const stream = new MediaStream([...display.getVideoTracks(), ...(mic ? [mic.track] : [])])
  const mimeType = (mic ? VIDEO_WITH_AUDIO_MIME_CANDIDATES : VIDEO_MIME_CANDIDATES).find((mime) =>
    MediaRecorder.isTypeSupported(mime)
  )
  const recorder = new MediaRecorder(stream, {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: 2_500_000,
    ...(mic ? { audioBitsPerSecond: 96_000 } : {}),
  })
  const chunks: Blob[] = []

  const stop = () => {
    if (recorder.state !== 'inactive') recorder.stop()
  }

  const finished = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onerror = () => reject(new Error('Recording failed'))
    recorder.onstop = () => {
      window.clearTimeout(limitTimer)
      display.getTracks().forEach((track) => track.stop())
      mic?.stop()
      if (chunks.length === 0) {
        reject(new Error('Nothing was recorded'))
        return
      }
      resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' }))
    }
  })

  // Clicking the browser's native "Stop sharing" ends the track, not our recorder.
  display.getVideoTracks()[0]?.addEventListener('ended', stop)
  recorder.start(1000)
  const limitTimer = window.setTimeout(stop, MAX_RECORDING_SECONDS * 1000)

  return { stop, finished, mic }
}

/** "screenshot-2026-09-21_15-24-02.png" / "recording-….webm" — Pakistan time, like every other stamp in the app. */
export function buildCaptureFilename(kind: 'image' | 'video', blob: Blob): string {
  const extension = kind === 'image' ? 'png' : blob.type.includes('mp4') ? 'mp4' : 'webm'
  return `${kind === 'image' ? 'screenshot' : 'recording'}-${formatBusinessFileStamp()}.${extension}`
}

export function downloadBlob(url: string, filename: string): void {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
}

export function canCopyImage(): boolean {
  return typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write && window.isSecureContext
}

export async function copyImageToClipboard(blob: Blob): Promise<void> {
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
}

/** Web Share with files — this is how a phone/Windows share sheet hands the capture to WhatsApp. */
export function canShareFile(file: File): boolean {
  return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
}

export async function shareFile(file: File): Promise<void> {
  await navigator.share({ files: [file], title: file.name })
}
