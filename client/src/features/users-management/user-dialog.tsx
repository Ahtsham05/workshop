import { useEffect } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { User, useCreateUserMutation, useUpdateUserMutation } from '@/stores/users.api';
import { useGetRolesQuery } from '@/stores/roles.api';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/context/language-context';
import toast from 'react-hot-toast';

interface UserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
  onSuccess: () => void;
}

interface UserFormValues {
  name: string;
  email: string;
  password?: string;
  role: string;
  isActive: boolean;
}

const userSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.string().min(1, 'Role is required'),
  isActive: z.boolean(),
});

const userUpdateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').optional().or(z.literal('')),
  role: z.string().min(1, 'Role is required'),
  isActive: z.boolean(),
});

export function UserDialog({ open, onOpenChange, user, onSuccess }: UserDialogProps) {
  const { t } = useLanguage();
  const isEdit = !!user;

  const { data: rolesData } = useGetRolesQuery({ page: 1, limit: 100 });
  const [createUser, { isLoading: isCreating }] = useCreateUserMutation();
  const [updateUser, { isLoading: isUpdating }] = useUpdateUserMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<UserFormValues>({
    resolver: zodResolver(isEdit ? userUpdateSchema : userSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      role: '',
      isActive: true,
    },
  });

  useEffect(() => {
    if (user) {
      reset({
        name: user.name,
        email: user.email,
        password: '',
        role: user.role?.id || '',
        isActive: user.isActive,
      });
    } else {
      reset({
        name: '',
        email: '',
        password: '',
        role: '',
        isActive: true,
      });
    }
  }, [user, reset]);

  const onSubmit: SubmitHandler<UserFormValues> = async (data) => {
    try {
      if (isEdit && user) {
        const updateData: any = {
          name: data.name,
          email: data.email,
          role: data.role,
          isActive: data.isActive,
        };
        if (data.password && data.password.trim() !== '') {
          updateData.password = data.password;
        }
        await updateUser({ id: user.id, data: updateData }).unwrap();
        toast.success(t('user_updated_successfully') || 'User updated successfully');
      } else {
        const createData = {
          name: data.name,
          email: data.email,
          password: data.password || '',
          role: data.role,
          isActive: data.isActive,
        };
        await createUser(createData).unwrap();
        toast.success(t('user_created_successfully') || 'User created successfully');
      }
      onSuccess();
      onOpenChange(false);
      reset();
    } catch (error: any) {
      toast.error(error?.data?.message || t('failed_to_save_user') || 'Failed to save user');
    }
  };

  const roleValue = watch('role');
  const isActiveValue = watch('isActive');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('edit_user') || 'Edit User' : t('create_user') || 'Create User'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? t('edit_user_description') || 'Update user information and assign a role'
              : t('create_user_description') || 'Add a new user to the system and assign a role'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('name') || 'Name'}</Label>
            <Input
              id="name"
              {...register('name')}
              placeholder={t('enter_user_name') || 'Enter user name'}
            />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">{t('email') || 'Email'}</Label>
            <Input
              id="email"
              type="email"
              {...register('email')}
              placeholder={t('enter_email') || 'Enter email'}
            />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">
              {isEdit ? t('new_password') || 'New Password (optional)' : t('password') || 'Password'}
            </Label>
            <Input
              id="password"
              type="password"
              {...register('password')}
              placeholder={isEdit ? t('leave_blank_to_keep') || 'Leave blank to keep current' : t('enter_password') || 'Enter password'}
            />
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">{t('role') || 'Role'}</Label>
            <Select value={roleValue} onValueChange={(value) => setValue('role', value)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('select_role') || 'Select a role'} />
              </SelectTrigger>
              <SelectContent>
                {rolesData?.results?.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.role && <p className="text-sm text-destructive">{errors.role.message}</p>}
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="isActive">{t('active') || 'Active'}</Label>
            <Switch
              id="isActive"
              checked={isActiveValue}
              onCheckedChange={(checked) => setValue('isActive', checked)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
      </DialogContent>
    </Dialog>
  );
}
