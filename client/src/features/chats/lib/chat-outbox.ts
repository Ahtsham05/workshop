import { useSyncExternalStore } from 'react'
import type { ChatMessage, SendChatMessageArgs } from '@/stores/chat.api'

/**
 * Messages typed but not yet confirmed by the server. They live outside the RTK Query
 * cache on purpose: a refetch (reconnect, polling fallback) replaces the cached page
 * wholesale, and an optimistic bubble must survive that until its own request settles.
 * A failed one stays here, marked, until the person retries or discards it.
 */

export interface OutboxEntry {
  args: SendChatMessageArgs
  message: ChatMessage
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
