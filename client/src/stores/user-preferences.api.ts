import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

export type InvoiceLanguage = 'en' | 'ur'

export interface UpdateLanguageRequest {
  language: InvoiceLanguage
}

export interface UpdateLanguageResponse {
  preferredLanguage: InvoiceLanguage
}

export const userPreferencesApi = createApi({
  reducerPath: 'userPreferencesApi',
  baseQuery,
  endpoints: (builder) => ({
    updateLanguage: builder.mutation<UpdateLanguageResponse, UpdateLanguageRequest>({
      query: (body) => ({
        url: '/users/language',
        method: 'PATCH',
        body,
      }),
    }),
  }),
})

export const { useUpdateLanguageMutation } = userPreferencesApi
