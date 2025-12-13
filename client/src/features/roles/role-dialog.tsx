import { useEffect } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Role, useCreateRoleMutation, useUpdateRoleMutation } from '@/stores/roles.api';
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
import { useLanguage } from '@/context/language-context';
import toast from 'react-hot-toast';

const roleSchema = z.object({
  name: z.string().min(1, 'Role name is required'),
  description: z.string(),
  isActive: z.boolean(),
});

type RoleFormValues = {
  name: string;
  description: string;
  isActive: boolean;
};

interface RoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role | null;
  onSuccess: () => void;
}

export function RoleDialog({ open, onOpenChange, role, onSuccess }: RoleDialogProps) {
  const { t } = useLanguage();
  const isEdit = !!role;

  const [createRole, { isLoading: isCreating }] = useCreateRoleMutation();
  const [updateRole, { isLoading: isUpdating }] = useUpdateRoleMutation();

  const form = useForm<RoleFormValues>({
    resolver: zodResolver(roleSchema),
    defaultValues: {
      name: '',
      description: '',
      isActive: true,
    },
    mode: 'onChange',
  });

  useEffect(() => {
    if (role) {
      form.reset({
        name: role.name,
        description: role.description || '',
        isActive: role.isActive,
      });
    } else {
      form.reset({
        name: '',
        description: '',
        isActive: true,
      });
    }
  }, [role, form]);

  const onSubmit: SubmitHandler<RoleFormValues> = async (data) => {
    try {
      if (isEdit && role) {
        await updateRole({ id: role.id, data }).unwrap();
        toast.success(t('role_updated_successfully') || 'Role updated successfully');
      } else {
        await createRole(data).unwrap();
        toast.success(t('role_created_successfully') || 'Role created successfully');
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
          <DialogTitle>{isEdit ? t('edit_role') || 'Edit Role' : t('create_role') || 'Create Role'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? t('Edit Role Description') || 'Update role information. Permissions can be managed separately.'
              : t('Create Role Description') || 'Create a new role. You can set permissions after creation.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('role_name') || 'Role Name'} *</FormLabel>
                  <FormControl>
                    <Input placeholder={t('enter_role_name') || 'Enter role name'} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('description') || 'Description'}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t('enter_role_description') || 'Enter role description'}
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('Role Description Hint') || 'Brief description of the role and its purpose'}
                  </FormDescription>
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
                    <FormLabel className="text-base">{t('Active Status') || 'Active Status'}</FormLabel>
                    <FormDescription>
                      {t('Active Status Description') || 'Inactive roles cannot be assigned to users'}
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
