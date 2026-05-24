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
  useGetExpenseCategoriesQuery,
  useCreateExpenseCategoryMutation,
  useUpdateExpenseCategoryMutation,
  useDeleteExpenseCategoryMutation,
  type ExpenseCategory,
  type TransactionCategoryType,
} from '@/stores/expenseCategory.api'

interface Props {
  transactionType: TransactionCategoryType
  value: string
  onChange: (value: string) => void
  required?: boolean
  error?: string
  className?: string
}

const resolveCategoryId = (cat: ExpenseCategory) => cat.id || cat._id || ''

export function TransactionCategoryPicker({
  transactionType,
  value,
  onChange,
  required = false,
  error,
  className,
}: Props) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [creatingCat, setCreatingCat] = useState(false)
  const [categoryEditor, setCategoryEditor] = useState<ExpenseCategory | null>(null)
  const [editCatName, setEditCatName] = useState('')
  const [editCatColor, setEditCatColor] = useState('#6366f1')
  const [savingCat, setSavingCat] = useState(false)
  const [categoryToDelete, setCategoryToDelete] = useState<ExpenseCategory | null>(null)
  const [deletingCat, setDeletingCat] = useState(false)

  const { data: categories = [] } = useGetExpenseCategoriesQuery({ transactionType })
  const [createCategory] = useCreateExpenseCategoryMutation()
  const [updateCategory] = useUpdateExpenseCategoryMutation()
  const [deleteCategoryMut] = useDeleteExpenseCategoryMutation()

  const openEditCategory = (cat: ExpenseCategory) => {
    setCategoryEditor(cat)
    setEditCatName(cat.name)
    setEditCatColor(cat.color || '#6366f1')
  }

  const handleCreateCategory = async () => {
    const name = newCatName.trim()
    if (!name) return
    try {
      setCreatingCat(true)
      const created = await createCategory({ name, transactionType }).unwrap()
      onChange(created.name)
      setNewCatName('')
      setOpen(false)
      toast.success(t('Category created'))
    } catch (err: any) {
      toast.error(err?.data?.message || t('Failed to create category'))
    } finally {
      setCreatingCat(false)
    }
  }

  const handleSaveCategoryEdit = async () => {
    if (!categoryEditor) return
    const name = editCatName.trim()
    if (!name) return
    try {
      setSavingCat(true)
      const id = resolveCategoryId(categoryEditor)
      if (!id) {
        toast.error(t('Failed to update category'))
        return
      }
      await updateCategory({ id, name, color: editCatColor }).unwrap()
      if (value === categoryEditor.name) {
        onChange(name)
      }
      setCategoryEditor(null)
      toast.success(t('Category updated'))
    } catch (err: any) {
      toast.error(err?.data?.message || t('Failed to update category'))
    } finally {
      setSavingCat(false)
    }
  }

  const handleConfirmDeleteCategory = async () => {
    if (!categoryToDelete) return
    try {
      setDeletingCat(true)
      const categoryId = resolveCategoryId(categoryToDelete)
      if (!categoryId) {
        toast.error(t('Failed to delete category'))
        return
      }
      await deleteCategoryMut(categoryId).unwrap()
      if (value === categoryToDelete.name) {
        onChange('')
      }
      setCategoryToDelete(null)
      toast.success(t('Category deleted'))
    } catch (err: any) {
      toast.error(err?.data?.message || t('Failed to delete category'))
    } finally {
      setDeletingCat(false)
    }
  }

  return (
    <>
      <div className={cn('space-y-1', className)}>
        <Label>
          {t('Category')}
          {required ? <span className="text-red-500"> *</span> : null}
        </Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className={cn('w-full justify-between font-normal', error && 'border-red-500')}
            >
              {value || <span className="text-muted-foreground">{t('Select category')}</span>}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command className="max-h-80 overflow-hidden">
              <CommandInput placeholder={t('Search or create category...')} />
              <CommandEmpty>{t('No categories found')}</CommandEmpty>
              <CommandList className="max-h-52 overflow-y-auto">
                <CommandGroup heading={t('Categories')}>
                  {categories.map((cat) => (
                    <CommandItem
                      key={resolveCategoryId(cat) || cat.name}
                      value={`${cat.name} ${resolveCategoryId(cat)}`}
                      onSelect={() => {
                        onChange(cat.name)
                        setOpen(false)
                      }}
                    >
                      <div className="flex w-full min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span className="flex-1 truncate">{cat.name}</span>
                        {value === cat.name && <Check className="h-4 w-4 shrink-0 text-primary" />}
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
                            title={t('Edit category')}
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setOpen(false)
                              openEditCategory(cat)
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {!cat.isDefault && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              title={t('Delete category')}
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                setOpen(false)
                                setCategoryToDelete(cat)
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
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      placeholder={t('New category name')}
                      className="h-7 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleCreateCategory()
                        }
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 shrink-0 px-2"
                      onClick={handleCreateCategory}
                      disabled={creatingCat || !newCatName.trim()}
                    >
                      {creatingCat ? (
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
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
      </div>

      <Dialog open={!!categoryEditor} onOpenChange={(next) => !next && setCategoryEditor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('Edit category')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="txn-cat-name">{t('Name')}</Label>
              <Input
                id="txn-cat-name"
                value={editCatName}
                onChange={(e) => setEditCatName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleSaveCategoryEdit()
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="txn-cat-color">{t('Color')}</Label>
              <Input
                id="txn-cat-color"
                type="color"
                className="h-10 w-full cursor-pointer p-1"
                value={editCatColor}
                onChange={(e) => setEditCatColor(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setCategoryEditor(null)}>
              {t('Cancel')}
            </Button>
            <Button
              type="button"
              onClick={handleSaveCategoryEdit}
              disabled={savingCat || !editCatName.trim()}
            >
              {savingCat ? (
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

      <AlertDialog
        open={!!categoryToDelete}
        onOpenChange={(next) => !next && setCategoryToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Delete category?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'This will remove the category from the list. Existing entries keep their recorded category text.',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingCat}>{t('Cancel')}</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={deletingCat}
              onClick={handleConfirmDeleteCategory}
            >
              {deletingCat ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('delete')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
