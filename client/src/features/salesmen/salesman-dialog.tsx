import { useEffect, useMemo } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  SalesmanProfile,
  useCreateSalesmanProfileMutation,
  useUpdateSalesmanProfileMutation,
} from '@/stores/salesmanProfile.api';
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
import { useLanguage } from '@/context/language-context';
import toast from 'react-hot-toast';

const salesmanSchema = z.object({
  userId: z.string().min(1, 'Select a staff user'),
  phone: z.string(),
  cnic: z.string(),
  defaultCommissionRate: z.coerce.number().min(0).max(100),
  isActive: z.boolean(),
  notes: z.string(),
});

type SalesmanFormValues = z.infer<typeof salesmanSchema>;

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

  const { data: usersData } = useGetUsersQuery({ limit: 200 }, { skip: !open });
  const [createProfile, { isLoading: isCreating }] = useCreateSalesmanProfileMutation();
  const [updateProfile, { isLoading: isUpdating }] = useUpdateSalesmanProfileMutation();

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
      userId: '',
      phone: '',
      cnic: '',
      defaultCommissionRate: 0,
      isActive: true,
      notes: '',
    },
    mode: 'onChange',
  });

  useEffect(() => {
    if (profile) {
      form.reset({
        userId: typeof profile.userId === 'string' ? profile.userId : profile.userId.id,
        phone: profile.phone || '',
        cnic: profile.cnic || '',
        defaultCommissionRate: profile.defaultCommissionRate ?? 0,
        isActive: profile.status !== 'inactive',
        notes: profile.notes || '',
      });
    } else {
      form.reset({
        userId: '',
        phone: '',
        cnic: '',
        defaultCommissionRate: 0,
        isActive: true,
        notes: '',
      });
    }
  }, [profile, form]);

  const onSubmit: SubmitHandler<SalesmanFormValues> = async (data) => {
    try {
      const body = {
        phone: data.phone,
        cnic: data.cnic,
        defaultCommissionRate: data.defaultCommissionRate,
        status: (data.isActive ? 'active' : 'inactive') as 'active' | 'inactive',
        notes: data.notes,
      };
      if (isEdit && profile) {
        await updateProfile({ id: profile.id, data: body }).unwrap();
        toast.success(t('salesman_updated_successfully') || 'Salesman updated successfully');
      } else {
        await createProfile({ userId: data.userId, ...body }).unwrap();
        toast.success(t('salesman_created_successfully') || 'Salesman created successfully');
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
          <DialogTitle>{isEdit ? t('edit_salesman') || 'Edit Salesman' : t('add_salesman') || 'Add Salesman'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? t('edit_salesman_description') || 'Update this salesman’s commission profile.'
              : t('add_salesman_description') || 'Turn an existing staff login into a salesman with a commission profile.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                  <FormLabel>{t('default_commission_rate') || 'Default Commission Rate (%)'}</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} max={100} step="0.1" {...field} />
                  </FormControl>
                  <FormDescription>
                    {t('default_commission_rate_hint') ||
                      '% of the sale amount this salesman earns, used when no more specific rule applies.'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

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
