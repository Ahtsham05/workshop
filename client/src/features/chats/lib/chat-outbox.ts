import { useSyncExternalStore } from 'react'
import type { ChatAttachment, ChatMessage, SendChatMessageArgs } from '@/stores/chat.api'
import type { MediaMeta } from './chat-media'

/**
 * Messages typed but not yet confirmed by the server. They live outside the RTK Query
 * cache on purpose: a refetch (reconnect, polling fallback) replaces the cached page
 * wholesale, and an optimistic bubble must survive that until its own request settles.
 * A failed one stays here, marked, until the person retries or discards it.
 */

/** A picked file still on its way to Cloudinary (kept so a failed send can retry it). */
export interface OutboxUpload {
  file: File
  meta: MediaMeta
  localUrl: string
  progress: number
  attachment?: ChatAttachment
  /** Recorded voice note (its waveform travels with the attachment). */
  voice?: { waveform: number[] }
}

export interface OutboxEntry {
  args: SendChatMessageArgs
  message: ChatMessage
  uploads?: OutboxUpload[]
}

/** The bubble's view of an upload: the local preview, its shape, and how far it has got. */
export function attachmentFromUpload(upload: OutboxUpload): ChatAttachment {
  return {
    url: upload.attachment?.url ?? '',
    publicId: upload.attachment?.publicId,
    name: upload.file.name,
    mimeType: upload.file.type || 'application/octet-stream',
    size: upload.file.size,
    width: upload.attachment?.width ?? upload.meta.width,
    height: upload.attachment?.height ?? upload.meta.height,
    duration: upload.attachment?.duration ?? upload.meta.duration,
    localUrl: upload.localUrl,
    progress: upload.attachment ? 1 : upload.progress,
    ...(upload.voice ? { voice: true, waveform: upload.voice.waveform } : {}),
  }
}

/** Progress / completion of one file of a pending message. */
export function updateOutboxUpload(clientId: string, index: number, patch: Partial<Pick<OutboxUpload, 'progress' | 'attachment'>>) {
  let changed = false
  entries = entries.map((e) => {
    if (e.args.clientId !== clientId || !e.uploads?.[index]) return e
    changed = true
    const uploads = e.uploads.map((u, i) => (i === index ? { ...u, ...patch } : u))
    return { ...e, uploads, message: { ...e.message, attachments: uploads.map(attachmentFromUpload) } }
  })
  if (changed) emit()
}

let entries: OutboxEntry[] = []
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function addToOutbox(entry: OutboxEntry) {
  entries = [...entries, entry]
  emit()
}

export function markOutboxFailed(clientId: string, failed: boolean) {
  entries = entries.map((e) =>
    e.args.clientId === clientId ? { ...e, message: { ...e.message, failed, pending: !failed } } : e
  )
  emit()
}

export function removeFromOutbox(clientId: string) {
  const next = entries.filter((e) => e.args.clientId !== clientId)
  if (next.length !== entries.length) {
    entries = next
    emit()
  }
}

export function getOutboxEntry(clientId: string) {
  return entries.find((e) => e.args.clientId === clientId)
}

export function clearOutbox() {
  entries = []
  emit()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const snapshot = () => entries

export function useOutbox(conversationId: string | null): ChatMessage[] {
  const all = useSyncExternalStore(subscribe, snapshot, snapshot)
  return conversationId ? all.filter((e) => e.args.conversationId === conversationId).map((e) => e.message) : []
}
