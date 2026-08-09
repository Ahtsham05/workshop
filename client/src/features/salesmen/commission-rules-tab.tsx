import { useMemo, useState } from 'react';
import {
  useGetCommissionRulesQuery,
  useDeleteCommissionRuleMutation,
  useLazyResolveCommissionRateQuery,
  CommissionRule,
  CommissionModule,
  COMMISSION_MODULES,
} from '@/stores/commissionRule.api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGetAllSalesmanProfilesQuery } from '@/stores/salesmanProfile.api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Calculator } from 'lucide-react';
import { CommissionRuleDialog } from './commission-rule-dialog';
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

function moduleLabel(module: CommissionRule['module']): string {
  if (!module) return 'All Modules';
  return COMMISSION_MODULES.find((m) => m.value === module)?.label || module;
}

function scopeLabel(rule: CommissionRule): string {
  if (rule.scope === 'salesman') {
    const s = rule.salesmanUserId;
    return typeof s === 'string' ? 'Salesman' : s?.name || 'Salesman';
  }
  if (rule.scope === 'branch') {
    const b = rule.branchId;
    return typeof b === 'string' ? 'Branch' : b?.name || 'Branch';
  }
  return 'Organization default';
}

export function CommissionRulesTab() {
  const { t } = useLanguage();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<CommissionRule | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<CommissionRule | null>(null);
  const [previewSalesmanId, setPreviewSalesmanId] = useState('');
  const [previewModule, setPreviewModule] = useState<CommissionModule | '__all__'>('__all__');

  const { data, isLoading, refetch } = useGetCommissionRulesQuery({ page: 1, limit: 100 });
  const [deleteRule, { isLoading: isDeleting }] = useDeleteCommissionRuleMutation();
  const { data: salesmen } = useGetAllSalesmanProfilesQuery({ status: 'active' });
  const [resolveRate, { data: previewResult, isFetching: isPreviewing }] = useLazyResolveCommissionRateQuery();

  const rules = data?.results || [];

  const salesmanOptions = useMemo(
    () =>
      (salesmen || []).map((s) => ({
        value: typeof s.userId === 'string' ? s.userId : s.userId.id,
        label: typeof s.userId === 'string' ? s.salesmanCode : s.userId.name,
        sublabel: s.salesmanCode,
      })),
    [salesmen]
  );

  const handleCreate = () => {
    setSelectedRule(null);
    setDialogOpen(true);
  };

  const handleEdit = (rule: CommissionRule) => {
    setSelectedRule(rule);
    setDialogOpen(true);
  };

  const handleDeleteClick = (rule: CommissionRule) => {
    setRuleToDelete(rule);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!ruleToDelete) return;
    try {
      await deleteRule(ruleToDelete.id).unwrap();
      toast.success(t('commission_rule_deleted_successfully') || 'Commission rule deleted successfully');
      refetch();
    } catch (error: any) {
      toast.error(error?.data?.message || t('failed_to_delete_commission_rule') || 'Failed to delete commission rule');
    } finally {
      setDeleteDialogOpen(false);
      setRuleToDelete(null);
    }
  };

  const sourceLabel: Record<string, string> = {
    salesman: t('salesman_specific_rule') || 'Salesman-specific rule',
    branch: t('branch_rule') || 'Branch rule',
    organization: t('organization_rule') || 'Organization default rule',
    profile_default: t('salesman_profile_default') || "Salesman's own default rate",
    none: t('no_rule_configured') || 'No rule configured',
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">{t('test_resolved_rate') || 'Test: What rate applies right now?'}</CardTitle>
          </div>
          <CardDescription>
            {t('test_resolved_rate_description') ||
              'Pick a salesman to see which rule (if any) currently sets their commission rate.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-64">
              <SearchableSelect
                options={salesmanOptions}
                value={previewSalesmanId}
                onValueChange={setPreviewSalesmanId}
                placeholder={t('select_salesman') || 'Select a salesman...'}
              />
            </div>
            <div className="w-full sm:w-52">
              <Select value={previewModule} onValueChange={(v) => setPreviewModule(v as CommissionModule | '__all__')}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t('all_modules') || 'General (no module)'}</SelectItem>
                  {COMMISSION_MODULES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              disabled={!previewSalesmanId || isPreviewing}
              onClick={() =>
                resolveRate({
                  salesmanUserId: previewSalesmanId,
                  module: previewModule === '__all__' ? undefined : previewModule,
                })
              }
            >
              {isPreviewing ? t('checking') || 'Checking...' : t('check_rate') || 'Check Rate'}
            </Button>
            {previewResult && (
              <div className="text-sm">
                <span className="font-semibold text-lg">{previewResult.rate}%</span>{' '}
                <span className="text-muted-foreground">— {sourceLabel[previewResult.source]}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t('all_commission_rules') || 'All Commission Rules'}</CardTitle>
              <CardDescription>
                {t('commission_rules_list_description') ||
                  'Salesman-specific rules beat branch rules, which beat the organization default'}
              </CardDescription>
            </div>
            <Can permission="manageCommissionRules">
              <Button onClick={handleCreate}>
                <Plus className="w-4 h-4 mr-2" />
                {t('add_commission_rule') || 'Add Rule'}
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
                    <TableHead>{t('applies_to') || 'Applies To'}</TableHead>
                    <TableHead>{t('module') || 'Module'}</TableHead>
                    <TableHead>{t('commission_rate') || 'Rate'}</TableHead>
                    <TableHead>{t('effective_from') || 'From'}</TableHead>
                    <TableHead>{t('effective_to') || 'To'}</TableHead>
                    <TableHead>{t('status') || 'Status'}</TableHead>
                    <TableHead className="text-right">{t('actions') || 'Actions'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="capitalize">
                            {rule.scope}
                          </Badge>
                          {scopeLabel(rule)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={rule.module ? 'outline' : 'secondary'}>{moduleLabel(rule.module)}</Badge>
                      </TableCell>
                      <TableCell>{rule.rate}%</TableCell>
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
                          <Can permission="manageCommissionRules">
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
                        {t('no_commission_rules_found') ||
                          'No rules yet — salesmen fall back to their own default commission rate.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CommissionRuleDialog open={dialogOpen} onOpenChange={setDialogOpen} rule={selectedRule} onSuccess={refetch} />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete_commission_rule') || 'Delete Commission Rule'}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('delete_commission_rule_confirmation') ||
                'Are you sure you want to delete this commission rule? This action cannot be undone.'}
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
