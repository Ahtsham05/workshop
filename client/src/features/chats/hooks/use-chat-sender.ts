import { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { toast } from 'sonner'
import type { AppDispatch, RootState } from '@/stores/store'
import { useSendChatMessageMutation, type ChatAttachment, type ChatMessage, type ChatProductCard } from '@/stores/chat.api'
import { newClientId } from '../lib/chat-live'
import { addToOutbox, getOutboxEntry, markOutboxFailed, removeFromOutbox } from '../lib/chat-outbox'
import { bumpConversation, upsertMessage } from '../lib/chat-cache'

export interface OutgoingMessage {
  conversationId: string
  text?: string
  attachments?: ChatAttachment[]
  /** Product being shared; only the id goes to the server, the rest draws the optimistic card. */
  product?: Pick<ChatProductCard, 'productId' | 'name'> & Partial<ChatProductCard>
  replyTo?: ChatMessage['replyTo']
}

/**
 * Sends with an optimistic bubble: it appears instantly (greyed), turns solid when the
 * server confirms, and stays put marked "Not sent — retry" if the request fails.
 */
export function useChatSender() {
  const dispatch = useDispatch<AppDispatch>()
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const [send] = useSendChatMessageMutation()

  const deliver = useCallback(
    async (clientId: string) => {
      const entry = getOutboxEntry(clientId)
      if (!entry) return
      markOutboxFailed(clientId, false)
      try {
        const saved = await send(entry.args).unwrap()
        upsertMessage(dispatch, entry.args.conversationId, saved)
        bumpConversation(dispatch, entry.args.conversationId, saved, { countUnread: false })
        removeFromOutbox(clientId)
      } catch (err) {
        markOutboxFailed(clientId, true)
        const message = (err as { data?: { message?: string } })?.data?.message
        toast.error(message || 'Message not sent — tap it to retry')
      }
    },
    [dispatch, send]
  )

  const sendMessage = useCallback(
    (outgoing: OutgoingMessage) => {
      const clientId = newClientId()
      const now = new Date().toISOString()
      const kind = outgoing.product ? 'product' : outgoing.attachments?.length ? 'attachment' : 'text'
      const optimistic: ChatMessage = {
        id: clientId,
        conversationId: outgoing.conversationId,
        senderId: user?.id ?? null,
        senderName: user?.name ?? 'You',
        senderBranchId: null,
        senderBranchName: '',
        kind,
        text: outgoing.text ?? '',
        attachments: outgoing.attachments ?? [],
        product: outgoing.product
          ? { sku: '', barcode: '', price: null, stock: null, unit: '', imageUrl: '', ...outgoing.product }
          : null,
        replyTo: outgoing.replyTo ?? null,
        reactions: [],
        clientId,
        editedAt: null,
        deletedAt: null,
        createdAt: now,
        pending: true,
      }
      addToOutbox({
        args: {
          conversationId: outgoing.conversationId,
          text: outgoing.text,
          attachments: outgoing.attachments,
          productId: outgoing.product?.productId,
          replyToId: outgoing.replyTo?.messageId,
          clientId,
        },
        message: optimistic,
      })
      void deliver(clientId)
    },
    [deliver, user?.id, user?.name]
  )

  return { sendMessage, retry: deliver, discard: removeFromOutbox }
}
