import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'
import type { AppearancePreferences } from '@/lib/appearance'

export type InvoiceLanguage = 'en' | 'ur'

export interface UpdateLanguageRequest {
  language: InvoiceLanguage
}

export interface UpdateLanguageResponse {
  preferredLanguage: InvoiceLanguage
}

export interface UserPhoto {
  url: string
  publicId: string
}

/** The signed-in person's own account, as GET /users/me returns it. */
export interface MyProfile {
  id: string
  name: string
  email: string
  systemRole?: string
  schoolRole?: string | null
  businessType?: string
  organizationId?: string | null
  preferredLanguage?: InvoiceLanguage
  photo?: UserPhoto
  role?: { id: string; name: string } | string | null
  createdAt?: string
}

export interface UpdateMyProfileRequest {
  name?: string
  email?: string
  preferredLanguage?: InvoiceLanguage
}

export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

export const userPreferencesApi = createApi({
  reducerPath: 'userPreferencesApi',
  baseQuery,
  tagTypes: ['MyProfile'],
  endpoints: (builder) => ({
    getMyProfile: builder.query<MyProfile, void>({
      query: () => '/users/me',
      providesTags: ['MyProfile'],
    }),
    updateMyProfile: builder.mutation<MyProfile, UpdateMyProfileRequest>({
      query: (body) => ({
        url: '/users/me',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['MyProfile'],
    }),
    changeMyPassword: builder.mutation<{ success: boolean }, ChangePasswordRequest>({
      query: (body) => ({
        url: '/users/me/password',
        method: 'POST',
        body,
      }),
    }),
    updateLanguage: builder.mutation<UpdateLanguageResponse, UpdateLanguageRequest>({
      query: (body) => ({
        url: '/users/language',
        method: 'PATCH',
        body,
      }),
    }),
    /** Appearance choices follow the user to every device they sign in from. */
    updateUiPreferences: builder.mutation<
      Partial<AppearancePreferences>,
      Partial<AppearancePreferences>
    >({
      query: (body) => ({
        url: '/users/me/ui-preferences',
        method: 'PATCH',
        body,
      }),
    }),
    /** Removes the signed-in user's profile photo (upload goes through ImageUpload). */
    deleteMyPhoto: builder.mutation<UserPhoto, void>({
      query: () => ({
        url: '/users/me/photo',
        method: 'DELETE',
      }),
      invalidatesTags: ['MyProfile'],
    }),
  }),
})

export const {
  useGetMyProfileQuery,
  useUpdateMyProfileMutation,
  useChangeMyPasswordMutation,
  useUpdateLanguageMutation,
  useUpdateUiPreferencesMutation,
  useDeleteMyPhotoMutation,
} = userPreferencesApi
