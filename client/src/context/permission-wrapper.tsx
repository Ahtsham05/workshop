import { ReactNode } from 'react';
import { useCurrentUser } from './auth-context';
import { PermissionProvider } from './permission-context';

interface PermissionWrapperProps {
  children: ReactNode;
}

export const PermissionWrapper = ({ children }: PermissionWrapperProps) => {
  const user = useCurrentUser();
  
  // Get permissions from user's role
  const permissions = user?.role?.permissions || null;

  return (
    <PermissionProvider permissions={permissions}>
      {children}
    </PermissionProvider>
  );
};
