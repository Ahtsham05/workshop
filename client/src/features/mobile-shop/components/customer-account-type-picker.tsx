import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Check, ChevronsUpDown, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'
import {
  useGetCustomerAccountTypesQuery,
  useCreateCustomerAccountTypeMutation,
  useUpdateCustomerAccountTypeMutation,
  useDeleteCustomerAccountTypeMutation,
  type CustomerAccountType,
} from '@/stores/customerAccountType.api'

interface Props {
  value: string
  onChange: (slug: string) => void
  label?: string
  hideLabel?: boolean
  id?: string
  className?: string
  triggerClassName?: string
}

const resolveId = (item: CustomerAccountType) => item.id || item._id || ''

export function CustomerAccountTypePicker({
  value,
  onChange,
  label,
  hideLabel = false,
  id,
  className,
  triggerClassName,
}: Props) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [editor, setEditor] = useState<CustomerAccountType | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('#6366f1')
  const [saving, setSaving] = useState(false)
  const [toDelete, setToDelete] = useState<CustomerAccountType | null>(null)
  const [deleting, setDeleting] = useState(false)

  const { data: accountTypes = [] } = useGetCustomerAccountTypesQuery()
  const [createAccountType] = useCreateCustomerAccountTypeMutation()
  const [updateAccountType] = useUpdateCustomerAccountTypeMutation()
  const [deleteAccountType] = useDeleteCustomerAccountTypeMutation()

  const selected = accountTypes.find((a) => a.slug === value)
  const displayLabel = selected?.name || (value ? value.replace(/_/g, ' ') : '')

  const openEdit = (item: CustomerAccountType) => {
    setEditor(item)
    setEditName(item.name)
    setEditColor(item.color || '#6366f1')
  }

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    try {
      setCreating(true)
      const created = await createAccountType({ name }).unwrap()
      onChange(created.slug)
      setNewName('')
      setOpen(false)
      toast.success(t('Account type created'))
    } catch (err: any) {
      toast.error(err?.data?.message || t('Failed to create account type'))
    } finally {
      setCreating(false)
    }
  }

  const handleSaveEdit = async () => {
    if (!editor) return
    const name = editName.trim()
    if (!name) return
    try {
      setSaving(true)
      const itemId = resolveId(editor)
      if (!itemId) {
        toast.error(t('Failed to update account type'))
        return
      }
      await updateAccountType({ id: itemId, name, color: editColor }).unwrap()
      setEditor(null)
      toast.success(t('Account type updated'))
    } catch (err: any) {
      toast.error(err?.data?.message || t('Failed to update account type'))
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!toDelete) return
    try {
      setDeleting(true)
      const itemId = resolveId(toDelete)
      if (!itemId) {
        toast.error(t('Failed to delete account type'))
        return
      }
      await deleteAccountType(itemId).unwrap()
      if (value === toDelete.slug) {
        onChange('other')
      }
      setToDelete(null)
      toast.success(t('Account type deleted'))
    } catch (err: any) {
      toast.error(err?.data?.message || t('Failed to delete account type'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <div className={cn(hideLabel ? 'space-y-0' : 'space-y-2', className)}>
        {!hideLabel && <Label htmlFor={id}>{label ?? t('Account Type')}</Label>}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id={id}
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className={cn('w-full justify-between font-normal', triggerClassName)}
            >
              {displayLabel || (
                <span className="text-muted-foreground">{t('Select account type')}</span>
              )}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command className="max-h-80 overflow-hidden">
              <CommandInput placeholder={t('Search or create account type...')} />
              <CommandEmpty>{t('No account types found')}</CommandEmpty>
              <CommandList className="max-h-52 overflow-y-auto">
                <CommandGroup heading={t('Account types')}>
                  {accountTypes.map((item) => (
                    <CommandItem
                      key={resolveId(item) || item.slug}
                      value={`${item.name} ${item.slug}`}
                      onSelect={() => {
                        onChange(item.slug)
                        setOpen(false)
                      }}
                    >
                      <div className="flex w-full min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="flex-1 truncate">{item.name}</span>
                        {value === item.slug && (
                          <Check className="h-4 w-4 shrink-0 text-primary" />
                        )}
                        <div
                          className="flex shrink-0 items-center gap-0.5"
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                          }}
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title={t('Edit account type')}
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setOpen(false)
                              openEdit(item)
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {!item.isDefault && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              title={t('Delete account type')}
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                setOpen(false)
                                setToDelete(item)
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup heading={t('Create new')}>
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder={t('New account type name')}
                      className="h-7 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleCreate()
                        }
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 shrink-0 px-2"
                      onClick={handleCreate}
                      disabled={creating || !newName.trim()}
                    >
                      {creating ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Plus className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <Dialog open={!!editor} onOpenChange={(next) => !next && setEditor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('Edit account type')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="acct-type-name">{t('Name')}</Label>
              <Input
                id="acct-type-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleSaveEdit()
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acct-type-color">{t('Color')}</Label>
              <Input
                id="acct-type-color"
                type="color"
                className="h-10 w-full cursor-pointer p-1"
                value={editColor}
                onChange={(e) => setEditColor(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setEditor(null)}>
              {t('Cancel')}
            </Button>
            <Button
              type="button"
              onClick={handleSaveEdit}
              disabled={saving || !editName.trim()}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('Saving...')}
                </>
              ) : (
                t('save_changes')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(next) => !next && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Delete account type?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'This removes the account type from the list. Existing transactions keep their saved account type.',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('Cancel')}</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={handleConfirmDelete}
            >
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('delete')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/** Resolve slug to display name using loaded account types */
export function resolveAccountTypeLabel(
  slug: string | undefined,
  accountTypes: CustomerAccountType[],
): string {
  if (!slug) return '—'
  const found = accountTypes.find((a) => a.slug === slug)
  if (found) return found.name
  return slug.replace(/_/g, ' ')
}
