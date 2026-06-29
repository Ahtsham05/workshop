import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './base-query';

export interface AuditLogChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface AuditLog {
  id: string;
  organizationId?: string;
  branchId?: string;
  userId?: { id: string; name: string; email: string } | string;
  userName?: string;
  userEmail?: string;
  action: 'create' | 'update' | 'delete' | 'stock_adjust' | 'permission_change' | 'status_change';
  module: string;
  entityId?: string;
  entityName?: string;
  changes: AuditLogChange[];
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

export interface AuditLogsResponse {
  results: AuditLog[];
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
}

export interface GetAuditLogsParams {
  module?: string;
  action?: string;
  userId?: string;
  entityId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
}

export const auditLogApi = createApi({
  reducerPath: 'auditLogApi',
  baseQuery,
  tagTypes: ['AuditLog'],
  endpoints: (builder) => ({
    getAuditLogs: builder.query<AuditLogsResponse, GetAuditLogsParams | void>({
      query: (params) => ({
        url: '/audit-logs',
        params: params || undefined,
      }),
      providesTags: ['AuditLog'],
    }),
    getAuditModules: builder.query<string[], void>({
      query: () => '/audit-logs/modules',
    }),
  }),
});

export const { useGetAuditLogsQuery, useGetAuditModulesQuery } = auditLogApi;
