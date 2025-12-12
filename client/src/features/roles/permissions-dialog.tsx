import { useState, useEffect } from 'react';
import { Role, Permission, useUpdateRolePermissionsMutation } from '@/stores/roles.api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/context/language-context';
import toast from 'react-hot-toast';
import {
  ShoppingCart,
  FileText,
  Package,
  Users,
  Truck,
  FolderOpen,
  BarChart3,
  Shield,
  Settings,
  LayoutDashboard,
  CreditCard,
} from 'lucide-react';

interface PermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role | null;
  onSuccess: () => void;
}

interface PermissionGroup {
  title: string;
  icon: React.ReactNode;
  permissions: {
    key: keyof Permission;
    label: string;
  }[];
}

export function PermissionsDialog({ open, onOpenChange, role, onSuccess }: PermissionsDialogProps) {
  const { t } = useLanguage();
  const [permissions, setPermissions] = useState<Permission>({});
  const [updatePermissions, { isLoading }] = useUpdateRolePermissionsMutation();

  useEffect(() => {
    if (role) {
      setPermissions(role.permissions || {});
    }
  }, [role]);

  const permissionGroups: PermissionGroup[] = [
    {
      title: t('products') || 'Products',
      icon: <ShoppingCart className="w-4 h-4" />,
      permissions: [
        { key: 'viewProducts', label: t('view_products') || 'View Products' },
        { key: 'createProducts', label: t('create_products') || 'Create Products' },
        { key: 'editProducts', label: t('edit_products') || 'Edit Products' },
        { key: 'deleteProducts', label: t('delete_products') || 'Delete Products' },
      ],
    },
    {
      title: t('invoices') || 'Invoices',
      icon: <FileText className="w-4 h-4" />,
      permissions: [
        { key: 'viewInvoices', label: t('view_invoices') || 'View Invoices' },
        { key: 'createInvoices', label: t('create_invoices') || 'Create Invoices' },
        { key: 'editInvoices', label: t('edit_invoices') || 'Edit Invoices' },
        { key: 'deleteInvoices', label: t('delete_invoices') || 'Delete Invoices' },
        { key: 'printInvoices', label: t('print_invoices') || 'Print Invoices' },
      ],
    },
    {
      title: t('purchases') || 'Purchases',
      icon: <Package className="w-4 h-4" />,
      permissions: [
        { key: 'viewPurchases', label: t('view_purchases') || 'View Purchases' },
        { key: 'createPurchases', label: t('create_purchases') || 'Create Purchases' },
        { key: 'editPurchases', label: t('edit_purchases') || 'Edit Purchases' },
        { key: 'deletePurchases', label: t('delete_purchases') || 'Delete Purchases' },
      ],
    },
    {
      title: t('customers') || 'Customers',
      icon: <Users className="w-4 h-4" />,
      permissions: [
        { key: 'viewCustomers', label: t('view_customers') || 'View Customers' },
        { key: 'createCustomers', label: t('create_customers') || 'Create Customers' },
        { key: 'editCustomers', label: t('edit_customers') || 'Edit Customers' },
        { key: 'deleteCustomers', label: t('delete_customers') || 'Delete Customers' },
      ],
    },
    {
      title: t('suppliers') || 'Suppliers',
      icon: <Truck className="w-4 h-4" />,
      permissions: [
        { key: 'viewSuppliers', label: t('view_suppliers') || 'View Suppliers' },
        { key: 'createSuppliers', label: t('create_suppliers') || 'Create Suppliers' },
        { key: 'editSuppliers', label: t('edit_suppliers') || 'Edit Suppliers' },
        { key: 'deleteSuppliers', label: t('delete_suppliers') || 'Delete Suppliers' },
      ],
    },
    {
      title: t('categories') || 'Categories',
      icon: <FolderOpen className="w-4 h-4" />,
      permissions: [
        { key: 'viewCategories', label: t('view_categories') || 'View Categories' },
        { key: 'createCategories', label: t('create_categories') || 'Create Categories' },
        { key: 'editCategories', label: t('edit_categories') || 'Edit Categories' },
        { key: 'deleteCategories', label: t('delete_categories') || 'Delete Categories' },
      ],
    },
    {
      title: t('reports') || 'Reports',
      icon: <BarChart3 className="w-4 h-4" />,
      permissions: [
        { key: 'viewReports', label: t('view_reports') || 'View Reports' },
        { key: 'viewSalesReports', label: t('view_sales_reports') || 'View Sales Reports' },
        { key: 'viewPurchaseReports', label: t('view_purchase_reports') || 'View Purchase Reports' },
        { key: 'viewInventoryReports', label: t('view_inventory_reports') || 'View Inventory Reports' },
        { key: 'viewCustomerReports', label: t('view_customer_reports') || 'View Customer Reports' },
        { key: 'viewSupplierReports', label: t('view_supplier_reports') || 'View Supplier Reports' },
        { key: 'viewProductReports', label: t('view_product_reports') || 'View Product Reports' },
        { key: 'exportReports', label: t('export_reports') || 'Export Reports' },
      ],
    },
    {
      title: t('user_management') || 'User Management',
      icon: <Shield className="w-4 h-4" />,
      permissions: [
        { key: 'viewUsers', label: t('view_users') || 'View Users' },
        { key: 'createUsers', label: t('create_users') || 'Create Users' },
        { key: 'editUsers', label: t('edit_users') || 'Edit Users' },
        { key: 'deleteUsers', label: t('delete_users') || 'Delete Users' },
      ],
    },
    {
      title: t('role_management') || 'Role Management',
      icon: <Shield className="w-4 h-4" />,
      permissions: [
        { key: 'viewRoles', label: t('view_roles') || 'View Roles' },
        { key: 'createRoles', label: t('create_roles') || 'Create Roles' },
        { key: 'editRoles', label: t('edit_roles') || 'Edit Roles' },
        { key: 'deleteRoles', label: t('delete_roles') || 'Delete Roles' },
      ],
    },
  ];

  const otherPermissions: PermissionGroup[] = [
    {
      title: t('settings') || 'Settings',
      icon: <Settings className="w-4 h-4" />,
      permissions: [
        { key: 'viewSettings', label: t('view_settings') || 'View Settings' },
        { key: 'editSettings', label: t('edit_settings') || 'Edit Settings' },
      ],
    },
    {
      title: t('dashboard') || 'Dashboard',
      icon: <LayoutDashboard className="w-4 h-4" />,
      permissions: [{ key: 'viewDashboard', label: t('view_dashboard') || 'View Dashboard' }],
    },
    {
      title: t('payments') || 'Payments',
      icon: <CreditCard className="w-4 h-4" />,
      permissions: [
        { key: 'viewPayments', label: t('view_payments') || 'View Payments' },
        { key: 'createPayments', label: t('create_payments') || 'Create Payments' },
        { key: 'editPayments', label: t('edit_payments') || 'Edit Payments' },
        { key: 'deletePayments', label: t('delete_payments') || 'Delete Payments' },
      ],
    },
  ];

  const handlePermissionChange = (key: keyof Permission, checked: boolean) => {
    setPermissions((prev) => ({
      ...prev,
      [key]: checked,
    }));
  };

  const handleSelectAll = (group: PermissionGroup, checked: boolean) => {
    const updates: Partial<Permission> = {};
    group.permissions.forEach((perm) => {
      updates[perm.key] = checked;
    });
    setPermissions((prev) => ({
      ...prev,
      ...updates,
    }));
  };

  const handleSave = async () => {
    if (!role) return;

    try {
      await updatePermissions({ id: role.id, permissions }).unwrap();
      toast.success(t('permissions_updated_successfully') || 'Permissions updated successfully');
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error?.data?.message || t('failed_to_update_permissions') || 'Failed to update permissions');
    }
  };

  const getCheckedCount = (group: PermissionGroup) => {
    return group.permissions.filter((perm) => permissions[perm.key] === true).length;
  };

  const allChecked = (group: PermissionGroup) => {
    return group.permissions.every((perm) => permissions[perm.key] === true);
  };

  if (!role) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            {t('manage_permissions') || 'Manage Permissions'}: {role.name}
          </DialogTitle>
          <DialogDescription>
            {role.isSystemRole
              ? t('system_role_warning') || 'This is a system role. Permissions cannot be modified.'
              : t('Manage Permission Description') || 'Configure permissions for this role'}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="main" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="main">{t('main_permissions') || 'Main Permissions'}</TabsTrigger>
            <TabsTrigger value="other">{t('other_permissions') || 'Other Permissions'}</TabsTrigger>
          </TabsList>

          <TabsContent value="main">
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-6">
                {permissionGroups.map((group) => (
                  <div key={group.title} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {group.icon}
                        <h3 className="font-semibold text-sm">{group.title}</h3>
                        <Badge variant="secondary" className="text-xs">
                          {getCheckedCount(group)}/{group.permissions.length}
                        </Badge>
                      </div>
                      {!role.isSystemRole && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSelectAll(group, !allChecked(group))}
                        >
                          {allChecked(group) ? t('deselect_all') || 'Deselect All' : t('select_all') || 'Select All'}
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 ml-6">
                      {group.permissions.map((perm) => (
                        <div key={perm.key} className="flex items-center space-x-2">
                          <Checkbox
                            id={perm.key}
                            checked={permissions[perm.key] === true}
                            onCheckedChange={(checked) => handlePermissionChange(perm.key, checked as boolean)}
                            disabled={role.isSystemRole}
                          />
                          <Label
                            htmlFor={perm.key}
                            className="text-sm font-normal cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            {perm.label.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="other">
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-6">
                {otherPermissions.map((group) => (
                  <div key={group.title} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {group.icon}
                        <h3 className="font-semibold text-sm">{group.title}</h3>
                        <Badge variant="secondary" className="text-xs">
                          {getCheckedCount(group)}/{group.permissions.length}
                        </Badge>
                      </div>
                      {!role.isSystemRole && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSelectAll(group, !allChecked(group))}
                        >
                          {allChecked(group) ? t('deselect_all') || 'Deselect All' : t('select_all') || 'Select All'}
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 ml-6">
                      {group.permissions.map((perm) => (
                        <div key={perm.key} className="flex items-center space-x-2">
                          <Checkbox
                            id={perm.key}
                            checked={permissions[perm.key] === true}
                            onCheckedChange={(checked) => handlePermissionChange(perm.key, checked as boolean)}
                            disabled={role.isSystemRole}
                          />
                          <Label
                            htmlFor={perm.key}
                            className="text-sm font-normal cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            {perm.label.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel') || 'Cancel'}
          </Button>
          {!role.isSystemRole && (
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading ? t('saving') || 'Saving...' : t('save_changes') || 'Save Changes'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
