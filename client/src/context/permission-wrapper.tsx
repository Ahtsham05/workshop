import { ReactNode } from 'react';
import { useCurrentUser } from './auth-context';
import { PermissionProvider } from './permission-context';
import { Permission } from '@/stores/roles.api';
import { useSelector } from 'react-redux';
import { RootState } from '@/stores/store';

interface PermissionWrapperProps {
  children: ReactNode;
}

export const PermissionWrapper = ({ children }: PermissionWrapperProps) => {
  const user = useCurrentUser();
  const systemRole = useSelector((state: RootState) => state.auth.data?.user?.systemRole);

  // SuperAdmin bypasses all permission checks — build a full permissions object
  const isSuperAdmin = systemRole === 'superAdmin' || systemRole === 'system_admin';

  // Get permissions from user's role, or grant all if superAdmin
  const permissions: Permission | null = isSuperAdmin
    ? ALL_PERMISSIONS
    : (user?.role?.permissions || null);

  return (
    <PermissionProvider permissions={permissions}>
      {children}
    </PermissionProvider>
  );
};

/** A permissions object with every known permission set to true for superAdmin */
const ALL_PERMISSIONS: Permission = {
  viewProducts: true, createProducts: true, editProducts: true, deleteProducts: true,
  viewInvoices: true, createInvoices: true, editInvoices: true, deleteInvoices: true, printInvoices: true,
  viewPurchases: true, createPurchases: true, editPurchases: true, deletePurchases: true,
  viewCustomers: true, createCustomers: true, editCustomers: true, deleteCustomers: true,
  viewSuppliers: true, createSuppliers: true, editSuppliers: true, deleteSuppliers: true,
  viewCategories: true, createCategories: true, editCategories: true, deleteCategories: true,
  viewReports: true, viewSalesReports: true, viewPurchaseReports: true, viewInventoryReports: true,
  viewCustomerReports: true, viewSupplierReports: true, viewProductReports: true, exportReports: true,
  viewUsers: true, createUsers: true, editUsers: true, deleteUsers: true,
  viewRoles: true, createRoles: true, editRoles: true, deleteRoles: true,
  viewSettings: true, editSettings: true,
  viewDashboard: true,
  viewPayments: true, createPayments: true, editPayments: true, deletePayments: true,
  // HR
  getEmployees: true, createEmployees: true, manageEmployees: true, deleteEmployees: true,
  getDepartments: true, createDepartments: true, manageDepartments: true, deleteDepartments: true,
  getAttendance: true, createAttendance: true, manageAttendance: true, deleteAttendance: true,
  getLeaves: true, createLeaves: true, manageLeaves: true, approveLeaves: true, rejectLeaves: true, deleteLeaves: true,
  getPayroll: true, createPayroll: true, managePayroll: true, processPayroll: true, deletePayroll: true,
  getPerformanceReviews: true, createPerformanceReviews: true, managePerformanceReviews: true, deletePerformanceReviews: true,
};
