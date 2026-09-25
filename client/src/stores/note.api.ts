import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

export type NoteColor =
  | 'default'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'orange'
  | 'red'

export type NoteVisibility = 'private' | 'branch' | 'organization'
export type NoteView = 'active' | 'archived' | 'trash'
export type NoteRelatedType =
  | 'Customer'
  | 'Supplier'
  | 'Lead'
  | 'Product'
  | 'Invoice'
  | 'Purchase'
export type NoteType = 'general' | 'meeting' | 'task' | 'idea' | 'code' | 'project' | 'research'

export interface NoteOwner {
  id?: string
  _id?: string
  name?: string
  email?: string
  photo?: string
}

export interface Note {
  id: string
  _id?: string
  organizationId: string
  branchId?: string | null
  /** Populated on shared notes so the list can show who wrote them. */
  ownerId: string | NoteOwner
  title: string
  content: string
  plainText: string
  color: NoteColor
  tags: string[]
  isPinned: boolean
  isArchived: boolean
  isTrashed: boolean
  trashedAt?: string | null
  visibility: NoteVisibility
  relatedType?: NoteRelatedType
  relatedId?: string
  relatedLabel?: string
  noteType: NoteType
  category?: string
  aiSummary?: string
  lastEditedBy?: string
  clientId?: string
  createdAt: string
  updatedAt: string
}

export interface CreateNoteInput {
  title?: string
  content?: string
  color?: NoteColor
  tags?: string[]
  isPinned?: boolean
  visibility?: NoteVisibility
  relatedType?: NoteRelatedType
  relatedId?: string
  relatedLabel?: string
  noteType?: NoteType
  category?: string
  clientId?: string
}

export interface UpdateNoteInput extends Partial<CreateNoteInput> {
  isArchived?: boolean
}

export interface NoteListParams {
  view?: NoteView
  search?: string
  tag?: string
  color?: NoteColor
  visibility?: NoteVisibility
  relatedId?: string
  mine?: boolean
  limit?: number
  page?: number
}

export interface NoteListResult {
  results: Note[]
  page: number
  limit: number
  totalPages: number
  totalResults: number
}

export interface NoteTagCount {
  tag: string
  count: number
}

export type NoteAiAction =
  | 'summarize'
  | 'improveWriting'
  | 'fixGrammar'
  | 'generateTitle'
  | 'extractKeyPoints'
  | 'generateActionItems'
  | 'generateIdeas'
  | 'translate'
  | 'explain'
  | 'rewrite'
  | 'explainCode'
  | 'findBugs'
  | 'improveCode'
  | 'optimizeCode'
  | 'generateDocumentation'
  | 'convertCode'
  | 'generateTests'
  | 'meetingSummary'
  | 'extractDecisions'
  | 'identifyParticipants'
  | 'generateFollowUp'
  | 'answerQuestion'

export interface NoteAiActionOptions {
  length?: 'short' | 'medium' | 'detailed'
  style?: 'professional' | 'simple' | 'shorter' | 'detailed' | 'friendly'
  targetLanguage?: string
  question?: string
}

export interface NoteAiTextResult {
  action: NoteAiAction
  result: string
}

export interface NoteAiListResult {
  action: NoteAiAction
  items: string[]
}

export interface NoteAiMeetingResult {
  action: NoteAiAction
  summary: string
  decisions: string[]
  actionItems: string[]
  followUp: string
}

export type NoteAiActionResult = NoteAiTextResult | NoteAiListResult | NoteAiMeetingResult

export interface NoteOrganizeSuggestion {
  title: string
  category: string
  tags: string[]
}

export interface NoteRelatedResult {
  id: string
  title: string
  color: NoteColor
  tags: string[]
}

export interface NoteAskSource {
  id: string
  title: string
}

export interface NoteAskResult {
  found: boolean
  answer: string
  sources: NoteAskSource[]
}

const buildQuery = (params: object | undefined) => {
  const search = new URLSearchParams()
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    search.set(key, String(value))
  })
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

export const noteApi = createApi({
  reducerPath: 'noteApi',
  baseQuery,
  tagTypes: ['Note', 'NoteTag'],
  endpoints: (builder) => ({
    getNotes: builder.query<NoteListResult, NoteListParams | void>({
      query: (params) => ({ url: `/notes${buildQuery(params || undefined)}` }),
      providesTags: ['Note'],
    }),
    getNoteTags: builder.query<NoteTagCount[], void>({
      query: () => ({ url: '/notes/tags' }),
      providesTags: ['NoteTag'],
    }),
    createNote: builder.mutation<Note, CreateNoteInput>({
      query: (body) => ({ url: '/notes', method: 'POST', body }),
      invalidatesTags: ['Note', 'NoteTag'],
    }),
    updateNote: builder.mutation<Note, { id: string } & UpdateNoteInput>({
      query: ({ id, ...body }) => ({ url: `/notes/${id}`, method: 'PATCH', body }),
      // Autosave fires this on every keystroke pause. Patching the cached list in
      // place keeps the sidebar preview live without a refetch round-trip; the
      // invalidation below is deliberately omitted for the same reason.
      async onQueryStarted({ id, ...patch }, { dispatch, queryFulfilled, getState }) {
        const state = getState() as { noteApi: { queries: Record<string, { originalArgs?: unknown }> } }
        const patches = Object.values(state.noteApi.queries)
          .filter(Boolean)
          .map((entry) =>
            dispatch(
              noteApi.util.updateQueryData(
                'getNotes',
                (entry?.originalArgs ?? undefined) as NoteListParams | void,
                (draft) => {
                  const target = draft.results?.find((note) => note.id === id)
                  if (target) Object.assign(target, patch)
                },
              ),
            ),
          )
        try {
          await queryFulfilled
        } catch {
          patches.forEach((undo) => undo.undo())
        }
      },
    }),
    deleteNote: builder.mutation<Note | void, { id: string; permanent?: boolean }>({
      query: ({ id, permanent }) => ({
        url: `/notes/${id}${permanent ? '?permanent=true' : ''}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Note', 'NoteTag'],
    }),
    restoreNote: builder.mutation<Note, string>({
      query: (id) => ({ url: `/notes/${id}/restore`, method: 'POST' }),
      invalidatesTags: ['Note', 'NoteTag'],
    }),
    duplicateNote: builder.mutation<Note, string>({
      query: (id) => ({ url: `/notes/${id}/duplicate`, method: 'POST' }),
      invalidatesTags: ['Note', 'NoteTag'],
    }),
    emptyNoteTrash: builder.mutation<{ deletedCount: number }, void>({
      query: () => ({ url: '/notes/trash/empty', method: 'POST' }),
      invalidatesTags: ['Note', 'NoteTag'],
    }),
    runNoteAiAction: builder.mutation<
      NoteAiActionResult,
      { id: string; action: NoteAiAction; options?: NoteAiActionOptions }
    >({
      query: ({ id, action, options }) => ({ url: `/notes/${id}/ai/action`, method: 'POST', body: { action, options } }),
      // "summarize" is cached server-side onto the note (aiSummary) — refresh the list
      // so a preview or badge relying on it stays in sync without a manual refetch.
      invalidatesTags: (_result, error, { action }) => (!error && action === 'summarize' ? ['Note'] : []),
    }),
    organizeNoteWithAi: builder.mutation<NoteOrganizeSuggestion, string>({
      query: (id) => ({ url: `/notes/${id}/ai/organize`, method: 'POST' }),
    }),
    getRelatedNotes: builder.query<{ results: NoteRelatedResult[] }, string>({
      query: (id) => ({ url: `/notes/${id}/related` }),
    }),
    askNotes: builder.mutation<NoteAskResult, string>({
      query: (question) => ({ url: '/notes/ai/ask', method: 'POST', body: { question } }),
    }),
  }),
})

export const {
  useGetNotesQuery,
  useGetNoteTagsQuery,
  useCreateNoteMutation,
  useUpdateNoteMutation,
  useDeleteNoteMutation,
  useRestoreNoteMutation,
  useDuplicateNoteMutation,
  useEmptyNoteTrashMutation,
  useRunNoteAiActionMutation,
  useOrganizeNoteWithAiMutation,
  useGetRelatedNotesQuery,
  useAskNotesMutation,
} = noteApi
