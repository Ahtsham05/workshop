import { useEffect, useMemo, useState } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useSelector } from 'react-redux';
import { Eye, EyeOff, Wand2, Crown, AlertTriangle } from 'lucide-react';
import { User, useCreateUserMutation, useUpdateUserMutation } from '@/stores/users.api';
import { useGetRolesQuery } from '@/stores/roles.api';
import { useGetMyBranchesQuery } from '@/stores/branch.api';
import type { RootState } from '@/stores/store';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/context/language-context';
import toast from 'react-hot-toast';
import { useFormDraft } from '@/hooks/use-form-draft';
import { FormDraftNotice } from '@/components/form-draft-notice';
import { usePermissions } from '@/context/permission-context';
import { getErrorMessage } from '@/lib/get-error-message';

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
  branchIds: string[];
  isActive: boolean;
}

// Same rule the server enforces (custom.validation#password), so the person sees it
// before submitting rather than as a toast afterwards.
const passwordRule = z
  .string()
  .min(8, 'At least 8 characters')
  .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), 'Use at least one letter and one number');

const base = {
  name: z.string().trim().min(1, 'Name is required'),
  email: z.string().trim().email('Enter a valid email address'),
  role: z.string().min(1, 'Choose what this person can do'),
  branchIds: z.array(z.string()),
  isActive: z.boolean(),
};
const createSchema = z.object({ ...base, password: passwordRule });
const editSchema = z.object({ ...base, password: passwordRule.optional().or(z.literal('')) });

/** Readable, phone-typeable password: no 0/O or 1/l look-alikes. */
function generatePassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
  const digits = '23456789';
  const pick = (set: string) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  return Array.from({ length: 6 }, () => pick(letters)).join('') + pick(digits) + pick(digits);
}

export function UserDialog({ open, onOpenChange, user, onSuccess }: UserDialogProps) {
  const { t } = useLanguage();
  const isEdit = !!user;
  const isOwnerTarget = !!user?.isOwner;
  const me = useSelector((state: RootState) => state.auth.data?.user);
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId);
  const isSelf = !!user && !!me && String(me.id) === String(user.id);
  const iAmOwner = me?.systemRole === 'superAdmin' || me?.systemRole === 'system_admin';
  const { permissions: myPermissions } = usePermissions();
  const [showPassword, setShowPassword] = useState(false);

  const { data: rolesData } = useGetRolesQuery({ page: 1, limit: 100 });
  const { data: branches = [] } = useGetMyBranchesQuery();
  const [createUser, { isLoading: isCreating }] = useCreateUserMutation();
  const [updateUser, { isLoading: isUpdating }] = useUpdateUserMutation();

  const defaultBranchIds = useMemo(() => {
    if (branches.length === 1) return [branches[0].id];
    return activeBranchId && branches.some((b) => b.id === activeBranchId) ? [activeBranchId] : [];
  }, [branches, activeBranchId]);

  const form = useForm<UserFormValues>({
    resolver: zodResolver(isEdit ? editSchema : createSchema),
    defaultValues: { name: '', email: '', password: '', role: '', branchIds: [], isActive: true },
  });
  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = form;

  // Re-seed every time the dialog opens, so re-opening the same person after a cancelled
  // edit shows their saved values, not the abandoned ones.
  useEffect(() => {
    if (!open) return;
    setShowPassword(false);
    if (user) {
      reset({
        name: user.name,
        email: user.email,
        password: '',
        role: user.role?.id || '',
        branchIds: (user.branches ?? []).map((b) => b.id),
        isActive: user.isActive,
      });
    } else {
      reset({ name: '', email: '', password: '', role: '', branchIds: defaultBranchIds, isActive: true });
    }
  }, [open, user, reset, defaultBranchIds]);

  // The password is never part of a draft (see use-form-draft's SENSITIVE_FIELD).
  const draft = useFormDraft(form, { key: 'user', enabled: open && !isEdit, label: 'user' });

  const roleValue = watch('role');
  const branchIds = watch('branchIds');
  const isActiveValue = watch('isActive');
  const selectedRole = rolesData?.results?.find((r) => r.id === roleValue);
  // Mirrors the server rule: you can't hand out a role with access you don't have yourself.
  const outranksMe = (perms?: Record<string, unknown> | null) =>
    !iAmOwner && !!perms && Object.entries(perms).some(([k, v]) => v === true && myPermissions?.[k as keyof typeof myPermissions] !== true);
  // Branches the person has that this admin cannot see stay untouched server-side; only
  // list the ones we can actually toggle.
  const allChecked = branches.length > 0 && branches.every((b) => branchIds.includes(b.id));

  const toggleBranch = (id: string, checked: boolean) => {
    setValue('branchIds', checked ? [...new Set([...branchIds, id])] : branchIds.filter((b) => b !== id), { shouldDirty: true });
  };

  const onSubmit: SubmitHandler<UserFormValues> = async (data) => {
    const payload = {
      name: data.name.trim(),
      email: data.email.trim(),
      role: data.role,
      isActive: data.isActive,
      ...(isOwnerTarget ? {} : { branchIds: data.branchIds }),
    };
    try {
      if (isEdit && user) {
        await updateUser({
          id: user.id,
          data: { ...payload, ...(data.password ? { password: data.password } : {}) },
        }).unwrap();
        toast.success(t('user_updated_successfully') || 'User updated successfully');
      } else {
        await createUser({ ...payload, password: data.password || '' }).unwrap();
        draft.clear();
        toast.success(
          data.branchIds.length
            ? `${payload.name} can now sign in with ${payload.email}`
            : t('user_created_successfully') || 'User created successfully'
        );
      }
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error, t('failed_to_save_user')));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('edit_user') || 'Edit User' : t('add_user') || 'Add User'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Change their details, what they can do, or which branches they work in.'
              : 'Create a login, choose what they can do and where — all in one step.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormDraftNotice draft={draft} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">{t('name') || 'Name'}</Label>
              <Input id="name" autoFocus={!isEdit} {...register('name')} placeholder="e.g. Ahmed Ali" />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t('email') || 'Email'} <span className="text-muted-foreground font-normal">(login)</span></Label>
              <Input id="email" type="email" autoComplete="off" {...register('email')} placeholder="ahmed@shop.com" />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">
              {isEdit ? 'New password' : t('password') || 'Password'}
              {isEdit && <span className="text-muted-foreground font-normal"> (leave blank to keep)</span>}
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className="pr-9"
                  {...register('password')}
                  placeholder={isEdit ? '••••••••' : 'Letters and numbers, 8+'}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setValue('password', generatePassword(), { shouldValidate: true, shouldDirty: true });
                  setShowPassword(true);
                }}
              >
                <Wand2 className="mr-1.5 h-4 w-4" />
                Generate
              </Button>
            </div>
            {errors.password ? (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            ) : (
              isEdit && <p className="text-xs text-muted-foreground">Setting a new password signs them out of every device.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>{t('role') || 'Role'} <span className="text-muted-foreground font-normal">— what they can do</span></Label>
            {isOwnerTarget ? (
              <div className="flex h-9 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm">
                <Crown className="h-4 w-4 text-amber-500" /> Owner — full access to everything
              </div>
            ) : (
              <Select
                value={roleValue}
                onValueChange={(value) => setValue('role', value, { shouldValidate: true, shouldDirty: true })}
                disabled={isSelf}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('select_role') || 'Select a role'} />
                </SelectTrigger>
                <SelectContent>
                  {rolesData?.results?.map((role) => {
                    const locked = outranksMe(role.permissions as Record<string, unknown> | undefined) && role.id !== user?.role?.id;
                    return (
                      <SelectItem key={role.id} value={role.id} disabled={locked}>
                        {role.name}
                        {locked && <span className="ml-1 text-xs text-muted-foreground">(more access than yours)</span>}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
            {isSelf && !isOwnerTarget && <p className="text-xs text-muted-foreground">You can't change your own role.</p>}
            {!isOwnerTarget && selectedRole?.description && (
              <p className="text-xs text-muted-foreground">{selectedRole.description}</p>
            )}
            {errors.role && <p className="text-sm text-destructive">{errors.role.message}</p>}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Branch access <span className="text-muted-foreground font-normal">— where they work</span></Label>
              {!isOwnerTarget && branches.length > 1 && (
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() => setValue('branchIds', allChecked ? [] : branches.map((b) => b.id), { shouldDirty: true })}
                >
                  {allChecked ? 'Clear all' : 'Select all'}
                </button>
              )}
            </div>
            {isOwnerTarget ? (
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                The owner can open every branch.
              </p>
            ) : (
              <>
                <div className="grid max-h-44 grid-cols-1 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
                  {branches.map((branch) => (
                    <label
                      key={branch.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/60"
                    >
                      <Checkbox
                        checked={branchIds.includes(branch.id)}
                        onCheckedChange={(c) => toggleBranch(branch.id, c === true)}
                      />
                      <span className="truncate">{branch.name}</span>
                    </label>
                  ))}
                  {branches.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">No branches yet.</p>}
                </div>
                {branchIds.length === 0 && (
                  <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Without a branch they can sign in but can't open any branch's data.
                  </p>
                )}
              </>
            )}
          </div>

          {!isOwnerTarget && !isSelf && (
            <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
              <div>
                <Label htmlFor="isActive">{t('active') || 'Active'}</Label>
                <p className="text-xs text-muted-foreground">Inactive users can't sign in and don't use a seat.</p>
              </div>
              <Switch id="isActive" checked={isActiveValue} onCheckedChange={(c) => setValue('isActive', c, { shouldDirty: true })} />
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel') || 'Cancel'}
            </Button>
            <Button type="submit" disabled={isCreating || isUpdating}>
              {isCreating || isUpdating ? t('saving') || 'Saving...' : isEdit ? 'Save changes' : 'Create user'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
