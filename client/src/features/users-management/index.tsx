import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useSelector } from 'react-redux';
import { useGetUsersQuery, useDeleteUserMutation, useUpdateUserMutation, User } from '@/stores/users.api';
import type { RootState } from '@/stores/store';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Plus, Pencil, Trash2, Lock, ArrowUpRight, MoreHorizontal, Search, Crown, UserX, UserCheck, AlertTriangle,
} from 'lucide-react';
import { UserDialog } from './user-dialog.tsx';
import { UserAvatar } from '@/components/user-avatar';
import { useLanguage } from '@/context/language-context';
import { usePermissions } from '@/context/permission-context';
import toast from 'react-hot-toast';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { usePlanLimits } from '@/hooks/use-plan-limits';
import { cn } from '@/lib/utils';
import { getErrorMessage } from '@/lib/get-error-message';

type Filter = 'all' | 'active' | 'inactive' | 'no-branch';

/**
 * Users & Staff — the one place to manage everyone who can sign in: their login, their
 * role (what they can do) and their branch access (where). This replaced two pages
 * (Users Management + Staff Management) that edited the same people in halves.
 */
export default function UsersManagementPage() {
  const { t } = useLanguage();
  const me = useSelector((state: RootState) => state.auth.data?.user);
  const iAmOwner = me?.systemRole === 'superAdmin' || me?.systemRole === 'system_admin';
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission('createUsers') || hasPermission('manageStaff');
  const canEdit = hasPermission('editUsers') || hasPermission('manageStaff');
  const canDelete = hasPermission('deleteUsers');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  // Teams are small; one request for everyone keeps search/filter instant. (The old page
  // asked for 10 with no pager, so the 11th user simply never appeared.)
  const { data, isLoading, refetch } = useGetUsersQuery({ page: 1, limit: 500 });
  const [deleteUser, { isLoading: isDeleting }] = useDeleteUserMutation();
  const [updateUser] = useUpdateUserMutation();
  const { usersUsed, maxUsers, userLimitReached, planLabel, isLoading: limitsLoading, refetch: refetchPlanLimits } = usePlanLimits();
  const maxUsersDisplay = maxUsers === Infinity ? '∞' : maxUsers;

  const users = useMemo(() => data?.results ?? [], [data]);
  const counts = useMemo(
    () => ({
      all: users.length,
      active: users.filter((u) => u.isActive).length,
      inactive: users.filter((u) => !u.isActive).length,
      'no-branch': users.filter((u) => !u.isOwner && u.isActive && !(u.branches ?? []).length).length,
    }),
    [users]
  );
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) =>
        filter === 'active' ? u.isActive
          : filter === 'inactive' ? !u.isActive
          : filter === 'no-branch' ? !u.isOwner && u.isActive && !(u.branches ?? []).length
          : true
      )
      .filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .sort((a, b) => Number(!!b.isOwner) - Number(!!a.isOwner) || Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));
  }, [users, filter, search]);

  const refresh = async () => {
    await Promise.all([refetch(), refetchPlanLimits()]);
  };

  const openCreate = () => {
    setSelectedUser(null);
    setDialogOpen(true);
  };
  const openEdit = (user: User) => {
    setSelectedUser(user);
    setDialogOpen(true);
  };

  const setActive = async (user: User, isActive: boolean) => {
    try {
      await updateUser({ id: user.id, data: { isActive } }).unwrap();
      toast.success(isActive ? `${user.name} can sign in again` : `${user.name} has been deactivated and signed out`);
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not update the user'));
    }
  };

  const handleDeleteConfirm = async () => {
    if (!userToDelete) return;
    try {
      await deleteUser(userToDelete.id).unwrap();
      toast.success(t('user_deleted_successfully') || 'User deleted successfully');
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error, t('failed_to_delete_user')));
    } finally {
      setUserToDelete(null);
    }
  };

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'inactive', label: 'Inactive' },
    { key: 'no-branch', label: 'No branch access' },
  ];

  return (
    <div className="container mx-auto space-y-5 py-6">
      {userLimitReached && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
            <Lock className="h-4 w-4 shrink-0" />
            <span>
              You have reached the user limit for your <strong>{planLabel}</strong> ({usersUsed}/{maxUsersDisplay} users).
              Deactivate someone or upgrade to add more.
            </span>
          </div>
          <Link to="/settings/billing">
            <Button size="sm" variant="outline" className="shrink-0 border-amber-400 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/50">
              <ArrowUpRight className="mr-1 h-3.5 w-3.5" />
              Upgrade Plan
            </Button>
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('users_management') || 'Users & Staff'}</h1>
          <p className="mt-1 text-muted-foreground">
            Everyone who can sign in — what they can do (role) and where (branches).
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!limitsLoading && (
            <div className="text-sm tabular-nums text-muted-foreground" title="Active users count towards your plan; inactive ones don't">
              <span className={userLimitReached ? 'font-semibold text-amber-600' : ''}>{usersUsed}</span>
              <span> / {maxUsersDisplay} seats</span>
            </div>
          )}
          {canCreate && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button onClick={openCreate} disabled={userLimitReached}>
                      {userLimitReached ? <Lock className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                      {t('add_user') || 'Add User'}
                    </Button>
                  </span>
                </TooltipTrigger>
                {userLimitReached && (
                  <TooltipContent>
                    <p>User limit reached. Deactivate someone or upgrade your plan.</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 px-3 pt-4 sm:px-6 sm:pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email" className="pl-8" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {filters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors',
                    filter === f.key ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
                    f.key === 'no-branch' && counts['no-branch'] > 0 && filter !== f.key && 'border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400'
                  )}
                >
                  {f.label}
                  <span className="tabular-nums opacity-70">{counts[f.key]}</span>
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('name') || 'User'}</TableHead>
                    <TableHead className="hidden md:table-cell">{t('role') || 'Role'}</TableHead>
                    <TableHead className="hidden md:table-cell">Branches</TableHead>
                    <TableHead className="hidden md:table-cell">{t('status') || 'Status'}</TableHead>
                    <TableHead className="w-12 text-right"><span className="sr-only">{t('actions') || 'Actions'}</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((user) => {
                    const isSelf = !!me && String(me.id) === String(user.id);
                    const branches = user.branches ?? [];
                    const roleCell = user.isOwner ? (
                      <Badge variant="default" className="w-fit gap-1"><Crown className="h-3 w-3" />Owner</Badge>
                    ) : user.role ? (
                      <Badge variant="outline" className="w-fit">{user.role.name}</Badge>
                    ) : (
                      <Badge variant="secondary">{t('no_role') || 'No role'}</Badge>
                    );
                    const branchCell = user.isOwner ? (
                      <span className="text-sm text-muted-foreground">All branches</span>
                    ) : branches.length ? (
                      <div className="flex flex-wrap gap-1">
                        {branches.slice(0, 3).map((b) => (
                          <Badge key={b.id} variant="secondary" className="font-normal">{b.name}</Badge>
                        ))}
                        {branches.length > 3 && (
                          <Badge variant="secondary" className="font-normal" title={branches.slice(3).map((b) => b.name).join(', ')}>
                            +{branches.length - 3}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-3.5 w-3.5" />No branch
                      </span>
                    );
                    const ownerLocked = user.isOwner && !iAmOwner;
                    const showEdit = canEdit && !ownerLocked;
                    const showToggle = canEdit && !user.isOwner && !isSelf;
                    const showDelete = canDelete && !user.isOwner && !isSelf;

                    return (
                      <TableRow key={user.id} className={cn(!user.isActive && 'opacity-60')}>
                        <TableCell className="max-w-[16rem] md:max-w-none">
                          <div className="flex min-w-0 items-center gap-3">
                            <UserAvatar name={user.name} email={user.email} photoUrl={user.photo?.url} className="h-9 w-9" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 font-medium">
                                <span className="truncate">{user.name}</span>
                                {isSelf && <Badge variant="outline" className="px-1.5 py-0 text-[10px]">You</Badge>}
                              </div>
                              <div className="truncate text-sm text-muted-foreground">{user.email}</div>
                              {/* Phones: role + branches fold under the name instead of their own columns. */}
                              <div className="mt-1 flex flex-wrap items-center gap-1 md:hidden">
                                {roleCell}
                                {branchCell}
                                {!user.isActive && <Badge variant="secondary">{t('inactive') || 'Inactive'}</Badge>}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{roleCell}</TableCell>
                        <TableCell className="hidden md:table-cell">{branchCell}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          {user.isActive ? (
                            <Badge variant="default">{t('active') || 'Active'}</Badge>
                          ) : (
                            <Badge variant="secondary">{t('inactive') || 'Inactive'}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {(showEdit || showToggle || showDelete) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${user.name}`}>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {showEdit && (
                                  <DropdownMenuItem onClick={() => openEdit(user)}>
                                    <Pencil className="mr-2 h-4 w-4" />{t('edit') || 'Edit'}
                                  </DropdownMenuItem>
                                )}
                                {showToggle && (
                                  <DropdownMenuItem onClick={() => setActive(user, !user.isActive)}>
                                    {user.isActive ? <UserX className="mr-2 h-4 w-4" /> : <UserCheck className="mr-2 h-4 w-4" />}
                                    {user.isActive ? 'Deactivate' : 'Activate'}
                                  </DropdownMenuItem>
                                )}
                                {showDelete && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setUserToDelete(user)}>
                                      <Trash2 className="mr-2 h-4 w-4" />{t('delete') || 'Delete'}
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {visible.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        {users.length === 0 ? t('no_users_found') || 'No users found' : 'Nobody matches this search or filter.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <UserDialog open={dialogOpen} onOpenChange={setDialogOpen} user={selectedUser} onSuccess={refresh} />

      <AlertDialog open={!!userToDelete} onOpenChange={(o) => !o && setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {userToDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Their login is removed permanently and they lose access to every branch. Records they
              created stay. To just stop them signing in (and free the seat) while keeping the
              account, deactivate instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>{t('cancel') || 'Cancel'}</AlertDialogCancel>
            {userToDelete?.isActive && canEdit && (
              <Button
                variant="outline"
                onClick={() => {
                  const u = userToDelete;
                  setUserToDelete(null);
                  if (u) setActive(u, false);
                }}
              >
                Deactivate instead
              </Button>
            )}
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('delete') || 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
