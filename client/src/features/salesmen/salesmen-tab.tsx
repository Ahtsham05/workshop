import { useState } from 'react';
import {
  useGetSalesmanProfilesQuery,
  useDeleteSalesmanProfileMutation,
  SalesmanProfile,
} from '@/stores/salesmanProfile.api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, UserCheck } from 'lucide-react';
import { SalesmanDialog } from './salesman-dialog';
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

function linkedUserEmail(ref: SalesmanProfile['userId']): string {
  return ref && typeof ref !== 'string' ? ref.email : '';
}

export function SalesmenTab() {
  const { t } = useLanguage();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<SalesmanProfile | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [profileToDelete, setProfileToDelete] = useState<SalesmanProfile | null>(null);

  const { data, isLoading, refetch } = useGetSalesmanProfilesQuery({ page: 1, limit: 100 });
  const [deleteProfile, { isLoading: isDeleting }] = useDeleteSalesmanProfileMutation();

  const profiles = data?.results || [];
  const existingUserIds = profiles
    .filter((p) => p.userId)
    .map((p) => (typeof p.userId === 'string' ? p.userId : p.userId!.id));

  const handleCreate = () => {
    setSelectedProfile(null);
    setDialogOpen(true);
  };

  const handleEdit = (profile: SalesmanProfile) => {
    setSelectedProfile(profile);
    setDialogOpen(true);
  };

  const handleDeleteClick = (profile: SalesmanProfile) => {
    setProfileToDelete(profile);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!profileToDelete) return;
    try {
      await deleteProfile(profileToDelete.id).unwrap();
      toast.success(t('salesman_deleted_successfully') || 'Salesman deleted successfully');
      refetch();
    } catch (error: any) {
      toast.error(error?.data?.message || t('failed_to_delete_salesman') || 'Failed to delete salesman');
    } finally {
      setDeleteDialogOpen(false);
      setProfileToDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Can permission="createSalesmen">
          <Button onClick={handleCreate}>
            <Plus className="w-4 h-4 mr-2" />
            {t('add_salesman') || 'Add Salesman'}
          </Button>
        </Can>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('all_salesmen') || 'All Salesmen'}</CardTitle>
          <CardDescription>
            {t('salesmen_list_description') || 'Every staff login tracked as a salesman, and their commission rate'}
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
                    <TableHead>{t('code') || 'Code'}</TableHead>
                    <TableHead>{t('name') || 'Name'}</TableHead>
                    <TableHead>{t('phone') || 'Phone'}</TableHead>
                    <TableHead>{t('default_commission_rate') || 'Commission Rate'}</TableHead>
                    <TableHead>{t('status') || 'Status'}</TableHead>
                    <TableHead className="text-right">{t('actions') || 'Actions'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map((profile) => (
                    <TableRow key={profile.id}>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {profile.salesmanCode}
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <UserCheck className="w-4 h-4 text-primary" />
                          <div>
                            <div className="flex items-center gap-2">
                              {profile.name}
                              {profile.userId ? (
                                <Badge variant="outline" className="text-xs font-normal">
                                  {t('linked') || 'Linked'}
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs font-normal">
                                  {t('standalone') || 'Standalone'}
                                </Badge>
                              )}
                            </div>
                            {linkedUserEmail(profile.userId) && (
                              <div className="text-xs text-muted-foreground">{linkedUserEmail(profile.userId)}</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{profile.phone || '-'}</TableCell>
                      <TableCell>{profile.defaultCommissionRate}%</TableCell>
                      <TableCell>
                        {profile.status === 'active' ? (
                          <Badge variant="default">{t('active') || 'Active'}</Badge>
                        ) : (
                          <Badge variant="secondary">{t('inactive') || 'Inactive'}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Can permission="editSalesmen">
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(profile)} title={t('edit') || 'Edit'}>
                              <Edit className="w-4 h-4" />
                            </Button>
                          </Can>
                          <Can permission="deleteSalesmen">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteClick(profile)}
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
                  {profiles.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {t('no_salesmen_found') || 'No salesmen yet — add one from your existing staff.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <SalesmanDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        profile={selectedProfile}
        existingUserIds={existingUserIds}
        onSuccess={refetch}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete_salesman') || 'Delete Salesman'}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('delete_salesman_confirmation') ||
                `Are you sure you want to remove "${profileToDelete?.name ?? ''}" as a salesman? This action cannot be undone.`}
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
