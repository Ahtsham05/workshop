import { createContext, useContext, ReactNode } from 'react';
import { Permission } from '@/stores/roles.api';

interface PermissionContextType {
  permissions: Permission | null;
  hasPermission: (permission: keyof Permission) => boolean;
  hasAnyPermission: (...permissions: (keyof Permission)[]) => boolean;
  hasAllPermissions: (...permissions: (keyof Permission)[]) => boolean;
}

const PermissionContext = createContext<PermissionContextType | undefined>(undefined);

export const usePermissions = () => {
  const context = useContext(PermissionContext);
  if (!context) {
    throw new Error('usePermissions must be used within a PermissionProvider');
  }
  return context;
};

interface PermissionProviderProps {
  children: ReactNode;
  permissions: Permission | null;
}

export const PermissionProvider = ({ children, permissions }: PermissionProviderProps) => {
  const hasPermission = (permission: keyof Permission): boolean => {
    if (!permissions) return false;
    return permissions[permission] === true;
  };

  const hasAnyPermission = (...requiredPermissions: (keyof Permission)[]): boolean => {
    if (!permissions) return false;
    return requiredPermissions.some((permission) => permissions[permission] === true);
  };

  const hasAllPermissions = (...requiredPermissions: (keyof Permission)[]): boolean => {
    if (!permissions) return false;
    return requiredPermissions.every((permission) => permissions[permission] === true);
  };

  return (
    <PermissionContext.Provider value={{ permissions, hasPermission, hasAnyPermission, hasAllPermissions }}>
      {children}
    </PermissionContext.Provider>
  );
};

// Component to conditionally render based on permissions
interface CanProps {
  permission?: keyof Permission;
  anyPermissions?: (keyof Permission)[];
  allPermissions?: (keyof Permission)[];
  children: ReactNode;
  fallback?: ReactNode;
}

export const Can = ({ permission, anyPermissions, allPermissions, children, fallback = null }: CanProps) => {
  const { hasPermission, hasAnyPermission, hasAllPermissions } = usePermissions();

  let allowed = false;

  if (permission) {
    allowed = hasPermission(permission);
  } else if (anyPermissions) {
    allowed = hasAnyPermission(...anyPermissions);
  } else if (allPermissions) {
    allowed = hasAllPermissions(...allPermissions);
  }

  return <>{allowed ? children : fallback}</>;
};
