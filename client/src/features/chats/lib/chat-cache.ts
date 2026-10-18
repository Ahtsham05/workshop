import type { AppDispatch } from '@/stores/store'
import { chatApi, type ChatConversation, type ChatMessage, type ChatMessageStatus } from '@/stores/chat.api'
import { laterStatus, receiptStatusFor } from './chat-live'
import { formatDuration, mediaKind } from './chat-media'

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

/** Same wording as the server's list preview (chat.service.js#attachmentPreview). */
function attachmentPreview(message: ChatMessage): string {
  const all = message.attachments
  if (all.length === 1 && all[0].voice) {
    const clock = formatDuration(all[0].duration)
    return `🎤 Voice message${clock ? ` (${clock})` : ''}`
  }
  const kinds = [...new Set(all.map((a) => mediaKind(a.mimeType)))]
  let label: string
  if (kinds.length === 1 && kinds[0] === 'image') label = all.length > 1 ? `📷 ${all.length} photos` : '📷 Photo'
  else if (kinds.length === 1 && kinds[0] === 'video') label = all.length > 1 ? `🎥 ${all.length} videos` : '🎥 Video'
  else if (kinds.every((k) => k === 'image' || k === 'video')) label = `🖼️ ${all.length} photos & videos`
  else if (kinds.length === 1 && kinds[0] === 'audio') label = '🎵 Audio'
  else if (all.length === 1) label = `📄 ${all[0].name || 'Document'}`
  else label = `📎 ${all.length} files`
  return message.text ? `${label.split(' ')[0]} ${message.text}` : label
}

export function previewOf(message: ChatMessage): string {
  if (message.kind === 'product' && message.product) return `📦 ${message.product.name}${message.text ? ` — ${message.text}` : ''}`
  if (message.attachments.length) return attachmentPreview(message)
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
  { countUnread, status = null }: { countUnread: boolean; status?: ChatMessageStatus | null }
): boolean {
  let found = false
  dispatch(
    chatApi.util.updateQueryData('getChatConversations', undefined, (draft) => {
      const conversation = draft.find((c) => c.id === conversationId)
      if (!conversation) return
      found = true
      // The same message arriving twice (socket push + POST response) keeps its best ticks.
      const previous = conversation.lastMessage
      const same = !!previous && previous.at === message.createdAt && previous.senderId === message.senderId
      const nextStatus =
        status === 'pending' || status === 'failed'
          ? status
          : laterStatus(laterStatus(same ? previous?.status : null, status), receiptStatusFor(conversationId, message.createdAt))
      conversation.lastMessage = {
        text: previewOf(message).slice(0, 160),
        kind: message.kind,
        senderId: message.senderId,
        senderName: message.senderName,
        at: message.createdAt,
        status: nextStatus,
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

/** A receipt moved the newest message's ticks forward (only ever forward). */
export function applyListStatus(dispatch: AppDispatch, conversationId: string, at: string, status: ChatMessageStatus) {
  dispatch(
    chatApi.util.updateQueryData('getChatConversations', undefined, (draft) => {
      const last = draft.find((c) => c.id === conversationId)?.lastMessage
      if (last && new Date(last.at).getTime() === new Date(at).getTime()) last.status = laterStatus(last.status, status)
    })
  )
}

/** An unsent message's preview: 'failed', or back to 'pending' on retry — if it is still the newest. */
export function setOutgoingListStatus(dispatch: AppDispatch, conversationId: string, at: string, status: 'pending' | 'failed') {
  dispatch(
    chatApi.util.updateQueryData('getChatConversations', undefined, (draft) => {
      const last = draft.find((c) => c.id === conversationId)?.lastMessage
      if (last && last.at === at) last.status = status
    })
  )
}

/** Someone's delivery/read progress, for the open thread's ticks and "Message info". */
export function applyMemberReceipt(
  dispatch: AppDispatch,
  conversationId: string,
  receipt: { userId: string; lastReadAt: string | null; lastDeliveredAt: string | null }
) {
  const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : new Date(b) > new Date(a) ? b : a)
  dispatch(
    chatApi.util.updateQueryData('getChatConversation', conversationId, (draft) => {
      const member = draft.members.find((m) => m.id === receipt.userId)
      if (!member) return
      member.lastReadAt = later(member.lastReadAt, receipt.lastReadAt)
      member.lastDeliveredAt = later(member.lastDeliveredAt, receipt.lastDeliveredAt)
    })
  )
}
