import type { ChatAttachment, ChatUploadSignature } from '@/stores/chat.api'

/**
 * Media for team chat, WhatsApp-style: files upload straight from the browser to Cloudinary
 * (real progress, cancellable, big videos never touch our server), and are shown through
 * Cloudinary transformations so a bubble downloads a small thumbnail, not the original.
 */

export type MediaKind = 'image' | 'video' | 'audio' | 'document'

export function mediaKind(mimeType: string | undefined): MediaKind {
  const type = mimeType || ''
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  return 'document'
}

export const isVisual = (a: Pick<ChatAttachment, 'mimeType'>) => {
  const kind = mediaKind(a.mimeType)
  return kind === 'image' || kind === 'video'
}

/** What one message can carry, per kind (Cloudinary's own plan limits still apply). */
export const MAX_BYTES: Record<MediaKind, number> = {
  image: 20 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  audio: 50 * 1024 * 1024,
  document: 25 * 1024 * 1024,
}
export const MAX_FILES = 10

/* ── Cloudinary delivery URLs ────────────────────────────────────────────── */

const CLD = /^https:\/\/res\.cloudinary\.com\/[^/]+\/(image|video)\/upload\//

/** Adds a transformation right after /upload/ (image and video assets only). */
function transform(url: string, transformation: string): string {
  if (!CLD.test(url)) return url
  return url.replace('/upload/', `/upload/${transformation}/`)
}

/** A bubble-sized, auto-format/quality copy of a photo. */
export const imageThumbUrl = (url: string, width = 720) =>
  transform(url, `c_limit,w_${width},q_auto,f_auto`)

/** Full-screen viewer: original size, but still auto format/quality. */
export const imageFullUrl = (url: string) => transform(url, 'q_auto,f_auto')

/** First frame of a video as a JPEG — the poster shown before anyone presses play. */
export function videoPosterUrl(url: string, width = 720): string {
  if (!CLD.test(url)) return ''
  return transform(url, `so_0,c_limit,w_${width},q_auto`).replace(
    /\.[a-z0-9]+(\?.*)?$/i,
    '.jpg'
  )
}

/**
 * A link that downloads instead of opening (Cloudinary's fl_attachment sets
 * Content-Disposition). Raw documents are served as files already.
 */
export function downloadUrl(
  attachment: Pick<ChatAttachment, 'url' | 'name'>
): string {
  const base = (attachment.name || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .slice(0, 60)
  return transform(
    attachment.url,
    base ? `fl_attachment:${base}` : 'fl_attachment'
  )
}

/* ── Local previews ──────────────────────────────────────────────────────── */

// Uploaded URL → the sender's own local copy, so their bubble never flickers or re-downloads
// what they just picked. Lives for the page session.
const localPreview = new Map<string, string>()
export const rememberLocalPreview = (url: string, localUrl: string) =>
  localPreview.set(url, localUrl)
export const localPreviewFor = (url: string | undefined) =>
  url ? localPreview.get(url) : undefined

/* ── Formatting ──────────────────────────────────────────────────────────── */

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return ''
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

export function fileExtension(
  name: string | undefined,
  mimeType?: string
): string {
  const fromName = /\.([a-z0-9]{1,5})$/i.exec(name || '')?.[1]
  if (fromName) return fromName.toUpperCase()
  const sub = (mimeType || '').split('/')[1] || ''
  return (
    sub
      .replace(/^x-|vnd\.[^.]+\./, '')
      .slice(0, 5)
      .toUpperCase() || 'FILE'
  )
}

/* ── Reading a picked file ───────────────────────────────────────────────── */

export interface MediaMeta {
  width: number | null
  height: number | null
  duration: number | null
}

const NO_META: MediaMeta = { width: null, height: null, duration: null }

/** Dimensions / duration of a picked file, so its bubble has the right shape before upload. */
export function readMediaMeta(
  file: File,
  localUrl: string
): Promise<MediaMeta> {
  const kind = mediaKind(file.type)
  return new Promise((resolve) => {
    const done = (meta: MediaMeta) => {
      window.clearTimeout(timer)
      resolve(meta)
    }
    const timer = window.setTimeout(() => resolve(NO_META), 4000)
    if (kind === 'image') {
      const img = new Image()
      img.onload = () =>
        done({
          width: img.naturalWidth || null,
          height: img.naturalHeight || null,
          duration: null,
        })
      img.onerror = () => done(NO_META)
      img.src = localUrl
    } else if (kind === 'video' || kind === 'audio') {
      const el = document.createElement(kind)
      el.preload = 'metadata'
      el.onloadedmetadata = () => {
        const video = el as HTMLVideoElement
        done({
          width: kind === 'video' ? video.videoWidth || null : null,
          height: kind === 'video' ? video.videoHeight || null : null,
          duration: Number.isFinite(el.duration) ? el.duration : null,
        })
      }
      el.onerror = () => done(NO_META)
      el.src = localUrl
    } else {
      done(NO_META)
    }
  })
}

/**
 * WhatsApp sends photos compressed: a 12 MB phone photo becomes a few hundred KB at up to
 * 2560px, which uploads in seconds on a shop's connection. Small files, GIFs (animation) and
 * SVGs are sent as they are.
 */
export async function compressImage(file: File): Promise<File> {
  const MAX_SIDE = 2560
  if (
    !/^image\/(jpeg|png|webp|bmp)$/.test(file.type) ||
    file.size < 1.5 * 1024 * 1024
  )
    return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.fillStyle = '#ffffff' // a transparent PNG must not turn black as a JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85)
    )
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    })
  } catch {
    return file
  }
}

/* ── Upload ──────────────────────────────────────────────────────────────── */

export class UploadCancelled extends Error {
  constructor() {
    super('Upload cancelled')
  }
}

/** One file straight to Cloudinary with progress; resolves to the attachment to send. */
export function uploadToCloudinary(
  file: File,
  signature: ChatUploadSignature,
  meta: MediaMeta,
  {
    onProgress,
    signal,
  }: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {}
): Promise<ChatAttachment> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new UploadCancelled())
    const form = new FormData()
    form.append('file', file)
    form.append('api_key', signature.apiKey)
    form.append('timestamp', String(signature.timestamp))
    form.append('signature', signature.signature)
    form.append('folder', signature.folder)

    const xhr = new XMLHttpRequest()
    xhr.open(
      'POST',
      `https://api.cloudinary.com/v1_1/${signature.cloudName}/auto/upload`
    )
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress?.(Math.min(0.99, event.loaded / event.total))
    }
    xhr.onload = () => {
      let body: Record<string, unknown> = {}
      try {
        body = JSON.parse(xhr.responseText || '{}')
      } catch {
        /* fall through to the error below */
      }
      if (
        xhr.status >= 200 &&
        xhr.status < 300 &&
        typeof body.secure_url === 'string'
      ) {
        onProgress?.(1)
        resolve({
          url: body.secure_url,
          publicId: String(body.public_id || ''),
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          width: (body.width as number) ?? meta.width,
          height: (body.height as number) ?? meta.height,
          duration: (body.duration as number) ?? meta.duration,
        })
      } else {
        const message = (body.error as { message?: string } | undefined)
          ?.message
        reject(
          new Error(
            message
              ? `Upload failed: ${message}`
              : `Upload failed (${xhr.status || 'network'})`
          )
        )
      }
    }
    xhr.onerror = () =>
      reject(new Error('Upload failed — check your connection'))
    xhr.onabort = () => reject(new UploadCancelled())
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(form)
  })
}
