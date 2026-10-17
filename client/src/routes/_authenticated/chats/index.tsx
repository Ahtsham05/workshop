import { createFileRoute } from '@tanstack/react-router'
import Chats from '@/features/chats'

export const Route = createFileRoute('/_authenticated/chats/')({
  // ?c = open conversation, ?m = message to scroll to (from search or a notification)
  validateSearch: (search: Record<string, unknown>): { c?: string; m?: string } => ({
    c: typeof search.c === 'string' ? search.c : undefined,
    m: typeof search.m === 'string' ? search.m : undefined,
  }),
  component: Chats,
})
