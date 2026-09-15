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

export interface UpdateQuickLinksInput {
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
    getQuickLinkActions: builder.query<QuickLinkAction[], void>({
      query: () => ({ url: '/quick-links/actions' }),
      providesTags: ['QuickLinkActions'],
    }),
    getMyQuickLinks: builder.query<QuickLinkAction[], void>({
      query: () => ({ url: '/quick-links' }),
      providesTags: ['QuickLinks'],
    }),
    updateQuickLinks: builder.mutation<QuickLinkAction[], UpdateQuickLinksInput>({
      query: ({ links }) => ({ url: '/quick-links', method: 'PUT', body: { links } }),
      // Optimistic reorder/add/remove so Save feels instant — reverted automatically
      // if the request fails. Mirrors leadApi's changeLeadStage pattern.
      async onQueryStarted({ links, optimistic }, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          quickLinksApi.util.updateQueryData('getMyQuickLinks', undefined, (draft) => {
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
      invalidatesTags: ['QuickLinks'],
    }),
    resetQuickLinks: builder.mutation<QuickLinkAction[], void>({
      query: () => ({ url: '/quick-links/reset', method: 'POST' }),
      invalidatesTags: ['QuickLinks'],
    }),
  }),
})

export const {
  useGetQuickLinkActionsQuery,
  useGetMyQuickLinksQuery,
  useUpdateQuickLinksMutation,
  useResetQuickLinksMutation,
} = quickLinksApi
