import { fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';
import { offlineAwareFetch } from '@/lib/sync/offline-http';

const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/v1';

export const baseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions
) => {
  const rawBaseQuery = fetchBaseQuery({
    baseUrl,
    fetchFn: offlineAwareFetch,
    prepareHeaders: (headers) => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        headers.set('authorization', `Bearer ${token}`);
      }
      const activeBranchId = localStorage.getItem('activeBranchId');
      if (activeBranchId) {
        headers.set('x-branch-id', activeBranchId);
      }
      return headers;
    },
  });

  const result = await rawBaseQuery(args, api, extraOptions);

  if (result.error && result.error.status === 401) {
    console.error('Authentication failed. Please login again.');
  }

  return result;
};
