import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

export interface QuickLinkAction {
  actionKey: string
  label: string
  iconKey: string
  color: string
  route: string
  routeSearch?: Record<string, unknown>
  category: string
  /** Extra spoken phrases the voice command matcher should also accept. */
  synonyms?: string[]
}

/** Which screen's Quick Links: the main dashboard (default) or the Manufacturing Overview. */
export type QuickLinkBoard = 'dashboard' | 'manufacturing'

/** Query string for a board — none for the dashboard, so its requests stay as they were. */
const boardParams = (board?: QuickLinkBoard | void) =>
  board && board !== 'dashboard' ? { board } : undefined
const boardTag = (board?: QuickLinkBoard | void) => ({
  type: 'QuickLinks' as const,
  id: board || 'dashboard',
})

export interface UpdateQuickLinksInput {
  board?: QuickLinkBoard
  links: { actionKey: string }[]
  /** Full hydrated records (same order) for an accurate optimistic patch — lets the
   *  panel reflect a newly *added* shortcut instantly instead of only reordering what
   *  was already in the cache. Never sent to the server. */
  optimistic?: QuickLinkAction[]
}

export const quickLinksApi = createApi({
  reducerPath: 'quickLinksApi',
  baseQuery,
  tagTypes: ['QuickLinks', 'QuickLinkActions'],
  endpoints: (builder) => ({
    // Master registry of every action a user could pin, already filtered server-side
    // to what their permissions/business type allow. Also feeds the voice command
    // matcher, so both features stay in sync with a single fetch.
    // `board: 'manufacturing'` narrows it to the Manufacturing actions.
    getQuickLinkActions: builder.query<QuickLinkAction[], QuickLinkBoard | void>({
      query: (board) => ({ url: '/quick-links/actions', params: boardParams(board) }),
      providesTags: ['QuickLinkActions'],
    }),
    getMyQuickLinks: builder.query<QuickLinkAction[], QuickLinkBoard | void>({
      query: (board) => ({ url: '/quick-links', params: boardParams(board) }),
      providesTags: (_r, _e, board) => [boardTag(board)],
    }),
    updateQuickLinks: builder.mutation<QuickLinkAction[], UpdateQuickLinksInput>({
      query: ({ links, board }) => ({
        url: '/quick-links',
        method: 'PUT',
        params: boardParams(board),
        body: { links },
      }),
      // Optimistic reorder/add/remove so Save feels instant — reverted automatically
      // if the request fails. Mirrors leadApi's changeLeadStage pattern.
      async onQueryStarted({ links, optimistic, board }, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          quickLinksApi.util.updateQueryData('getMyQuickLinks', board, (draft) => {
            const byKey = new Map(draft.map((item) => [item.actionKey, item]))
            const next = (optimistic ?? links.map((l) => byKey.get(l.actionKey))).filter(
              (item): item is QuickLinkAction => !!item,
            )
            draft.splice(0, draft.length, ...next)
          }),
        )
        try {
          await queryFulfilled
        } catch {
          patchResult.undo()
        }
      },
      invalidatesTags: (_r, _e, { board }) => [boardTag(board)],
    }),
    resetQuickLinks: builder.mutation<QuickLinkAction[], QuickLinkBoard | void>({
      query: (board) => ({ url: '/quick-links/reset', method: 'POST', params: boardParams(board) }),
      invalidatesTags: (_r, _e, board) => [boardTag(board)],
    }),
  }),
})

export const {
  useGetQuickLinkActionsQuery,
  useGetMyQuickLinksQuery,
  useUpdateQuickLinksMutation,
  useResetQuickLinksMutation,
} = quickLinksApi
