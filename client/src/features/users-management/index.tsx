import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useGetUsersQuery, useDeleteUserMutation, User } from '@/stores/users.api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, User as UserIcon, Shield, Lock, ArrowUpRight } from 'lucide-react';
import { UserDialog } from './user-dialog.tsx';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { usePlanLimits } from '@/hooks/use-plan-limits';

export default function UsersManagementPage() {
  const { t } = useLanguage();
  const [page, _] = useState(1);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  const { data, isLoading, refetch } = useGetUsersQuery({ page, limit: 10 });
  const [deleteUser, { isLoading: isDeleting }] = useDeleteUserMutation();

  const {
    usersUsed,
    maxUsers,
    userLimitReached,
    planLabel,
    isLoading: limitsLoading,
    refetch: refetchPlanLimits,
  } = usePlanLimits();

  const maxUsersDisplay = maxUsers === Infinity ? '∞' : maxUsers;

  const handleCreateUser = () => {
    setSelectedUser(null);
    setUserDialogOpen(true);
  };

  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    setUserDialogOpen(true);
  };

  const handleDeleteClick = (user: User) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!userToDelete) return;

    try {
      await deleteUser(userToDelete.id).unwrap();
      toast.success(t('user_deleted_successfully') || 'User deleted successfully');
      await Promise.all([refetch(), refetchPlanLimits()]);
    } catch (error: any) {
      toast.error(error?.data?.message || t('failed_to_delete_user') || 'Failed to delete user');
    } finally {
      setDeleteDialogOpen(false);
      setUserToDelete(null);
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Plan limit banner */}
      {userLimitReached && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-4 py-3 text-sm">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
            <Lock className="h-4 w-4 shrink-0" />
            <span>
              You have reached the user limit for your <strong>{planLabel}</strong> ({usersUsed}/{maxUsersDisplay} users).
              Upgrade to add more team members.
            </span>
          </div>
          <Link to="/subscription/pricing">
            <Button size="sm" variant="outline" className="shrink-0 border-amber-400 text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:border-amber-700 dark:hover:bg-amber-900/50">
              <ArrowUpRight className="mr-1 h-3.5 w-3.5" />
              Upgrade Plan
            </Button>
          </Link>
        </div>
      )}

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('users_management') || 'Users Management'}</h1>
          <p className="text-muted-foreground mt-2">
            {t('users_management_description') || 'Manage users and assign roles'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Usage indicator */}
          {!limitsLoading && (
            <div className="text-sm text-muted-foreground tabular-nums">
              <span className={userLimitReached ? 'text-amber-600 font-semibold' : ''}>
                {usersUsed}
              </span>
              <span> / {maxUsersDisplay} users</span>
            </div>
          )}
          <Can permission="createUsers">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button onClick={handleCreateUser} disabled={userLimitReached}>
                      {userLimitReached ? (
                        <Lock className="w-4 h-4 mr-2" />
                      ) : (
                        <Plus className="w-4 h-4 mr-2" />
                      )}
                      {t('create_user') || 'Create User'}
                    </Button>
                  </span>
                </TooltipTrigger>
                {userLimitReached && (
                  <TooltipContent>
                    <p>User limit reached. Upgrade your plan to add more users.</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </Can>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('all_users') || 'All Users'}</CardTitle>
          <CardDescription>
            {t('users_list_description') || 'View and manage all system users'}
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
                    <TableHead>{t('name') || 'Name'}</TableHead>
                    <TableHead>{t('email') || 'Email'}</TableHead>
                    <TableHead>{t('role') || 'Role'}</TableHead>
                    <TableHead>{t('status') || 'Status'}</TableHead>
                    <TableHead>{t('email_verified') || 'Email Verified'}</TableHead>
                    <TableHead className="text-right">{t('actions') || 'Actions'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.results?.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <UserIcon className="w-4 h-4 text-muted-foreground" />
                          {user.name}
                        </div>
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        {user.role ? (
                          <Badge variant="outline" className="flex items-center gap-1 w-fit">
                            <Shield className="w-3 h-3" />
                            {user.role.name}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">{t('no_role') || 'No Role'}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {user.isActive ? (
                          <Badge variant="default">{t('active') || 'Active'}</Badge>
                        ) : (
                          <Badge variant="secondary">{t('inactive') || 'Inactive'}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {user.isEmailVerified ? (
                          <Badge variant="default" className="bg-green-600">{t('verified') || 'Verified'}</Badge>
                        ) : (
                          <Badge variant="destructive">{t('not_verified') || 'Not Verified'}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Can permission="editUsers">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditUser(user)}
                              title={t('edit') || 'Edit'}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          </Can>
                          <Can permission="deleteUsers">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteClick(user)}
                              title={t('delete') || 'Delete'}
                              disabled={isDeleting}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </Can>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {data?.results?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {t('no_users_found') || 'No users found'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <UserDialog
        open={userDialogOpen}
        onOpenChange={setUserDialogOpen}
        user={selectedUser}
        onSuccess={async () => {
          await Promise.all([refetch(), refetchPlanLimits()]);
        }}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete_user') || 'Delete User'}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('delete_user_confirmation') ||
                `Are you sure you want to delete the user "${userToDelete?.name}"? This action cannot be undone.`}
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
