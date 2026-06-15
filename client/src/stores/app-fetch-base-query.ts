import { fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError, FetchBaseQueryArgs } from '@reduxjs/toolkit/query'
import { applyRequestTimeout } from '@/lib/api-timeout'
import { offlineAwareFetch } from '@/lib/sync/offline-http'

export function createAppFetchBaseQuery(options: FetchBaseQueryArgs) {
  const rawBaseQuery = fetchBaseQuery({
    fetchFn: offlineAwareFetch,
    ...options,
  })

  const baseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
    args,
    api,
    extraOptions,
  ) => rawBaseQuery(applyRequestTimeout(args), api, extraOptions)

  return baseQuery
}
