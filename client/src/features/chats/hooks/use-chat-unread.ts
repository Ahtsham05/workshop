import { useSelector } from 'react-redux'
import type { RootState } from '@/stores/store'
import { chatApi } from '@/stores/chat.api'

/**
 * Unread messages across every non-muted conversation, read straight from the cache that
 * ChatLiveProvider keeps subscribed and live — so a badge costs no request of its own.
 */
export function useChatUnreadTotal(): number {
  return useSelector((state: RootState) => {
    const list = chatApi.endpoints.getChatConversations.select()(state)?.data
    return list ? list.reduce((sum, c) => sum + (c.muted ? 0 : c.unread), 0) : 0
  })
}
