import { useState } from 'react';
import { useGetPartnersQuery, useDeletePartnerMutation, Partner } from '@/stores/partner.api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, HandCoins } from 'lucide-react';
import { PartnerDialog } from './partner-dialog';
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

const PARTNER_TYPE_LABEL: Record<Partner['partnerType'], string> = {
  business_partner: 'Business Partner',
  product_investor: 'Product Investor',
};

export function PartnersTab() {
  const { t } = useLanguage();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [partnerToDelete, setPartnerToDelete] = useState<Partner | null>(null);

  const { data, isLoading, refetch } = useGetPartnersQuery({ page: 1, limit: 100 });
  const [deletePartner, { isLoading: isDeleting }] = useDeletePartnerMutation();

  const partners = data?.results || [];

  const handleCreate = () => {
    setSelectedPartner(null);
    setDialogOpen(true);
  };

  const handleEdit = (partner: Partner) => {
    setSelectedPartner(partner);
    setDialogOpen(true);
  };

  const handleDeleteClick = (partner: Partner) => {
    setPartnerToDelete(partner);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!partnerToDelete) return;
    try {
      await deletePartner(partnerToDelete.id).unwrap();
      toast.success(t('partner_deleted_successfully') || 'Partner deleted successfully');
      refetch();
    } catch (error: any) {
      toast.error(error?.data?.message || t('failed_to_delete_partner') || 'Failed to delete partner');
    } finally {
      setDeleteDialogOpen(false);
      setPartnerToDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Can permission="createPartners">
          <Button onClick={handleCreate}>
            <Plus className="w-4 h-4 mr-2" />
            {t('add_partner') || 'Add Partner'}
          </Button>
        </Can>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('all_partners') || 'All Partners'}</CardTitle>
          <CardDescription>
            {t('partners_list_description') || 'Business partners and product investors entitled to a share of profit'}
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
                    <TableHead>{t('type') || 'Type'}</TableHead>
                    <TableHead>{t('phone') || 'Phone'}</TableHead>
                    <TableHead>{t('email') || 'Email'}</TableHead>
                    <TableHead>{t('status') || 'Status'}</TableHead>
                    <TableHead className="text-right">{t('actions') || 'Actions'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partners.map((partner) => (
                    <TableRow key={partner.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <HandCoins className="w-4 h-4 text-primary" />
                          {partner.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{PARTNER_TYPE_LABEL[partner.partnerType]}</Badge>
                      </TableCell>
                      <TableCell>{partner.phone || '-'}</TableCell>
                      <TableCell>{partner.email || '-'}</TableCell>
                      <TableCell>
                        {partner.isActive ? (
                          <Badge variant="default">{t('active') || 'Active'}</Badge>
                        ) : (
                          <Badge variant="secondary">{t('inactive') || 'Inactive'}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Can permission="editPartners">
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(partner)} title={t('edit') || 'Edit'}>
                              <Edit className="w-4 h-4" />
                            </Button>
                          </Can>
                          <Can permission="deletePartners">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteClick(partner)}
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
                  {partners.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {t('no_partners_found') || 'No partners yet — add a business partner or product investor.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <PartnerDialog open={dialogOpen} onOpenChange={setDialogOpen} partner={selectedPartner} onSuccess={refetch} />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete_partner') || 'Delete Partner'}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('delete_partner_confirmation') ||
                `Are you sure you want to delete "${partnerToDelete?.name}"? This is blocked if they have any profit-share rules or ledger history — deactivate them instead in that case.`}
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
