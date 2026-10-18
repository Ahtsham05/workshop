import { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { toast } from 'sonner'
import {
  chatApi,
  useGetChatUploadSignatureMutation,
  useSendChatMessageMutation,
  type ChatAttachment,
  type ChatMessage,
  type ChatProductCard,
} from '@/stores/chat.api'
import type { AppDispatch, RootState } from '@/stores/store'
import {
  bumpConversation,
  setOutgoingListStatus,
  upsertMessage,
} from '../lib/chat-cache'
import { newClientId } from '../lib/chat-live'
import {
  compressImage,
  readMediaMeta,
  rememberLocalPreview,
  uploadToCloudinary,
  UploadCancelled,
} from '../lib/chat-media'
import {
  addToOutbox,
  attachmentFromUpload,
  getOutboxEntry,
  markOutboxFailed,
  removeFromOutbox,
  updateOutboxUpload,
  type OutboxUpload,
} from '../lib/chat-outbox'

export interface OutgoingMessage {
  conversationId: string
  text?: string
  /** Files picked on this device — shown at once from the local copy, uploaded in the background. */
  files?: File[]
  /** Product being shared; only the id goes to the server, the rest draws the optimistic card. */
  product?: Pick<ChatProductCard, 'productId' | 'name'> &
    Partial<ChatProductCard>
  replyTo?: ChatMessage['replyTo']
  /** A voice note recorded in the composer (length and waveform measured while recording). */
  voice?: { file: File; duration: number; waveform: number[] }
}

// In-flight uploads per pending message, so the ✕ on a progress ring can stop them.
const controllers = new Map<string, AbortController>()

/**
 * Sends WhatsApp-style: the bubble appears instantly (with the picked photo/video and an
 * upload ring when there are files) and at the top of the conversation list with a clock;
 * it turns solid with a tick when the server confirms, and stays put marked "Not sent —
 * retry" if anything fails. A retry re-uploads only the files that didn't make it.
 */
export function useChatSender() {
  const dispatch = useDispatch<AppDispatch>()
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const [send] = useSendChatMessageMutation()
  const [getSignature] = useGetChatUploadSignatureMutation()

  const deliver = useCallback(
    async (clientId: string) => {
      const entry = getOutboxEntry(clientId)
      if (!entry) return
      markOutboxFailed(clientId, false)
      setOutgoingListStatus(
        dispatch,
        entry.args.conversationId,
        entry.message.createdAt,
        'pending'
      )
      try {
        let attachments: ChatAttachment[] | undefined = entry.args.attachments
        if (entry.uploads?.length) {
          const controller = new AbortController()
          controllers.set(clientId, controller)
          const missing = entry.uploads.some((u) => !u.attachment)
          const signature = missing ? await getSignature().unwrap() : null
          const uploaded = await Promise.all(
            entry.uploads.map(async (upload, index) => {
              if (upload.attachment) return upload.attachment
              let last = 0
              const attachment = await uploadToCloudinary(
                upload.file,
                signature!,
                upload.meta,
                {
                  signal: controller.signal,
                  onProgress: (fraction) => {
                    // A few repaints per second is plenty for a progress ring.
                    if (fraction - last < 0.02 && fraction < 1) return
                    last = fraction
                    updateOutboxUpload(clientId, index, { progress: fraction })
                  },
                }
              )
              const sent = upload.voice ? { ...attachment, duration: upload.meta.duration, voice: true, waveform: upload.voice.waveform } : attachment
              rememberLocalPreview(sent.url, upload.localUrl)
              updateOutboxUpload(clientId, index, { attachment: sent, progress: 1 })
              return sent
            })
          )
          controllers.delete(clientId)
          attachments = uploaded
        }
        if (!getOutboxEntry(clientId)) return // cancelled while uploading
        const saved = await send({ ...entry.args, attachments }).unwrap()
        upsertMessage(dispatch, entry.args.conversationId, saved)
        bumpConversation(dispatch, entry.args.conversationId, saved, {
          countUnread: false,
          status: 'sent',
        })
        removeFromOutbox(clientId)
      } catch (err) {
        controllers.delete(clientId)
        if (err instanceof UploadCancelled || !getOutboxEntry(clientId)) return
        markOutboxFailed(clientId, true)
        setOutgoingListStatus(
          dispatch,
          entry.args.conversationId,
          entry.message.createdAt,
          'failed'
        )
        const message =
          (err as { data?: { message?: string } })?.data?.message ||
          (err as Error)?.message
        toast.error(message || 'Message not sent — tap it to retry')
      }
    },
    [dispatch, send, getSignature]
  )

  const sendMessage = useCallback(
    async (outgoing: OutgoingMessage) => {
      const clientId = newClientId()
      let uploads: OutboxUpload[] | undefined
      if (outgoing.voice) {
        const { file, duration, waveform } = outgoing.voice
        uploads = [
          {
            file,
            meta: { width: null, height: null, duration },
            localUrl: URL.createObjectURL(file),
            progress: 0,
            voice: { waveform },
          },
        ]
      } else if (outgoing.files?.length) {
        uploads = await Promise.all(
          outgoing.files.map(async (picked) => {
            const file = await compressImage(picked)
            const localUrl = URL.createObjectURL(file)
            const meta = await readMediaMeta(file, localUrl)
            return { file, meta, localUrl, progress: 0 }
          })
        )
      }
      const now = new Date().toISOString()
      const kind = outgoing.product
        ? 'product'
        : uploads?.length
          ? 'attachment'
          : 'text'
      const optimistic: ChatMessage = {
        id: clientId,
        conversationId: outgoing.conversationId,
        senderId: user?.id ?? null,
        senderName: user?.name ?? 'You',
        senderBranchId: null,
        senderBranchName: '',
        kind,
        text: outgoing.text ?? '',
        attachments: uploads ? uploads.map(attachmentFromUpload) : [],
        product: outgoing.product
          ? {
              sku: '',
              barcode: '',
              price: null,
              stock: null,
              unit: '',
              imageUrl: '',
              ...outgoing.product,
            }
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
          productId: outgoing.product?.productId,
          replyToId: outgoing.replyTo?.messageId,
          clientId,
        },
        message: optimistic,
        uploads,
      })
      // Like WhatsApp: the chat jumps to the top of the list with a clock the moment you send.
      bumpConversation(dispatch, outgoing.conversationId, optimistic, {
        countUnread: false,
        status: 'pending',
      })
      void deliver(clientId)
    },
    [deliver, dispatch, user?.id, user?.name]
  )

  /** Stops an upload / drops an unsent message (the ✕ on its ring, or "Discard"). */
  const discard = useCallback(
    (clientId: string) => {
      const entry = getOutboxEntry(clientId)
      controllers.get(clientId)?.abort()
      controllers.delete(clientId)
      removeFromOutbox(clientId)
      // Its optimistic preview may be what the list shows — put the real last message back.
      if (entry) dispatch(chatApi.util.invalidateTags(['ChatConversations']))
    },
    [dispatch]
  )

  return { sendMessage, retry: deliver, discard }
}
