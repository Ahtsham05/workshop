import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './base-query';

export interface Membership {
  id: string;
  userId: { id: string; name: string; email: string; systemRole: string; isActive: boolean } | string;
  organizationId: { id: string; name: string; businessType: string } | string;
  branchId: { id: string; name: string; location?: any; isDefault: boolean } | string;
  role: 'superAdmin' | 'branchAdmin' | 'staff';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStaffRequest {
  branchId: string;
  role: 'branchAdmin' | 'staff';
  name: string;
  email: string;
  password: string;
}

export interface AddMemberRequest {
  branchId: string;
  userId: string;
  role: 'branchAdmin' | 'staff';
}

export const membershipApi = createApi({
  reducerPath: 'membershipApi',
  baseQuery,
  tagTypes: ['Membership'],
  endpoints: (builder) => ({
    getMyMemberships: builder.query<Membership[], void>({
      query: () => '/memberships/me',
      providesTags: ['Membership'],
    }),
    getMembersByOrg: builder.query<Membership[], void>({
      query: () => '/memberships/org',
      providesTags: ['Membership'],
    }),
    getMembersByBranch: builder.query<Membership[], string>({
      query: (branchId) => `/memberships/branch/${branchId}`,
      providesTags: ['Membership'],
    }),
    createStaff: builder.mutation<{ user: any; membership: Membership }, CreateStaffRequest>({
      query: (body) => ({
        url: '/memberships/staff',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Membership'],
    }),
    addMember: builder.mutation<Membership, AddMemberRequest>({
      query: (body) => ({
        url: '/memberships',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Membership'],
    }),
    updateMemberRole: builder.mutation<Membership, { membershipId: string; role: string }>({
      query: ({ membershipId, role }) => ({
        url: `/memberships/${membershipId}/role`,
        method: 'PATCH',
        body: { role },
      }),
      invalidatesTags: ['Membership'],
    }),
    removeMember: builder.mutation<void, string>({
      query: (membershipId) => ({
        url: `/memberships/${membershipId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Membership'],
    }),
  }),
});

export const {
  useGetMyMembershipsQuery,
  useGetMembersByOrgQuery,
  useGetMembersByBranchQuery,
  useCreateStaffMutation,
  useAddMemberMutation,
  useUpdateMemberRoleMutation,
  useRemoveMemberMutation,
} = membershipApi;
