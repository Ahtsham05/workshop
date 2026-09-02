import { useEffect, useMemo, useState } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  SalesmanProfile,
  useCreateSalesmanProfileMutation,
  useUpdateSalesmanProfileMutation,
} from '@/stores/salesmanProfile.api';
import {
  CommissionModule,
  COMMISSION_MODULES,
  SalesmanModuleRates,
  useLazyGetSalesmanModuleRatesQuery,
  useCreateCommissionRuleMutation,
  useUpdateCommissionRuleMutation,
} from '@/stores/commissionRule.api';
import { useGetUsersQuery } from '@/stores/users.api';
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
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EntityFormSection } from '@/components/entity-form-section';
import { toneColor, type StatCardTone } from '@/lib/stat-card-tones';
import { cn } from '@/lib/utils';
import { useFormatMoney } from '@/lib/format-money';
import { useLanguage } from '@/context/language-context';
import toast from 'react-hot-toast';
import {
  UserCog,
  UserPlus,
  User,
  Users,
  Phone as PhoneIcon,
  IdCard,
  Percent,
  StickyNote,
  ShoppingCart,
  Smartphone,
  Truck,
  Wrench,
  Settings2,
  Info,
  BarChart3,
  type LucideIcon,
} from 'lucide-react';

const salesmanSchema = z
  .object({
    mode: z.enum(['link', 'standalone']),
    userId: z.string(),
    name: z.string(),
    phone: z.string(),
    cnic: z.string(),
    defaultCommissionRate: z.coerce.number().min(0).max(100),
    moduleRates: z.record(z.string()),
    isActive: z.boolean(),
    notes: z.string(),
  })
  .refine((data) => data.mode !== 'link' || !!data.userId, {
    message: 'Select a staff user',
    path: ['userId'],
  })
  .refine((data) => data.mode !== 'standalone' || data.name.trim().length > 0, {
    message: 'Enter a name',
    path: ['name'],
  });

type SalesmanFormValues = z.infer<typeof salesmanSchema>;

/** Per-module override that already exists for this salesman, as of dialog open — used
 * both to prefill the fields and to know whether clearing one should deactivate a rule
 * rather than just leaving a blank input. */
type ModuleOverrides = Partial<Record<CommissionModule, { rate: number; ruleId: string | null }>>;

const emptyModuleRates = (): Record<CommissionModule, string> =>
  Object.fromEntries(COMMISSION_MODULES.map((m) => [m.value, ''])) as Record<CommissionModule, string>;

/** Icon + accent color shown beside each module in the rate table — purely cosmetic. */
const MODULE_VISUALS: Record<CommissionModule, { icon: LucideIcon; tone: StatCardTone }> = {
  Invoice: { icon: ShoppingCart, tone: 'emerald' },
  SimSale: { icon: Smartphone, tone: 'sky' },
  LoadTransaction: { icon: Truck, tone: 'orange' },
  RepairJob: { icon: Wrench, tone: 'violet' },
  ServiceInvoice: { icon: Settings2, tone: 'rose' },
};

/** Base amount the "preview" column and Summary Preview card apply rates to — an example,
 * not a real transaction; purely to make abstract percentages feel concrete while editing. */
const PREVIEW_BASE_AMOUNT = 1000;

interface SalesmanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: SalesmanProfile | null;
  /** userIds that already have a salesman profile — excluded from the picker on create. */
  existingUserIds: string[];
  onSuccess: () => void;
}

export function SalesmanDialog({ open, onOpenChange, profile, existingUserIds, onSuccess }: SalesmanDialogProps) {
  const { t } = useLanguage();
  const formatRs = useFormatMoney();
  const isEdit = !!profile;
  const [overrides, setOverrides] = useState<ModuleOverrides>({});

  const { data: usersData } = useGetUsersQuery({ limit: 200 }, { skip: !open });
  const [createProfile, { isLoading: isCreating }] = useCreateSalesmanProfileMutation();
  const [updateProfile, { isLoading: isUpdating }] = useUpdateSalesmanProfileMutation();
  const [fetchModuleRates, { isFetching: isLoadingRates }] = useLazyGetSalesmanModuleRatesQuery();
  const [createRule, { isLoading: isCreatingRule }] = useCreateCommissionRuleMutation();
  const [updateRule, { isLoading: isUpdatingRule }] = useUpdateCommissionRuleMutation();

  const userOptions = useMemo(() => {
    const users = usersData?.results || [];
    const excluded = new Set(existingUserIds);
    return users
      .filter((u) => isEdit || !excluded.has(u.id))
      .map((u) => ({ value: u.id, label: u.name, sublabel: u.email, picture: null }));
  }, [usersData, existingUserIds, isEdit]);

  const form = useForm<SalesmanFormValues>({
    resolver: zodResolver(salesmanSchema),
    defaultValues: {
      mode: 'link',
      userId: '',
      name: '',
      phone: '',
      cnic: '',
      defaultCommissionRate: 0,
      moduleRates: emptyModuleRates(),
      isActive: true,
      notes: '',
    },
    mode: 'onChange',
  });

  const mode = form.watch('mode');
  const watchedGeneralRate = form.watch('defaultCommissionRate');
  const watchedModuleRates = form.watch('moduleRates');
  const watchedNotes = form.watch('notes');

  /** Effective rate per module (explicit override, else the general fallback) plus what
   * that rate would earn on the example base amount — drives the rate table's preview
   * column and the Summary Preview card below it. */
  const moduleRatePreview = useMemo(() => {
    return COMMISSION_MODULES.map((m) => {
      const raw = watchedModuleRates?.[m.value];
      const parsed = raw === '' || raw === undefined || raw === null ? NaN : Number(raw);
      const rate = Number.isFinite(parsed) ? parsed : Number(watchedGeneralRate) || 0;
      return { module: m, rate, previewAmount: (PREVIEW_BASE_AMOUNT * rate) / 100 };
    });
  }, [watchedModuleRates, watchedGeneralRate]);

  const highestModule = moduleRatePreview.reduce((a, b) => (b.rate > a.rate ? b : a), moduleRatePreview[0]);
  const lowestModule = moduleRatePreview.reduce((a, b) => (b.rate < a.rate ? b : a), moduleRatePreview[0]);

  useEffect(() => {
    if (!open) return;

    if (profile) {
      const hasUserId = !!profile.userId;
      const userId = hasUserId ? (typeof profile.userId === 'string' ? profile.userId : profile.userId!.id) : '';
      form.reset({
        mode: hasUserId ? 'link' : 'standalone',
        userId,
        name: profile.name || '',
        phone: profile.phone || '',
        cnic: profile.cnic || '',
        defaultCommissionRate: profile.defaultCommissionRate ?? 0,
        moduleRates: emptyModuleRates(),
        isActive: profile.status !== 'inactive',
        notes: profile.notes || '',
      });
      setOverrides({});

      // Only prefill a module field when this salesman has an EXPLICIT rule for that
      // module (source === 'salesman') — otherwise the field should stay blank, since it
      // just means "inherits the general/branch/org rate", not "this salesman's rate is X".
      fetchModuleRates({ salesmanId: profile.id })
        .unwrap()
        .then((rates: SalesmanModuleRates) => {
          const nextOverrides: ModuleOverrides = {};
          const nextModuleRates = emptyModuleRates();
          for (const m of COMMISSION_MODULES) {
            const resolved = rates[m.value];
            if (resolved?.source === 'salesman') {
              nextOverrides[m.value] = { rate: resolved.rate, ruleId: resolved.ruleId };
              nextModuleRates[m.value] = String(resolved.rate);
            }
          }
          setOverrides(nextOverrides);
          form.setValue('moduleRates', nextModuleRates);
        })
        .catch(() => {});
    } else {
      form.reset({
        mode: 'link',
        userId: '',
        name: '',
        phone: '',
        cnic: '',
        defaultCommissionRate: 0,
        moduleRates: emptyModuleRates(),
        isActive: true,
        notes: '',
      });
      setOverrides({});
    }
  }, [profile, open, form, fetchModuleRates]);

  /** After the profile is saved, reconcile the 5 module-rate fields against whatever
   * salesman-specific rules already exist — create/replace when a field has a new value,
   * deactivate the existing rule when a field that had one is cleared back to blank. */
  const syncModuleRates = async (salesmanId: string, moduleRates: Record<string, string>) => {
    await Promise.all(
      COMMISSION_MODULES.map(async (m) => {
        const raw = moduleRates[m.value];
        const value = raw === '' || raw === undefined ? null : Number(raw);
        const existing = overrides[m.value];

        if (value !== null && value > 0) {
          if (existing && existing.rate === value) return; // unchanged
          await createRule({
            scope: 'salesman',
            salesmanId,
            module: m.value,
            rate: value,
          }).unwrap();
        } else if (existing?.ruleId) {
          await updateRule({ id: existing.ruleId, data: { isActive: false } }).unwrap();
        }
      })
    );
  };

  const onSubmit: SubmitHandler<SalesmanFormValues> = async (data) => {
    try {
      const commonFields = {
        phone: data.phone,
        cnic: data.cnic,
        defaultCommissionRate: data.defaultCommissionRate,
        status: (data.isActive ? 'active' : 'inactive') as 'active' | 'inactive',
        notes: data.notes,
      };
      if (isEdit && profile) {
        // userId is immutable after creation — never sent on update. name is only
        // caller-editable for a standalone salesman (a linked salesman's name stays a
        // snapshot of their User's name).
        await updateProfile({
          id: profile.id,
          data: { ...commonFields, ...(data.mode === 'standalone' ? { name: data.name.trim() } : {}) },
        }).unwrap();
        await syncModuleRates(profile.id, data.moduleRates);
        toast.success(t('salesman_updated_successfully') || 'Salesman updated successfully');
      } else {
        const created = await createProfile({
          ...commonFields,
          ...(data.mode === 'link' ? { userId: data.userId } : { name: data.name.trim() }),
        }).unwrap();
        await syncModuleRates(created.id, data.moduleRates);
        toast.success(t('salesman_created_successfully') || 'Salesman created successfully');
      }
      onSuccess();
      onOpenChange(false);
      form.reset();
    } catch (error: any) {
      toast.error(error?.data?.message || t('operation_failed') || 'Operation failed');
    }
  };

  const isSaving = isCreating || isUpdating || isCreatingRule || isUpdatingRule;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[96vh] w-[calc(100vw-1.25rem)] max-w-[calc(100vw-1.25rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1040px]">
        <DialogHeader className="shrink-0 flex-row items-start gap-3 space-y-0 border-b border-border/60 px-6 py-3 text-left">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            {isEdit ? <UserCog className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
          </span>
          <div className="space-y-1">
            <DialogTitle className="text-xl">
              {isEdit ? t('edit_salesman') || 'Edit Salesman' : t('add_salesman') || 'Add Salesman'}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? t('edit_salesman_description') || 'Update this salesman’s commission profile.'
                : t('add_salesman_description') ||
                  'Link an existing staff login, or add a salesman with no login of their own.'}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3">
          <Form {...form}>
            <form id="salesman-form" onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 lg:grid-cols-2 lg:items-start">
              <div className="space-y-4">
                <EntityFormSection
                  icon={<UserCog />}
                  tone="sky"
                  className="p-3 sm:p-4"
                  title={t('salesman_section_identity')}
                  description={t('salesman_section_identity_desc')}
                >
                  <Tabs
                    value={mode}
                    onValueChange={(v) => form.setValue('mode', v as 'link' | 'standalone', { shouldValidate: true })}
                  >
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="link" disabled={isEdit}>
                        <Users />
                        {t('link_existing_user') || 'Link Existing User'}
                      </TabsTrigger>
                      <TabsTrigger value="standalone" disabled={isEdit}>
                        <UserPlus />
                        {t('new_salesman') || 'New Salesman'}
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="link" className="pt-4">
                      <FormField
                        control={form.control}
                        name="userId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('staff_user') || 'Staff User'} *</FormLabel>
                            <FormControl>
                              <SearchableSelect
                                options={userOptions}
                                value={field.value}
                                onValueChange={field.onChange}
                                placeholder={t('select_staff_user') || 'Select a staff user...'}
                                searchPlaceholder={t('search_users') || 'Search users...'}
                                emptyText={t('no_eligible_users') || 'No eligible users (already salesmen, or none exist)'}
                                disabled={isEdit}
                              />
                            </FormControl>
                            <FormDescription>
                              {t('staff_user_hint') ||
                                'Their existing login is reused — this just adds a commission profile on top.'}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TabsContent>

                    <TabsContent value="standalone" className="pt-4">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('name') || 'Name'} *</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                  placeholder={t('enter_salesman_name') || 'Enter salesman name'}
                                  className="pl-9"
                                  {...field}
                                />
                              </div>
                            </FormControl>
                            <FormDescription>
                              {t('standalone_salesman_hint') ||
                                'No login of their own — a cashier will attribute sales to them by name.'}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TabsContent>
                  </Tabs>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('phone') || 'Phone'}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <PhoneIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                              <Input
                                fieldType="phone"
                                placeholder={t('enter_phone') || 'Enter phone'}
                                className="pl-9"
                                {...field}
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="cnic"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('cnic') || 'CNIC'}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <IdCard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                              <Input
                                fieldType="cnic"
                                placeholder={t('enter_cnic') || 'Enter CNIC'}
                                className="pl-9"
                                {...field}
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </EntityFormSection>

                <EntityFormSection
                  icon={<StickyNote />}
                  tone="slate"
                  className="p-3 sm:p-4"
                  title={t('salesman_section_notes')}
                  description={t('salesman_section_notes_desc')}
                >
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('notes') || 'Notes'}</FormLabel>
                        <FormControl>
                          <Textarea className="resize-none" rows={2} maxLength={500} {...field} />
                        </FormControl>
                        <div className="flex justify-end">
                          <span className="text-xs text-muted-foreground">{watchedNotes?.length ?? 0}/500</span>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('status') || 'Status'}</FormLabel>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => field.onChange(true)}
                            className={cn(
                              'rounded-lg border p-3 text-left transition-colors',
                              field.value
                                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                                : 'border-border/60 hover:bg-muted/40'
                            )}
                          >
                            <div className="flex items-center gap-2 text-sm font-medium">
                              <span
                                className={cn(
                                  'h-2 w-2 rounded-full',
                                  field.value ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                                )}
                              />
                              {t('active') || 'Active'}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {t('salesman_active_hint') || 'Salesman can be assigned to new sales.'}
                            </p>
                          </button>
                          <button
                            type="button"
                            onClick={() => field.onChange(false)}
                            className={cn(
                              'rounded-lg border p-3 text-left transition-colors',
                              !field.value
                                ? 'border-slate-400 bg-slate-50 dark:bg-slate-900/40'
                                : 'border-border/60 hover:bg-muted/40'
                            )}
                          >
                            <div className="flex items-center gap-2 text-sm font-medium">
                              <span
                                className={cn(
                                  'h-2 w-2 rounded-full',
                                  !field.value ? 'bg-slate-500' : 'bg-muted-foreground/40'
                                )}
                              />
                              {t('inactive') || 'Inactive'}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {t('salesman_active_status_hint') || 'Inactive salesmen can’t be assigned to new sales.'}
                            </p>
                          </button>
                        </div>
                      </FormItem>
                    )}
                  />
                </EntityFormSection>
              </div>

              <EntityFormSection
                icon={<Percent />}
                tone="emerald"
                className="p-3 sm:p-4"
                title={t('salesman_section_commission')}
                description={t('salesman_section_commission_desc')}
              >
                <FormField
                  control={form.control}
                  name="defaultCommissionRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('general_commission_rate') || 'General Rate (%)'}</FormLabel>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                        <FormControl>
                          <div className="relative w-full sm:max-w-[160px]">
                            <Input type="number" min={0} max={100} step="0.1" className="pr-9" {...field} />
                            <span className="pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-md border-l border-border/60 bg-muted text-xs font-medium text-muted-foreground">
                              %
                            </span>
                          </div>
                        </FormControl>
                        <FormDescription className="sm:flex-1 sm:pt-2.5">
                          {t('general_commission_rate_hint') ||
                            'Fallback used for any module below that’s left blank (and not covered by a branch/organization rule).'}
                        </FormDescription>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="overflow-hidden rounded-lg border border-border/60">
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="px-2 py-1.5">{t('salesman_module_rate_table_module')}</TableHead>
                        <TableHead className="w-[5.5rem] px-2 py-1.5">{t('salesman_module_rate_table_rate')}</TableHead>
                        <TableHead className="w-24 px-2 py-1.5 text-right">
                          {t('salesman_module_rate_table_preview')}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {moduleRatePreview.map(({ module: m, previewAmount }) => {
                        const visual = MODULE_VISUALS[m.value];
                        const Icon = visual.icon;
                        return (
                          <TableRow key={m.value}>
                            <TableCell className="px-2 py-1.5">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <span
                                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white [&_svg]:h-3 [&_svg]:w-3"
                                  style={{ backgroundColor: toneColor(visual.tone) }}
                                >
                                  <Icon />
                                </span>
                                <span className="truncate text-sm">{m.label}</span>
                              </div>
                            </TableCell>
                            <TableCell className="px-2 py-1.5">
                              <FormField
                                control={form.control}
                                name={`moduleRates.${m.value}`}
                                render={({ field }) => (
                                  <FormItem className="gap-0">
                                    <FormControl>
                                      <Input
                                        type="number"
                                        min={0}
                                        max={100}
                                        step="0.1"
                                        placeholder="—"
                                        className="h-8 w-16 px-1.5 text-center"
                                        showVoiceInput={false}
                                        {...field}
                                      />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                            <TableCell className="px-2 py-1.5 text-right text-xs font-medium text-emerald-600 dark:text-emerald-400">
                              {formatRs(previewAmount)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  {isLoadingRates && (
                    <p className="border-t border-border/60 px-2 py-1 text-xs text-muted-foreground">
                      {t('loading') || 'loading...'}
                    </p>
                  )}
                </div>

                <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-2.5">
                  <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <p>{t('salesman_preview_base_note', { amount: formatRs(PREVIEW_BASE_AMOUNT) })}</p>
                  </div>
                  <div className="flex items-center gap-1.5 border-t border-border/60 pt-2">
                    <span
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white [&_svg]:h-3 [&_svg]:w-3"
                      style={{ backgroundColor: toneColor('violet') }}
                    >
                      <BarChart3 />
                    </span>
                    <p className="text-sm font-medium">{t('salesman_summary_preview_title')}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">{t('salesman_summary_general_rate')}</p>
                      <p className="font-semibold text-sky-600 dark:text-sky-400">
                        {(Number(watchedGeneralRate) || 0).toFixed(2)}%
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{t('salesman_summary_highest_module')}</p>
                      <p className="truncate font-semibold text-emerald-600 dark:text-emerald-400">
                        {highestModule.module.label} ({highestModule.rate.toFixed(2)}%)
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{t('salesman_summary_lowest_module')}</p>
                      <p className="truncate font-semibold text-amber-600 dark:text-amber-400">
                        {lowestModule.module.label} ({lowestModule.rate.toFixed(2)}%)
                      </p>
                    </div>
                  </div>
                </div>
              </EntityFormSection>
            </form>
          </Form>
        </div>

        <DialogFooter className="shrink-0 border-t border-border/60 bg-background/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
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
          <Button type="submit" form="salesman-form" disabled={isSaving} className="gap-1.5">
            {isSaving ? (
              t('saving') || 'Saving...'
            ) : (
              <>
                {isEdit ? <UserCog className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                {isEdit ? t('update') || 'Update' : t('create') || 'Create'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
