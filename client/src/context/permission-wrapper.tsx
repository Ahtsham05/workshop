import { ReactNode } from 'react';
import { useCurrentUser } from './auth-context';
import { PermissionProvider } from './permission-context';
import { useSelector } from 'react-redux';
import { RootState } from '@/stores/store';
import { buildAllPermissionsTrue } from '@/lib/permission-registry';
import type { Permission } from '@/lib/permission-registry';

interface PermissionWrapperProps {
  children: ReactNode;
}

export const PermissionWrapper = ({ children }: PermissionWrapperProps) => {
  const user = useCurrentUser();
  const systemRole = useSelector((state: RootState) => state.auth.data?.user?.systemRole);

  const isSuperAdmin = systemRole === 'superAdmin' || systemRole === 'system_admin';

  const permissions: Permission | null = isSuperAdmin
    ? buildAllPermissionsTrue()
    : (user?.role?.permissions || null);

  return (
    <PermissionProvider permissions={permissions}>
      {children}
    </PermissionProvider>
  );
};
