import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './base-query';

export interface Permission {
  // Product Permissions
  viewProducts?: boolean;
  createProducts?: boolean;
  editProducts?: boolean;
  deleteProducts?: boolean;
  
  // Invoice Permissions
  viewInvoices?: boolean;
  createInvoices?: boolean;
  editInvoices?: boolean;
  deleteInvoices?: boolean;
  printInvoices?: boolean;
  
  // Purchase Permissions
  viewPurchases?: boolean;
  createPurchases?: boolean;
  editPurchases?: boolean;
  deletePurchases?: boolean;
  
  // Customer Permissions
  viewCustomers?: boolean;
  createCustomers?: boolean;
  editCustomers?: boolean;
  deleteCustomers?: boolean;
  
  // Supplier Permissions
  viewSuppliers?: boolean;
  createSuppliers?: boolean;
  editSuppliers?: boolean;
  deleteSuppliers?: boolean;
  
  // Category Permissions
  viewCategories?: boolean;
  createCategories?: boolean;
  editCategories?: boolean;
  deleteCategories?: boolean;
  
  // Report Permissions
  viewReports?: boolean;
  viewSalesReports?: boolean;
  viewPurchaseReports?: boolean;
  viewInventoryReports?: boolean;
  viewCustomerReports?: boolean;
  viewSupplierReports?: boolean;
  viewProductReports?: boolean;
  exportReports?: boolean;
  
  // User Management Permissions
  viewUsers?: boolean;
  createUsers?: boolean;
  editUsers?: boolean;
  deleteUsers?: boolean;
  
  // Role Management Permissions
  viewRoles?: boolean;
  createRoles?: boolean;
  editRoles?: boolean;
  deleteRoles?: boolean;
  
  // Settings Permissions
  viewSettings?: boolean;
  editSettings?: boolean;
  
  // Dashboard Permissions
  viewDashboard?: boolean;
  
  // Payment Permissions
  viewPayments?: boolean;
  createPayments?: boolean;
  editPayments?: boolean;
  deletePayments?: boolean;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: Permission;
  isSystemRole: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRoleRequest {
  name: string;
  description?: string;
  permissions?: Permission;
  isActive?: boolean;
}

export interface UpdateRoleRequest {
  name?: string;
  description?: string;
  permissions?: Permission;
  isActive?: boolean;
}

export interface RolesResponse {
  results: Role[];
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
}

export const rolesApi = createApi({
  reducerPath: 'rolesApi',
  baseQuery,
  tagTypes: ['Role'],
  endpoints: (builder) => ({
    getRoles: builder.query<RolesResponse, { page?: number; limit?: number; name?: string; isActive?: boolean }>({
      query: (params) => ({
        url: '/roles',
        params,
      }),
      providesTags: ['Role'],
    }),
    getRole: builder.query<Role, string>({
      query: (id) => `/roles/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Role', id }],
    }),
    createRole: builder.mutation<Role, CreateRoleRequest>({
      query: (body) => ({
        url: '/roles',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Role'],
    }),
    updateRole: builder.mutation<Role, { id: string; data: UpdateRoleRequest }>({
      query: ({ id, data }) => ({
        url: `/roles/${id}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Role', id }, 'Role'],
    }),
    deleteRole: builder.mutation<void, string>({
      query: (id) => ({
        url: `/roles/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Role'],
    }),
    getRolePermissions: builder.query<Permission, string>({
      query: (id) => `/roles/${id}/permissions`,
    }),
    updateRolePermissions: builder.mutation<Role, { id: string; permissions: Permission }>({
      query: ({ id, permissions }) => ({
        url: `/roles/${id}/permissions`,
        method: 'PATCH',
        body: permissions,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Role', id }, 'Role'],
    }),
  }),
});

export const {
  useGetRolesQuery,
  useGetRoleQuery,
  useCreateRoleMutation,
  useUpdateRoleMutation,
  useDeleteRoleMutation,
  useGetRolePermissionsQuery,
  useUpdateRolePermissionsMutation,
} = rolesApi;
