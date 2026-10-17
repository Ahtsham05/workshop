import type { AppDispatch } from '@/stores/store'
import { chatApi, type ChatConversation, type ChatMessage } from '@/stores/chat.api'

/** Cache surgery shared by the socket provider and the send hook. */

const at = (c: ChatConversation) => new Date(c.lastMessageAt || 0).getTime()

export function sortConversations(list: ChatConversation[]) {
  list.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    if (at(b) !== at(a)) return at(b) - at(a)
    const rank = { organization: 0, branch: 1, group: 2, direct: 3 } as const
    return rank[a.type] - rank[b.type] || a.name.localeCompare(b.name)
  })
}

export function previewOf(message: ChatMessage): string {
  if (message.kind === 'product' && message.product) return `📦 ${message.product.name}${message.text ? ` — ${message.text}` : ''}`
  if (message.kind === 'attachment' && !message.text) return `📎 ${message.attachments[0]?.name || 'Attachment'}`
  return message.text
}

/** Puts a saved message into the thread cache (if that thread is loaded), deduped by id. */
export function upsertMessage(dispatch: AppDispatch, conversationId: string, message: ChatMessage) {
  dispatch(
    chatApi.util.updateQueryData('getChatMessages', conversationId, (draft) => {
      const index = draft.messages.findIndex((m) => m.id === message.id)
      if (index >= 0) draft.messages[index] = message
      else {
        draft.messages.push(message)
        draft.messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      }
    })
  )
}

/** Updates a message that is already shown (edit, delete, reaction). Unknown ids are ignored. */
export function replaceMessage(dispatch: AppDispatch, conversationId: string, message: ChatMessage) {
  dispatch(
    chatApi.util.updateQueryData('getChatMessages', conversationId, (draft) => {
      const index = draft.messages.findIndex((m) => m.id === message.id)
      if (index >= 0) draft.messages[index] = message
    })
  )
}

/**
 * Moves the conversation to the top with the new preview. Returns false when the
 * conversation isn't in the list yet (a brand-new direct message or group) so the caller
 * can refetch the list instead.
 */
export function bumpConversation(
  dispatch: AppDispatch,
  conversationId: string,
  message: ChatMessage,
  { countUnread }: { countUnread: boolean }
): boolean {
  let found = false
  dispatch(
    chatApi.util.updateQueryData('getChatConversations', undefined, (draft) => {
      const conversation = draft.find((c) => c.id === conversationId)
      if (!conversation) return
      found = true
      conversation.lastMessage = {
        text: previewOf(message).slice(0, 160),
        kind: message.kind,
        senderId: message.senderId,
        senderName: message.senderName,
        at: message.createdAt,
      }
      conversation.lastMessageAt = message.createdAt
      if (countUnread) conversation.unread += 1
      sortConversations(draft)
    })
  )
  return found
}

export function clearUnread(dispatch: AppDispatch, conversationId: string, lastReadAt?: string) {
  dispatch(
    chatApi.util.updateQueryData('getChatConversations', undefined, (draft) => {
      const conversation = draft.find((c) => c.id === conversationId)
      if (!conversation) return
      conversation.unread = 0
      if (lastReadAt) conversation.lastReadAt = lastReadAt
    })
  )
}
