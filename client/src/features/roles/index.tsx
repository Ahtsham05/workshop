import { useState } from 'react';
import { useGetRolesQuery, useDeleteRoleMutation, Role } from '@/stores/roles.api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Shield, Settings } from 'lucide-react';
import { RoleDialog } from './role-dialog';
import { PermissionsDialog } from './permissions-dialog';
import { useLanguage } from '@/context/language-context';
import { Can } from '@/context/permission-context';
import toast from 'react-hot-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function RolesPage() {
  const { t } = useLanguage();
  const [page, _] = useState(1);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);

  const { data, isLoading, refetch } = useGetRolesQuery({ page, limit: 10 });
  const [deleteRole, { isLoading: isDeleting }] = useDeleteRoleMutation();

  const handleCreateRole = () => {
    setSelectedRole(null);
    setRoleDialogOpen(true);
  };

  const handleEditRole = (role: Role) => {
    setSelectedRole(role);
    setRoleDialogOpen(true);
  };

  const handleManagePermissions = (role: Role) => {
    setSelectedRole(role);
    setPermissionsDialogOpen(true);
  };

  const handleDeleteClick = (role: Role) => {
    setRoleToDelete(role);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!roleToDelete) return;

    try {
      await deleteRole(roleToDelete.id).unwrap();
      toast.success(t('role_deleted_successfully') || 'Role deleted successfully');
      refetch();
    } catch (error: any) {
      toast.error(error?.data?.message || t('failed_to_delete_role') || 'Failed to delete role');
    } finally {
      setDeleteDialogOpen(false);
      setRoleToDelete(null);
    }
  };

  const getPermissionCount = (role: Role) => {
    if (!role.permissions) return 0;
    return Object.values(role.permissions).filter((v) => v === true).length;
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('roles_management') || 'Roles & Permissions'}</h1>
          <p className="text-muted-foreground mt-2">
            {t('roles_management_description') || 'Manage user roles and their permissions'}
          </p>
        </div>
        <Can permission="createRoles">
          <Button onClick={handleCreateRole}>
            <Plus className="w-4 h-4 mr-2" />
            {t('create_role') || 'Create Role'}
          </Button>
        </Can>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('all_roles') || 'All Roles'}</CardTitle>
          <CardDescription>
            {t('roles_list_description') || 'View and manage all system roles'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('role_name') || 'Role Name'}</TableHead>
                    <TableHead>{t('description') || 'Description'}</TableHead>
                    <TableHead>{t('permissions') || 'Permissions'}</TableHead>
                    <TableHead>{t('status') || 'Status'}</TableHead>
                    <TableHead>{t('type') || 'Type'}</TableHead>
                    <TableHead className="text-right">{t('actions') || 'Actions'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.results?.map((role) => (
                    <TableRow key={role.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-primary" />
                          {role.name}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-md truncate">{role.description || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {getPermissionCount(role)} {t('permissions') || 'permissions'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {role.isActive ? (
                          <Badge variant="default">{t('active') || 'Active'}</Badge>
                        ) : (
                          <Badge variant="secondary">{t('inactive') || 'Inactive'}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {role.isSystemRole ? (
                          <Badge variant="outline">{t('system') || 'System'}</Badge>
                        ) : (
                          <Badge variant="outline">{t('custom') || 'Custom'}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Can permission="editRoles">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleManagePermissions(role)}
                              title={t('manage_permissions') || 'Manage Permissions'}
                            >
                              <Settings className="w-4 h-4" />
                            </Button>
                          </Can>
                          {!role.isSystemRole && (
                            <>
                              <Can permission="editRoles">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditRole(role)}
                                  title={t('edit') || 'Edit'}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                              </Can>
                              <Can permission="deleteRoles">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteClick(role)}
                                  title={t('delete') || 'Delete'}
                                  disabled={isDeleting}
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </Can>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {data?.results?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {t('no_roles_found') || 'No roles found'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <RoleDialog
        open={roleDialogOpen}
        onOpenChange={setRoleDialogOpen}
        role={selectedRole}
        onSuccess={refetch}
      />

      <PermissionsDialog
        open={permissionsDialogOpen}
        onOpenChange={setPermissionsDialogOpen}
        role={selectedRole}
        onSuccess={refetch}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete_role') || 'Delete Role'}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('delete_role_confirmation') ||
                `Are you sure you want to delete the role "${roleToDelete?.name}"? This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel') || 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground">
              {t('delete') || 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
