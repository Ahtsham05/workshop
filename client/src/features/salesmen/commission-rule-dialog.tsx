import { useEffect, useMemo } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  CommissionRule,
  CommissionRuleScope,
  useCreateCommissionRuleMutation,
  useUpdateCommissionRuleMutation,
} from '@/stores/commissionRule.api';
import { useGetAllSalesmanProfilesQuery } from '@/stores/salesmanProfile.api';
import { useGetBranchesQuery } from '@/stores/branch.api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useLanguage } from '@/context/language-context';
import toast from 'react-hot-toast';

const ruleSchema = z
  .object({
    scope: z.enum(['organization', 'branch', 'salesman']),
    branchId: z.string(),
    salesmanUserId: z.string(),
    rate: z.coerce.number().min(0).max(100),
    effectiveFrom: z.string().min(1, 'Effective from date is required'),
    effectiveTo: z.string(),
    isActive: z.boolean(),
    notes: z.string(),
  })
  .refine((data) => data.scope !== 'branch' || !!data.branchId, {
    message: 'Select a branch',
    path: ['branchId'],
  })
  .refine((data) => data.scope !== 'salesman' || !!data.salesmanUserId, {
    message: 'Select a salesman',
    path: ['salesmanUserId'],
  });

type RuleFormValues = z.infer<typeof ruleSchema>;

const toDateInput = (value?: string | null) => (value ? value.slice(0, 10) : '');

interface CommissionRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: CommissionRule | null;
  onSuccess: () => void;
}

export function CommissionRuleDialog({ open, onOpenChange, rule, onSuccess }: CommissionRuleDialogProps) {
  const { t } = useLanguage();
  const isEdit = !!rule;

  const { data: salesmen } = useGetAllSalesmanProfilesQuery({ status: 'active' }, { skip: !open });
  const { data: branchesData } = useGetBranchesQuery({ limit: 100 }, { skip: !open });
  const [createRule, { isLoading: isCreating }] = useCreateCommissionRuleMutation();
  const [updateRule, { isLoading: isUpdating }] = useUpdateCommissionRuleMutation();

  const salesmanOptions = useMemo(
    () =>
      (salesmen || []).map((s) => ({
        value: typeof s.userId === 'string' ? s.userId : s.userId.id,
        label: typeof s.userId === 'string' ? s.salesmanCode : s.userId.name,
        sublabel: s.salesmanCode,
      })),
    [salesmen]
  );

  const branchOptions = useMemo(
    () => (branchesData?.results || []).map((b) => ({ value: b.id, label: b.name })),
    [branchesData]
  );

  const form = useForm<RuleFormValues>({
    resolver: zodResolver(ruleSchema),
    defaultValues: {
      scope: 'organization',
      branchId: '',
      salesmanUserId: '',
      rate: 0,
      effectiveFrom: toDateInput(new Date().toISOString()),
      effectiveTo: '',
      isActive: true,
      notes: '',
    },
    mode: 'onChange',
  });

  const scope = form.watch('scope');

  useEffect(() => {
    if (rule) {
      form.reset({
        scope: rule.scope,
        branchId: typeof rule.branchId === 'string' ? rule.branchId : rule.branchId?.id || '',
        salesmanUserId: typeof rule.salesmanUserId === 'string' ? rule.salesmanUserId : rule.salesmanUserId?.id || '',
        rate: rule.rate,
        effectiveFrom: toDateInput(rule.effectiveFrom),
        effectiveTo: toDateInput(rule.effectiveTo),
        isActive: rule.isActive,
        notes: rule.notes || '',
      });
    } else {
      form.reset({
        scope: 'organization',
        branchId: '',
        salesmanUserId: '',
        rate: 0,
        effectiveFrom: toDateInput(new Date().toISOString()),
        effectiveTo: '',
        isActive: true,
        notes: '',
      });
    }
  }, [rule, form]);

  const onSubmit: SubmitHandler<RuleFormValues> = async (data) => {
    try {
      if (isEdit && rule) {
        await updateRule({
          id: rule.id,
          data: {
            rate: data.rate,
            effectiveFrom: data.effectiveFrom,
            effectiveTo: data.effectiveTo || null,
            isActive: data.isActive,
            notes: data.notes,
          },
        }).unwrap();
        toast.success(t('commission_rule_updated_successfully') || 'Commission rule updated successfully');
      } else {
        await createRule({
          scope: data.scope,
          branchId: data.scope === 'branch' ? data.branchId : undefined,
          salesmanUserId: data.scope === 'salesman' ? data.salesmanUserId : undefined,
          rate: data.rate,
          effectiveFrom: data.effectiveFrom,
          effectiveTo: data.effectiveTo || null,
          isActive: data.isActive,
          notes: data.notes,
        }).unwrap();
        toast.success(t('commission_rule_created_successfully') || 'Commission rule created successfully');
      }
      onSuccess();
      onOpenChange(false);
      form.reset();
    } catch (error: any) {
      toast.error(error?.data?.message || t('operation_failed') || 'Operation failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('edit_commission_rule') || 'Edit Commission Rule' : t('add_commission_rule') || 'Add Commission Rule'}
          </DialogTitle>
          <DialogDescription>
            {t('commission_rule_description') ||
              'The most specific active rule wins: salesman-specific beats branch, branch beats the organization default.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="scope"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('scope') || 'Applies To'} *</FormLabel>
                  <Select value={field.value} onValueChange={(v) => field.onChange(v as CommissionRuleScope)} disabled={isEdit}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="organization">{t('organization_default') || 'Organization default'}</SelectItem>
                      <SelectItem value="branch">{t('specific_branch') || 'A specific branch'}</SelectItem>
                      <SelectItem value="salesman">{t('specific_salesman') || 'A specific salesman'}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {scope === 'branch' && (
              <FormField
                control={form.control}
                name="branchId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('branch') || 'Branch'} *</FormLabel>
                    <FormControl>
                      <SearchableSelect
                        options={branchOptions}
                        value={field.value}
                        onValueChange={field.onChange}
                        placeholder={t('select_branch') || 'Select a branch...'}
                        disabled={isEdit}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {scope === 'salesman' && (
              <FormField
                control={form.control}
                name="salesmanUserId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('salesman') || 'Salesman'} *</FormLabel>
                    <FormControl>
                      <SearchableSelect
                        options={salesmanOptions}
                        value={field.value}
                        onValueChange={field.onChange}
                        placeholder={t('select_salesman') || 'Select a salesman...'}
                        disabled={isEdit}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="rate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('commission_rate') || 'Commission Rate (%)'} *</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} max={100} step="0.1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="effectiveFrom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('effective_from') || 'Effective From'} *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="effectiveTo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('effective_to') || 'Effective To'}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormDescription>{t('leave_blank_open_ended') || 'Leave blank for open-ended'}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('notes') || 'Notes'}</FormLabel>
                  <FormControl>
                    <Textarea className="resize-none" rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">{t('active_status') || 'Active Status'}</FormLabel>
                    <FormDescription>
                      {t('commission_rule_active_hint') || 'Inactive rules are skipped when resolving a rate.'}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  form.reset();
                }}
              >
                {t('cancel') || 'Cancel'}
              </Button>
              <Button type="submit" disabled={isCreating || isUpdating}>
                {isCreating || isUpdating
                  ? t('saving') || 'Saving...'
                  : isEdit
                  ? t('update') || 'Update'
                  : t('create') || 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
