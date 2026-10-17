import { useSyncExternalStore } from 'react'
import type { ChatMessageStatus } from '@/stores/chat.api'

/**
 * Live, non-persisted chat state shared by the provider (which owns the socket) and the
 * UI: connection status, who is online, who is typing where, and which conversation is
 * on screen right now (so its messages are marked read instead of counted as unread).
 */

export interface TypingPerson {
  userId: string
  name: string
  until: number
}

interface ChatLiveState {
  connected: boolean
  /** True once the first connection attempt has either succeeded or clearly failed. */
  settled: boolean
  online: Set<string>
  /** userId → when they went offline, from live presence (fresher than any fetched value). */
  lastSeen: Record<string, string>
  typing: Record<string, TypingPerson[]>
  activeConversationId: string | null
}

let state: ChatLiveState = { connected: false, settled: false, online: new Set(), lastSeen: {}, typing: {}, activeConversationId: null }
const listeners = new Set<() => void>()

export function setChatLive(patch: Partial<ChatLiveState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export const getChatLive = () => state

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useChatLive(): ChatLiveState {
  return useSyncExternalStore(subscribe, getChatLive, getChatLive)
}

export function setOnline(userId: string, online: boolean, lastSeenAt?: string | null) {
  const next = new Set(state.online)
  if (online) next.add(userId)
  else next.delete(userId)
  setChatLive({ online: next, ...(lastSeenAt ? { lastSeen: { ...state.lastSeen, [userId]: lastSeenAt } } : {}) })
}

/* ── Newest-message status (conversation list ticks) ─────────────────────── */

const STATUS_RANK: Record<ChatMessageStatus, number> = { failed: 0, pending: 0, sent: 1, delivered: 2, read: 3 }

/** Ticks only ever move forward for the same message. */
export function laterStatus(a: ChatMessageStatus | null | undefined, b: ChatMessageStatus | null | undefined) {
  if (!a) return b ?? null
  if (!b) return a
  return STATUS_RANK[b] > STATUS_RANK[a] ? b : a
}

/**
 * The latest receipt per conversation, keyed by the message it was about. A receipt can
 * beat the sender's own POST response (the recipient's ack is that fast on a LAN), so it is
 * kept here and applied whenever that message lands in the list, in whichever order.
 */
const receiptStatus = new Map<string, { at: number; status: ChatMessageStatus }>()

export function noteReceiptStatus(conversationId: string, at: string, status: ChatMessageStatus) {
  const time = new Date(at).getTime()
  const prev = receiptStatus.get(conversationId)
  if (prev && prev.at > time) return
  receiptStatus.set(conversationId, { at: time, status: prev && prev.at === time ? laterStatus(prev.status, status)! : status })
}

export function receiptStatusFor(conversationId: string, at: string): ChatMessageStatus | null {
  const entry = receiptStatus.get(conversationId)
  return entry && entry.at === new Date(at).getTime() ? entry.status : null
}

const TYPING_TTL = 4500

export function setTyping(conversationId: string, person: { userId: string; name: string }, stopped: boolean) {
  const now = Date.now()
  const current = (state.typing[conversationId] || []).filter((p) => p.userId !== person.userId && p.until > now)
  const next = stopped ? current : [...current, { ...person, until: now + TYPING_TTL }]
  setChatLive({ typing: { ...state.typing, [conversationId]: next } })
}

/** Clears typing entries that ran out (the sender closed the tab mid-sentence). */
export function sweepTyping() {
  const now = Date.now()
  let changed = false
  const next: Record<string, TypingPerson[]> = {}
  Object.entries(state.typing).forEach(([id, people]) => {
    const alive = people.filter((p) => p.until > now)
    if (alive.length !== people.length) changed = true
    if (alive.length) next[id] = alive
  })
  if (changed) setChatLive({ typing: next })
}

export function setActiveConversation(id: string | null) {
  if (state.activeConversationId !== id) setChatLive({ activeConversationId: id })
}

/* ── Outgoing typing pings (set by the provider once the socket exists) ───── */

let typingEmitter: ((conversationId: string, stopped: boolean) => void) | null = null
export function registerTypingEmitter(fn: typeof typingEmitter) {
  typingEmitter = fn
}
export function emitTyping(conversationId: string, stopped = false) {
  typingEmitter?.(conversationId, stopped)
}

/* ── Sound preference ────────────────────────────────────────────────────── */

const SOUND_KEY = 'chat-sound-v1'
export function readChatSound(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off'
  } catch {
    return true
  }
}
export function writeChatSound(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off')
  } catch {
    /* ignore */
  }
}

/** A soft two-note chime — Web Audio, no asset to load. */
let audio: AudioContext | null = null
export function playChatChime() {
  if (!readChatSound()) return
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    if (!audio || audio.state === 'closed') audio = new Ctor()
    if (audio.state === 'suspended') void audio.resume()
    const ctx = audio
    const note = (freq: number, at: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, at)
      gain.gain.linearRampToValueAtTime(0.08, at + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.25)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(at)
      osc.stop(at + 0.3)
    }
    note(880, ctx.currentTime)
    note(1320, ctx.currentTime + 0.12)
  } catch {
    /* audio blocked until the first user gesture — silently skip */
  }
}

/** Socket server origin: the API URL without its /v1 suffix. */
export function chatSocketOrigin(): string {
  const api = (import.meta.env.VITE_BACKEND_URL as string | undefined) || 'http://localhost:3000/v1'
  try {
    return new URL(api, window.location.origin).origin
  } catch {
    return 'http://localhost:3000'
  }
}

/** Fresh id for an optimistic message bubble. */
export const newClientId = () => `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
