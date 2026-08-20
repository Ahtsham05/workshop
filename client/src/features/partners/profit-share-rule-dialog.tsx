import { useEffect, useMemo } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  PartnerProfitShareRule,
  ProfitShareRuleScope,
  ProfitShareType,
  useCreateProfitShareRuleMutation,
  useUpdateProfitShareRuleMutation,
} from '@/stores/partnerProfitShareRule.api';
import { useGetAllPartnersQuery } from '@/stores/partner.api';
import { useGetBranchesQuery } from '@/stores/branch.api';
import { useSearchProductsQuery } from '@/stores/product.api';
import { useGetProductVariantsQuery } from '@/stores/productVariant.api';
import { useGetBatchesForVariantQuery } from '@/stores/batch.api';
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
    partnerId: z.string().min(1, 'Select a partner'),
    scope: z.enum(['organization', 'branch', 'product', 'variant', 'batch']),
    branchId: z.string(),
    productId: z.string(),
    variantId: z.string(),
    batchId: z.string(),
    shareType: z.enum(['percentage_of_profit', 'fixed_per_unit']),
    rate: z.coerce.number().min(0),
    effectiveFrom: z.string().min(1, 'Effective from date is required'),
    effectiveTo: z.string(),
    isActive: z.boolean(),
    notes: z.string(),
  })
  .refine((data) => data.scope !== 'branch' || !!data.branchId, {
    message: 'Select a branch',
    path: ['branchId'],
  })
  .refine((data) => !['product', 'variant', 'batch'].includes(data.scope) || !!data.productId, {
    message: 'Select a product',
    path: ['productId'],
  })
  .refine((data) => !['variant', 'batch'].includes(data.scope) || !!data.variantId, {
    message: 'Select a variant',
    path: ['variantId'],
  })
  .refine((data) => data.scope !== 'batch' || !!data.batchId, {
    message: 'Select a batch',
    path: ['batchId'],
  })
  .refine((data) => data.shareType !== 'percentage_of_profit' || data.rate <= 100, {
    message: 'A percentage-of-profit rate cannot exceed 100',
    path: ['rate'],
  });

type RuleFormValues = z.infer<typeof ruleSchema>;

const toDateInput = (value?: string | null) => (value ? value.slice(0, 10) : '');

interface ProfitShareRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: PartnerProfitShareRule | null;
  onSuccess: () => void;
}

export function ProfitShareRuleDialog({ open, onOpenChange, rule, onSuccess }: ProfitShareRuleDialogProps) {
  const { t } = useLanguage();
  const isEdit = !!rule;

  const { data: partners } = useGetAllPartnersQuery({ isActive: true }, { skip: !open });
  const { data: branchesData } = useGetBranchesQuery({ limit: 100 }, { skip: !open });
  const { data: productsData } = useSearchProductsQuery({ limit: 200 }, { skip: !open });
  const [createRule, { isLoading: isCreating }] = useCreateProfitShareRuleMutation();
  const [updateRule, { isLoading: isUpdating }] = useUpdateProfitShareRuleMutation();

  const partnerOptions = useMemo(
    () => (partners || []).map((p) => ({ value: p.id, label: p.name, sublabel: p.partnerType === 'product_investor' ? 'Investor' : 'Partner' })),
    [partners]
  );

  const branchOptions = useMemo(
    () => (branchesData?.results || []).map((b) => ({ value: b.id, label: b.name })),
    [branchesData]
  );

  const form = useForm<RuleFormValues>({
    resolver: zodResolver(ruleSchema),
    defaultValues: {
      partnerId: '',
      scope: 'product',
      branchId: '',
      productId: '',
      variantId: '',
      batchId: '',
      shareType: 'percentage_of_profit',
      rate: 0,
      effectiveFrom: toDateInput(new Date().toISOString()),
      effectiveTo: '',
      isActive: true,
      notes: '',
    },
    mode: 'onChange',
  });

  const scope = form.watch('scope');
  const shareType = form.watch('shareType');
  const productId = form.watch('productId');
  const variantId = form.watch('variantId');

  const needsVariant = scope === 'variant' || scope === 'batch';
  const needsBatch = scope === 'batch';

  // Only products that can actually support the chosen scope — a "specific variant" rule
  // is meaningless on a product with no real variants, and a "specific batch" rule needs
  // either real variants or batch/expiry tracking turned on. Prevents the dead-end where
  // picking a product with nothing to drill into next leaves an empty picker.
  const productOptions = useMemo(() => {
    const results = productsData?.results || [];
    // In edit mode the product picker is disabled/locked to the rule's existing target,
    // so the eligibility filter would only risk hiding that product from its own picker
    // (showing a blank placeholder) if its tracking flags changed after the rule was
    // created — skip filtering there since nothing is actually selectable anyway.
    const eligible = isEdit
      ? results
      : results.filter((p) => {
          if (scope === 'variant') return !!p.hasVariants;
          if (scope === 'batch') return !!p.hasVariants || !!p.trackBatch || !!p.trackExpiry;
          return true;
        });
    return eligible.map((p) => ({
      value: (p.id || p._id) as string,
      label: p.name,
      sublabel: p.hasVariants ? 'Has variants' : p.trackBatch || p.trackExpiry ? 'Batch tracked' : undefined,
    }));
  }, [productsData, scope]);

  const selectedProduct = useMemo(
    () => (productsData?.results || []).find((p) => (p.id || p._id) === productId),
    [productsData, productId]
  );
  const productHasVariants = !!selectedProduct?.hasVariants;
  // A simple product with batch/expiry tracking turned on still has exactly one
  // ProductVariant behind the scenes (its hidden "default" variant) — batches live on
  // that, but there's nothing meaningful for the user to pick between, so scope='batch'
  // skips the variant step entirely for these and resolves it automatically below.
  const productIsSimpleTracked = !!selectedProduct && !selectedProduct.hasVariants && !!(selectedProduct.trackBatch || selectedProduct.trackExpiry);

  const { data: variantsData } = useGetProductVariantsQuery(productId, { skip: !open || !needsVariant || !productId });
  const { data: batchesData } = useGetBatchesForVariantQuery(variantId, { skip: !open || !needsBatch || !variantId });

  const realVariants = useMemo(() => (variantsData || []).filter((v) => !v.isDefault), [variantsData]);
  const variantOptions = useMemo(
    () =>
      realVariants.map((v) => {
        const id = (v._id || v.id) as string;
        const label = Object.values(v.attributes || {}).join(' / ') || v.sku || id;
        return { value: id, label };
      }),
    [realVariants]
  );

  const batchOptions = useMemo(
    () =>
      (batchesData || []).map((b) => {
        const id = (b._id || b.id) as string;
        const expiry = b.expiryDate ? ` · exp ${new Date(b.expiryDate).toLocaleDateString()}` : '';
        return { value: id, label: `${b.batchNumber} · ${b.quantity} left${expiry}` };
      }),
    [batchesData]
  );

  // Simple batch-tracked product under scope='batch': silently resolve variantId to its
  // one hidden default variant the moment it loads, so the batch picker can go straight
  // from Product to Batch without ever showing a one-item "Variant" step.
  useEffect(() => {
    if (!needsBatch || !productIsSimpleTracked) return;
    const defaultVariant = (variantsData || []).find((v) => v.isDefault);
    const defaultId = defaultVariant ? ((defaultVariant._id || defaultVariant.id) as string) : '';
    if (defaultId && form.getValues('variantId') !== defaultId) {
      form.setValue('variantId', defaultId);
    }
  }, [needsBatch, productIsSimpleTracked, variantsData, form]);

  useEffect(() => {
    if (rule) {
      form.reset({
        partnerId: typeof rule.partnerId === 'string' ? rule.partnerId : rule.partnerId.id,
        scope: rule.scope,
        branchId: typeof rule.branchId === 'string' ? rule.branchId : rule.branchId?.id || '',
        productId: typeof rule.productId === 'string' ? rule.productId : rule.productId?.id || '',
        variantId: typeof rule.variantId === 'string' ? rule.variantId : rule.variantId?.id || '',
        batchId: typeof rule.batchId === 'string' ? rule.batchId : rule.batchId?.id || '',
        shareType: rule.shareType,
        rate: rule.rate,
        effectiveFrom: toDateInput(rule.effectiveFrom),
        effectiveTo: toDateInput(rule.effectiveTo),
        isActive: rule.isActive,
        notes: rule.notes || '',
      });
    } else {
      form.reset({
        partnerId: '',
        scope: 'product',
        branchId: '',
        productId: '',
        variantId: '',
        batchId: '',
        shareType: 'percentage_of_profit',
        rate: 0,
        effectiveFrom: toDateInput(new Date().toISOString()),
        effectiveTo: '',
        isActive: true,
        notes: '',
      });
    }
  }, [rule, open, form]);

  const onSubmit: SubmitHandler<RuleFormValues> = async (data) => {
    try {
      if (isEdit && rule) {
        await updateRule({
          id: rule.id,
          data: {
            shareType: data.shareType,
            rate: data.rate,
            effectiveFrom: data.effectiveFrom,
            effectiveTo: data.effectiveTo || null,
            isActive: data.isActive,
            notes: data.notes,
          },
        }).unwrap();
        toast.success(t('profit_share_rule_updated_successfully') || 'Profit-share rule updated successfully');
      } else {
        await createRule({
          partnerId: data.partnerId,
          scope: data.scope,
          branchId: data.scope === 'branch' ? data.branchId : undefined,
          productId: ['product', 'variant', 'batch'].includes(data.scope) ? data.productId : undefined,
          variantId: ['variant', 'batch'].includes(data.scope) ? data.variantId : undefined,
          batchId: data.scope === 'batch' ? data.batchId : undefined,
          shareType: data.shareType,
          rate: data.rate,
          effectiveFrom: data.effectiveFrom,
          effectiveTo: data.effectiveTo || null,
          isActive: data.isActive,
          notes: data.notes,
        }).unwrap();
        toast.success(t('profit_share_rule_created_successfully') || 'Profit-share rule created successfully');
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
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('edit_rule') || 'Edit Profit-Share Rule' : t('add_rule') || 'Add Profit-Share Rule'}
          </DialogTitle>
          <DialogDescription>
            {t('profit_share_rule_description') ||
              'Several partners can hold independent rules on the same product or the same organization — all of them earn on the same sale.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="partnerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('partner') || 'Partner'} *</FormLabel>
                  <FormControl>
                    <SearchableSelect
                      options={partnerOptions}
                      value={field.value}
                      onValueChange={field.onChange}
                      placeholder={t('select_partner') || 'Select a partner...'}
                      disabled={isEdit}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="scope"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('applies_to') || 'Applies To'} *</FormLabel>
                  <Select value={field.value} onValueChange={(v) => field.onChange(v as ProfitShareRuleScope)} disabled={isEdit}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="product">{t('a_specific_product') || 'A specific product'}</SelectItem>
                      <SelectItem value="variant">{t('a_specific_variant') || 'A specific product variant'}</SelectItem>
                      <SelectItem value="batch">{t('a_specific_batch') || 'A specific batch / lot'}</SelectItem>
                      <SelectItem value="branch">{t('a_specific_branch') || 'A specific branch (all products)'}</SelectItem>
                      <SelectItem value="organization">{t('whole_organization') || 'The whole organization'}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {(scope === 'product' || needsVariant) && (
              <FormField
                control={form.control}
                name="productId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('product') || 'Product'} *</FormLabel>
                    <FormControl>
                      <SearchableSelect
                        options={productOptions}
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value);
                          // Switching the product invalidates whatever variant/batch was
                          // already picked for the old one.
                          form.setValue('variantId', '');
                          form.setValue('batchId', '');
                        }}
                        placeholder={t('select_product') || 'Select a product...'}
                        disabled={isEdit}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {needsVariant && productId && productHasVariants && (
              <FormField
                control={form.control}
                name="variantId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('variant') || 'Variant'} *</FormLabel>
                    <FormControl>
                      <SearchableSelect
                        options={variantOptions}
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value);
                          form.setValue('batchId', '');
                        }}
                        placeholder={t('select_variant') || 'Select a variant...'}
                        disabled={isEdit}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {needsBatch && productId && productIsSimpleTracked && !variantId && (
              <p className="text-sm text-muted-foreground">{t('loading_batches') || 'Loading batches...'}</p>
            )}

            {needsBatch && variantId && (
              <FormField
                control={form.control}
                name="batchId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('batch') || 'Batch / Lot'} *</FormLabel>
                    <FormControl>
                      <SearchableSelect
                        options={batchOptions}
                        value={field.value}
                        onValueChange={field.onChange}
                        placeholder={t('select_batch') || 'Select a batch...'}
                        disabled={isEdit}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

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

            <FormField
              control={form.control}
              name="shareType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('share_type') || 'Share Type'}</FormLabel>
                  <Select value={field.value} onValueChange={(v) => field.onChange(v as ProfitShareType)}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="percentage_of_profit">{t('percentage_of_profit') || '% of profit'}</SelectItem>
                      <SelectItem value="fixed_per_unit">{t('fixed_per_unit') || 'Fixed amount per unit sold'}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="rate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {shareType === 'percentage_of_profit' ? t('rate_percent') || 'Rate (%)' : t('rate_per_unit') || 'Rate (Rs / unit)'} *
                  </FormLabel>
                  <FormControl>
                    <Input type="number" min={0} max={shareType === 'percentage_of_profit' ? 100 : undefined} step="0.01" {...field} />
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
                      {t('rule_active_status_hint') || 'Inactive rules are skipped — no future sale credits this partner.'}
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
