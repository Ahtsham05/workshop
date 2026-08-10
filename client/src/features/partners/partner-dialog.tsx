import { useEffect, useMemo } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Partner, useCreatePartnerMutation, useUpdatePartnerMutation } from '@/stores/partner.api';
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

const partnerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  partnerType: z.enum(['business_partner', 'product_investor']),
  branchId: z.string(),
  phone: z.string(),
  email: z.string(),
  cnic: z.string(),
  address: z.string(),
  isActive: z.boolean(),
  notes: z.string(),
});

type PartnerFormValues = z.infer<typeof partnerSchema>;

interface PartnerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partner: Partner | null;
  onSuccess: () => void;
}

export function PartnerDialog({ open, onOpenChange, partner, onSuccess }: PartnerDialogProps) {
  const { t } = useLanguage();
  const isEdit = !!partner;

  const { data: branchesData } = useGetBranchesQuery({ limit: 100 }, { skip: !open });
  const [createPartner, { isLoading: isCreating }] = useCreatePartnerMutation();
  const [updatePartner, { isLoading: isUpdating }] = useUpdatePartnerMutation();

  const branchOptions = useMemo(
    () => (branchesData?.results || []).map((b) => ({ value: b.id, label: b.name })),
    [branchesData]
  );

  const form = useForm<PartnerFormValues>({
    resolver: zodResolver(partnerSchema),
    defaultValues: {
      name: '',
      partnerType: 'business_partner',
      branchId: '',
      phone: '',
      email: '',
      cnic: '',
      address: '',
      isActive: true,
      notes: '',
    },
    mode: 'onChange',
  });

  useEffect(() => {
    if (!open) return;
    if (partner) {
      form.reset({
        name: partner.name,
        partnerType: partner.partnerType,
        branchId: typeof partner.branchId === 'string' ? partner.branchId : partner.branchId?.id || '',
        phone: partner.phone || '',
        email: partner.email || '',
        cnic: partner.cnic || '',
        address: partner.address || '',
        isActive: partner.isActive,
        notes: partner.notes || '',
      });
    } else {
      form.reset({
        name: '',
        partnerType: 'business_partner',
        branchId: '',
        phone: '',
        email: '',
        cnic: '',
        address: '',
        isActive: true,
        notes: '',
      });
    }
  }, [partner, open, form]);

  const onSubmit: SubmitHandler<PartnerFormValues> = async (data) => {
    try {
      const body = {
        name: data.name,
        partnerType: data.partnerType,
        branchId: data.branchId || null,
        phone: data.phone,
        email: data.email,
        cnic: data.cnic,
        address: data.address,
        isActive: data.isActive,
        notes: data.notes,
      };
      if (isEdit && partner) {
        await updatePartner({ id: partner.id, data: body }).unwrap();
        toast.success(t('partner_updated_successfully') || 'Partner updated successfully');
      } else {
        await createPartner(body).unwrap();
        toast.success(t('partner_created_successfully') || 'Partner created successfully');
      }
      onSuccess();
      onOpenChange(false);
      form.reset();
    } catch (error: any) {
      toast.error(error?.data?.message || t('operation_failed') || 'Operation failed');
    }
  };

  const isSaving = isCreating || isUpdating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('edit_partner') || 'Edit Partner' : t('add_partner') || 'Add Partner'}</DialogTitle>
          <DialogDescription>
            {t('add_partner_description') ||
              'A business partner or product investor entitled to a share of profit — set up their profit-share rules separately once they’re added.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('name') || 'Name'} *</FormLabel>
                  <FormControl>
                    <Input placeholder={t('enter_name') || 'Enter name'} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="partnerType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('partner_type') || 'Type'}</FormLabel>
                  <Select value={field.value} onValueChange={(v) => field.onChange(v as 'business_partner' | 'product_investor')}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="business_partner">{t('business_partner') || 'Business Partner'}</SelectItem>
                      <SelectItem value="product_investor">{t('product_investor') || 'Product Investor'}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {t('partner_type_hint') ||
                      'Just a label for your own organization — a partner’s actual profit share is set up separately as one or more rules.'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="branchId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('branch') || 'Branch'}</FormLabel>
                  <FormControl>
                    <SearchableSelect
                      options={branchOptions}
                      value={field.value}
                      onValueChange={field.onChange}
                      placeholder={t('organization_wide') || 'Organization-wide'}
                      clearLabel={t('organization_wide') || 'Organization-wide'}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('partner_branch_hint') || 'Leave blank if this partner isn’t tied to one specific branch.'}
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
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('email') || 'Email'}</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder={t('enter_email') || 'Enter email'} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
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
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('address') || 'Address'}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('enter_address') || 'Enter address'} {...field} />
                    </FormControl>
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
                      {t('partner_active_status_hint') || 'Inactive partners are hidden from new rule pickers.'}
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
