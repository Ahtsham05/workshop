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
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLanguage } from '@/context/language-context';
import toast from 'react-hot-toast';

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
      .map((u) => ({ value: u.id, label: u.name, sublabel: u.email }));
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
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('edit_salesman') || 'Edit Salesman' : t('add_salesman') || 'Add Salesman'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? t('edit_salesman_description') || 'Update this salesman’s commission profile.'
              : t('add_salesman_description') ||
                'Link an existing staff login, or add a salesman with no login of their own.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <Tabs
              value={mode}
              onValueChange={(v) => form.setValue('mode', v as 'link' | 'standalone', { shouldValidate: true })}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="link" disabled={isEdit}>
                  {t('link_existing_user') || 'Link Existing User'}
                </TabsTrigger>
                <TabsTrigger value="standalone" disabled={isEdit}>
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
                        <Input placeholder={t('enter_salesman_name') || 'Enter salesman name'} {...field} />
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
                      <Input placeholder={t('enter_phone') || 'Enter phone'} {...field} />
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
                      <Input placeholder={t('enter_cnic') || 'Enter CNIC'} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="defaultCommissionRate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('general_commission_rate') || 'General Rate (%)'}</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} max={100} step="0.1" {...field} />
                  </FormControl>
                  <FormDescription>
                    {t('general_commission_rate_hint') ||
                      'Fallback used for any module below that’s left blank (and not covered by a branch/organization rule).'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="rounded-lg border p-4 space-y-3">
              <div>
                <p className="text-sm font-medium">{t('commission_rates_by_module') || 'Commission Rates by Module'}</p>
                <p className="text-xs text-muted-foreground">
                  {t('commission_rates_by_module_hint') ||
                    'Set a different rate per module — leave blank to use the General Rate above. e.g. Sales 1%, Services 2.5%.'}
                  {isLoadingRates && ` (${t('loading') || 'loading...'})`}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {COMMISSION_MODULES.map((m) => (
                  <FormField
                    key={m.value}
                    control={form.control}
                    name={`moduleRates.${m.value}`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">{m.label}</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} max={100} step="0.1" placeholder="—" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                ))}
              </div>
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
                      {t('salesman_active_status_hint') || 'Inactive salesmen can’t be assigned to new sales.'}
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
              <Button type="submit" disabled={isSaving}>
                {isSaving ? t('saving') || 'Saving...' : isEdit ? t('update') || 'Update' : t('create') || 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
