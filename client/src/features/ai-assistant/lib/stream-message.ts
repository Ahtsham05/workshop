import { fetchWithTimeout } from '@/lib/api-timeout'
import type { AiMessage } from '@/stores/aiAssistant.api'

const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/v1'

export type AssistantStreamEvent = { type: 'delta' | 'status'; text: string }

export type StreamAssistantResult =
  | { aborted: true }
  | { aborted: false; error: string; message?: undefined }
  | { aborted: false; error?: undefined; message: AiMessage }

function buildHeaders(): HeadersInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem('accessToken')
  if (token) headers.authorization = `Bearer ${token}`
  const activeBranchId = localStorage.getItem('activeBranchId')
  if (activeBranchId) headers['x-branch-id'] = activeBranchId
  return headers
}

/**
 * Streams one assistant reply from POST /ai-assistant/conversations/:id/messages/stream.
 * Wire format is `data: {...}\n\n` frames — the same shape whatsappInbox.controller.js's
 * live-events endpoint already uses in this app, just consumed via fetch+reader here instead
 * of EventSource (which can't do POST or a normal Authorization header). Deliberately not
 * built on RTK Query's fetchBaseQuery, which buffers the whole response before resolving —
 * this reads the body incrementally so text can render as it arrives.
 */
export async function streamAssistantMessage({
  conversationId,
  text,
  signal,
  onEvent,
}: {
  conversationId: string
  text: string
  signal: AbortSignal
  onEvent: (event: AssistantStreamEvent) => void
}): Promise<StreamAssistantResult> {
  try {
    const res = await fetchWithTimeout(
      `${baseUrl}/ai-assistant/conversations/${conversationId}/messages/stream`,
      { method: 'POST', headers: buildHeaders(), body: JSON.stringify({ text }), signal },
      120_000
    )

    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => null)
      return { aborted: false, error: body?.message || `Request failed (${res.status})` }
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let finalMessage: AiMessage | undefined
    let streamError: string | undefined

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')

      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        boundary = buffer.indexOf('\n\n')

        const dataLine = frame.split('\n').find((l) => l.startsWith('data:'))
        if (!dataLine) continue
        const jsonStr = dataLine.slice(5).trim()
        if (!jsonStr) continue

        let event: { type?: string; text?: string; message?: AiMessage }
        try {
          event = JSON.parse(jsonStr)
        } catch {
          continue
        }

        if ((event.type === 'delta' || event.type === 'status') && typeof event.text === 'string') {
          onEvent({ type: event.type, text: event.text })
        } else if (event.type === 'done' && event.message) {
          finalMessage = event.message
        } else if (event.type === 'error') {
          streamError = event.text || 'Something went wrong.'
        }
      }
    }

    if (streamError) return { aborted: false, error: streamError }
    if (finalMessage) return { aborted: false, message: finalMessage }
    return { aborted: false, error: 'The response ended unexpectedly.' }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { aborted: true }
    }
    return { aborted: false, error: 'Failed to reach the AI service.' }
  }
}
