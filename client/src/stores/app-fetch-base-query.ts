import { fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import type { FetchBaseQueryArgs } from '@reduxjs/toolkit/query'
import { offlineAwareFetch } from '@/lib/sync/offline-http'

export function createAppFetchBaseQuery(options: FetchBaseQueryArgs) {
  return fetchBaseQuery({
    fetchFn: offlineAwareFetch,
    ...options,
  })
}
