import { useEffect, useMemo, useState } from 'react';
import {
  useGetProfitShareRulesQuery,
  useDeleteProfitShareRuleMutation,
  useLazyResolveProfitShareRulesQuery,
  PartnerProfitShareRule,
} from '@/stores/partnerProfitShareRule.api';
import { useGetAllPartnersQuery } from '@/stores/partner.api';
import { useSearchProductsQuery } from '@/stores/product.api';
import { useGetProductVariantsQuery } from '@/stores/productVariant.api';
import { useGetBatchesForVariantQuery } from '@/stores/batch.api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Search } from 'lucide-react';
import { ProfitShareRuleDialog } from './profit-share-rule-dialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useLanguage } from '@/context/language-context';
import { Can } from '@/context/permission-context';
import { format } from 'date-fns';
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

function partnerLabel(ref: PartnerProfitShareRule['partnerId']): string {
  return typeof ref === 'string' ? ref : ref.name;
}

function scopeLabel(rule: PartnerProfitShareRule): string {
  if (rule.scope === 'batch') {
    const b = rule.batchId;
    return typeof b === 'string' ? 'Batch' : b?.batchNumber || 'Batch';
  }
  if (rule.scope === 'variant') {
    const v = rule.variantId;
    return typeof v === 'string' ? 'Variant' : Object.values(v?.attributes || {}).join(' / ') || v?.sku || 'Variant';
  }
  if (rule.scope === 'product') {
    const p = rule.productId;
    return typeof p === 'string' ? 'Product' : p?.name || 'Product';
  }
  if (rule.scope === 'branch') {
    const b = rule.branchId;
    return typeof b === 'string' ? 'Branch' : b?.name || 'Branch';
  }
  return 'Organization-wide';
}

function rateLabel(rule: PartnerProfitShareRule): string {
  return rule.shareType === 'percentage_of_profit' ? `${rule.rate}% of profit` : `Rs ${rule.rate} / unit`;
}

export function ProfitShareRulesTab() {
  const { t } = useLanguage();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<PartnerProfitShareRule | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<PartnerProfitShareRule | null>(null);
  const [previewProductId, setPreviewProductId] = useState('');
  const [previewVariantId, setPreviewVariantId] = useState('');
  const [previewBatchId, setPreviewBatchId] = useState('');

  const { data, isLoading, refetch } = useGetProfitShareRulesQuery({ page: 1, limit: 100 });
  const [deleteRule, { isLoading: isDeleting }] = useDeleteProfitShareRuleMutation();
  const { data: partners } = useGetAllPartnersQuery({ isActive: true });
  const { data: productsData } = useSearchProductsQuery({ limit: 200 });
  const { data: previewVariantsData } = useGetProductVariantsQuery(previewProductId, { skip: !previewProductId });
  const { data: previewBatchesData } = useGetBatchesForVariantQuery(previewVariantId, { skip: !previewVariantId });
  const [resolveRules, { data: previewResult, isFetching: isPreviewing }] = useLazyResolveProfitShareRulesQuery();

  const rules = data?.results || [];

  const productOptions = useMemo(
    () => (productsData?.results || []).map((p) => ({ value: (p.id || p._id) as string, label: p.name })),
    [productsData]
  );

  const previewVariantOptions = useMemo(
    () =>
      (previewVariantsData || [])
        .filter((v) => !v.isDefault)
        .map((v) => {
          const id = (v._id || v.id) as string;
          const label = Object.values(v.attributes || {}).join(' / ') || v.sku || id;
          return { value: id, label };
        }),
    [previewVariantsData]
  );

  const previewBatchOptions = useMemo(
    () =>
      (previewBatchesData || []).map((b) => {
        const id = (b._id || b.id) as string;
        const expiry = b.expiryDate ? ` · exp ${new Date(b.expiryDate).toLocaleDateString()}` : '';
        return { value: id, label: `${b.batchNumber} · ${b.quantity} left${expiry}` };
      }),
    [previewBatchesData]
  );

  // A simple product with batch/expiry tracking has no real variant to pick — it has
  // exactly one hidden "default" variant, filtered out of previewVariantOptions above.
  // Resolve it silently so batches for these products can still be previewed, instead of
  // the variant step (and therefore the batch step) never appearing at all.
  useEffect(() => {
    if (!previewProductId || previewVariantOptions.length > 0) return;
    const defaultVariant = (previewVariantsData || []).find((v) => v.isDefault);
    const defaultId = defaultVariant ? ((defaultVariant._id || defaultVariant.id) as string) : '';
    if (defaultId && previewVariantId !== defaultId) {
      setPreviewVariantId(defaultId);
    }
  }, [previewProductId, previewVariantOptions, previewVariantsData, previewVariantId]);

  const partnerNameById = useMemo(() => {
    const map = new Map<string, string>();
    (partners || []).forEach((p) => map.set(p.id, p.name));
    return map;
  }, [partners]);

  const handleCreate = () => {
    setSelectedRule(null);
    setDialogOpen(true);
  };

  const handleEdit = (rule: PartnerProfitShareRule) => {
    setSelectedRule(rule);
    setDialogOpen(true);
  };

  const handleDeleteClick = (rule: PartnerProfitShareRule) => {
    setRuleToDelete(rule);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!ruleToDelete) return;
    try {
      await deleteRule(ruleToDelete.id).unwrap();
      toast.success(t('profit_share_rule_deleted_successfully') || 'Profit-share rule deleted successfully');
      refetch();
    } catch (error: any) {
      toast.error(error?.data?.message || t('failed_to_delete_rule') || 'Failed to delete rule');
    } finally {
      setDeleteDialogOpen(false);
      setRuleToDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">{t('preview_active_claims') || 'Preview: who currently earns from this?'}</CardTitle>
          </div>
          <CardDescription>
            {t('preview_active_claims_description') ||
              'Pick a product to see every partner currently entitled to a share when it sells, plus any organization/branch-wide partners.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-64">
              <SearchableSelect
                options={productOptions}
                value={previewProductId}
                onValueChange={(value) => {
                  setPreviewProductId(value);
                  setPreviewVariantId('');
                  setPreviewBatchId('');
                }}
                placeholder={t('select_product') || 'Select a product...'}
                clearLabel={t('none') || 'None'}
              />
            </div>
            {previewProductId && previewVariantOptions.length > 0 && (
              <div className="w-full sm:w-56">
                <SearchableSelect
                  options={previewVariantOptions}
                  value={previewVariantId}
                  onValueChange={(value) => {
                    setPreviewVariantId(value);
                    setPreviewBatchId('');
                  }}
                  placeholder={t('select_variant') || 'Select a variant...'}
                  clearLabel={t('none') || 'None'}
                />
              </div>
            )}
            {previewVariantId && previewBatchOptions.length > 0 && (
              <div className="w-full sm:w-56">
                <SearchableSelect
                  options={previewBatchOptions}
                  value={previewBatchId}
                  onValueChange={setPreviewBatchId}
                  placeholder={t('select_batch') || 'Select a batch...'}
                  clearLabel={t('none') || 'None'}
                />
              </div>
            )}
            <Button
              variant="outline"
              disabled={isPreviewing}
              onClick={() =>
                resolveRules({
                  productId: previewProductId || undefined,
                  variantId: previewVariantId || undefined,
                  batchId: previewBatchId || undefined,
                })
              }
            >
              {isPreviewing ? t('checking') || 'Checking...' : t('check') || 'Check'}
            </Button>
          </div>
          {previewResult && (
            <div className="mt-4 space-y-2 text-sm">
              {[
                ...(previewResult.productRules || []),
                ...(previewResult.variantRules || []),
                ...(previewResult.batchRules || []),
                ...previewResult.orgRules,
              ].length === 0 ? (
                <p className="text-muted-foreground">
                  {t('no_active_claims') || 'No partner currently has an active claim here.'}
                </p>
              ) : (
                <>
                  {(previewResult.productRules || []).map((r) => (
                    <div key={r.ruleId} className="flex items-center gap-2">
                      <Badge variant="outline">{t('product') || 'Product'}</Badge>
                      <span>{partnerNameById.get(r.partnerId) || r.partnerId}</span>
                      <span className="text-muted-foreground">
                        — {r.shareType === 'percentage_of_profit' ? `${r.rate}%` : `Rs ${r.rate}/unit`}
                      </span>
                    </div>
                  ))}
                  {(previewResult.variantRules || []).map((r) => (
                    <div key={r.ruleId} className="flex items-center gap-2">
                      <Badge variant="outline">{t('variant') || 'Variant'}</Badge>
                      <span>{partnerNameById.get(r.partnerId) || r.partnerId}</span>
                      <span className="text-muted-foreground">
                        — {r.shareType === 'percentage_of_profit' ? `${r.rate}%` : `Rs ${r.rate}/unit`}
                      </span>
                    </div>
                  ))}
                  {(previewResult.batchRules || []).map((r) => (
                    <div key={r.ruleId} className="flex items-center gap-2">
                      <Badge variant="outline">{t('batch') || 'Batch'}</Badge>
                      <span>{partnerNameById.get(r.partnerId) || r.partnerId}</span>
                      <span className="text-muted-foreground">
                        — {r.shareType === 'percentage_of_profit' ? `${r.rate}%` : `Rs ${r.rate}/unit`}
                      </span>
                    </div>
                  ))}
                  {previewResult.orgRules.map((r) => (
                    <div key={r.ruleId} className="flex items-center gap-2">
                      <Badge variant="secondary">{r.scope === 'branch' ? t('branch') || 'Branch' : t('organization') || 'Organization'}</Badge>
                      <span>{partnerNameById.get(r.partnerId) || r.partnerId}</span>
                      <span className="text-muted-foreground">
                        — {r.shareType === 'percentage_of_profit' ? `${r.rate}%` : `Rs ${r.rate}/unit`}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t('all_profit_share_rules') || 'All Profit-Share Rules'}</CardTitle>
              <CardDescription>
                {t('profit_share_rules_list_description') ||
                  'Several partners can independently earn on the same product or the same organization — they are not mutually exclusive.'}
              </CardDescription>
            </div>
            <Can permission="managePartnerProfitShareRules">
              <Button onClick={handleCreate}>
                <Plus className="w-4 h-4 mr-2" />
                {t('add_rule') || 'Add Rule'}
              </Button>
            </Can>
          </div>
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
                    <TableHead>{t('partner') || 'Partner'}</TableHead>
                    <TableHead>{t('applies_to') || 'Applies To'}</TableHead>
                    <TableHead>{t('rate') || 'Rate'}</TableHead>
                    <TableHead>{t('effective_from') || 'From'}</TableHead>
                    <TableHead>{t('effective_to') || 'To'}</TableHead>
                    <TableHead>{t('status') || 'Status'}</TableHead>
                    <TableHead className="text-right">{t('actions') || 'Actions'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-medium">{partnerLabel(rule.partnerId)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="capitalize">
                            {rule.scope}
                          </Badge>
                          {scopeLabel(rule)}
                        </div>
                      </TableCell>
                      <TableCell>{rateLabel(rule)}</TableCell>
                      <TableCell>{format(new Date(rule.effectiveFrom), 'MMM dd, yyyy')}</TableCell>
                      <TableCell>{rule.effectiveTo ? format(new Date(rule.effectiveTo), 'MMM dd, yyyy') : '—'}</TableCell>
                      <TableCell>
                        {rule.isActive ? (
                          <Badge variant="default">{t('active') || 'Active'}</Badge>
                        ) : (
                          <Badge variant="secondary">{t('inactive') || 'Inactive'}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Can permission="managePartnerProfitShareRules">
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(rule)} title={t('edit') || 'Edit'}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteClick(rule)}
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
                  {rules.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        {t('no_rules_found') || 'No profit-share rules yet — add one to start crediting a partner.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ProfitShareRuleDialog open={dialogOpen} onOpenChange={setDialogOpen} rule={selectedRule} onSuccess={refetch} />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete_rule') || 'Delete Profit-Share Rule'}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('delete_rule_confirmation') ||
                'Are you sure you want to delete this rule? Past ledger entries it already created are not affected — only future sales stop crediting this partner.'}
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
