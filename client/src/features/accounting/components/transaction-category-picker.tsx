import { useEffect, useMemo, useState } from 'react'
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

type PickerCategory = ExpenseCategory & { fromLedger?: boolean }

interface Props {
  transactionType: TransactionCategoryType
  value: string
  onChange: (value: string) => void
  /** Optional catalog supplement (wallet: merged with live API fetch so create/edit match) */
  apiCategories?: ExpenseCategory[]
  /** Category names used on ledger entries but not yet in the expense-category list */
  extraCategories?: string[]
  /** My Wallet only — not product or business expense categories */
  walletMode?: boolean
  /** Wallet form: block interaction while parent catalog loads */
  categoriesLoading?: boolean
  required?: boolean
  error?: string
  className?: string
}

const resolveCategoryId = (cat: ExpenseCategory) => cat.id || cat._id || ''

const isPersistedCategory = (cat: PickerCategory) =>
  Boolean(resolveCategoryId(cat)) && !cat.fromLedger

export function TransactionCategoryPicker({
  transactionType,
  value,
  onChange,
  apiCategories,
  extraCategories = [],
  walletMode = false,
  categoriesLoading = false,
  required = false,
  error,
  className,
}: Props) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [newCatName, setNewCatName] = useState('')
  const [creatingCat, setCreatingCat] = useState(false)
  const [categoryEditor, setCategoryEditor] = useState<ExpenseCategory | null>(null)
  const [editCatName, setEditCatName] = useState('')
  const [editCatColor, setEditCatColor] = useState('#6366f1')
  const [savingCat, setSavingCat] = useState(false)
  const [categoryToDelete, setCategoryToDelete] = useState<ExpenseCategory | null>(null)
  const [deletingCat, setDeletingCat] = useState(false)

  const skipFetch =
    !walletMode && apiCategories !== undefined && apiCategories.length > 0
  const { data: fetchedCategories = [], isFetching: fetchingCategories } =
    useGetExpenseCategoriesQuery(
      { transactionType },
      {
        skip: skipFetch,
        refetchOnMountOrArgChange: false,
        refetchOnFocus: false,
      },
    )

  const categories = useMemo(() => {
    const byKey = new Map<string, ExpenseCategory>()
    const add = (cat: ExpenseCategory) => {
      const key = cat.name.trim().toLowerCase()
      if (!key) return
      if (!byKey.has(key)) byKey.set(key, cat)
    }
    for (const cat of fetchedCategories) add(cat)
    if (apiCategories) {
      for (const cat of apiCategories) add(cat)
    }
    return Array.from(byKey.values())
  }, [fetchedCategories, apiCategories])

  useEffect(() => {
    setSearch('')
    setNewCatName('')
  }, [transactionType])

  const displayCategories = useMemo((): PickerCategory[] => {
    const byKey = new Map<string, PickerCategory>()
    const add = (cat: PickerCategory) => {
      const key = cat.name.trim().toLowerCase()
      if (!key) return
      if (!byKey.has(key)) byKey.set(key, cat)
    }

    for (const cat of categories) {
      add(cat)
    }
    for (const name of extraCategories) {
      const trimmed = name.trim()
      if (!trimmed) continue
      add({
        id: `ledger-${trimmed.toLowerCase()}`,
        name: trimmed,
        color: '#94a3b8',
        isDefault: false,
        fromLedger: true,
      })
    }
    const current = value.trim()
    if (current) {
      add({
        id: `current-${current.toLowerCase()}`,
        name: current,
        color: '#94a3b8',
        isDefault: false,
        fromLedger: true,
      })
    }

    const list = Array.from(byKey.values())
    list.sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? 1 : -1
      return a.name.localeCompare(b.name)
    })
    return list
  }, [categories, extraCategories, value])

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return displayCategories
    return displayCategories.filter((c) => c.name.toLowerCase().includes(q))
  }, [displayCategories, search])

  const listLoading = categoriesLoading || (walletMode && fetchingCategories && categories.length === 0)

  const [createCategory] = useCreateExpenseCategoryMutation()
  const [updateCategory] = useUpdateExpenseCategoryMutation()
  const [deleteCategoryMut] = useDeleteExpenseCategoryMutation()

  const openEditCategory = (cat: ExpenseCategory) => {
    setCategoryEditor(cat)
    setEditCatName(cat.name)
    setEditCatColor(cat.color || '#6366f1')
  }

  const renderCategoryItem = (cat: PickerCategory) => (
    <CommandItem
      key={`${resolveCategoryId(cat) || cat.name}-${cat.fromLedger ? 'ledger' : 'api'}`}
      value={cat.name}
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
        {isPersistedCategory(cat) ? (
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
        ) : null}
      </div>
    </CommandItem>
  )

  const listIsEmpty = !listLoading && filteredCategories.length === 0

  const handleCreateCategory = async () => {
    const name = newCatName.trim()
    if (!name) return
    try {
      setCreatingCat(true)
      const created = await createCategory({ name, transactionType }).unwrap()
      onChange(created.name)
      setNewCatName('')
      setSearch('')
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
      await deleteCategoryMut({
        id: categoryId,
        transactionType: categoryToDelete.transactionType ?? transactionType,
      }).unwrap()
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
          {walletMode ? t('Wallet Category') : t('Category')}
          {required ? <span className="text-red-500"> *</span> : null}
        </Label>
        {walletMode ? (
          <p className="text-xs text-muted-foreground">
            {t('Categories here are only for My Wallet, not Products or Business Expenses.')}
          </p>
        ) : null}
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            if (!next) {
              setSearch('')
              setNewCatName('')
            }
          }}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              disabled={listLoading}
              className={cn('w-full justify-between font-normal', error && 'border-red-500')}
            >
              {listLoading ? (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('Loading categories...')}
                </span>
              ) : value ? (
                value
              ) : (
                <span className="text-muted-foreground">{t('Select category')}</span>
              )}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command
              key={transactionType}
              shouldFilter={false}
              className="max-h-80 overflow-hidden"
            >
              <CommandInput
                placeholder={t('Search or create category...')}
                value={search}
                onValueChange={setSearch}
                disabled={listLoading}
              />
              {listLoading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('Loading categories...')}
                </div>
              ) : null}
              {listIsEmpty ? <CommandEmpty>{t('No categories found')}</CommandEmpty> : null}
              <CommandList className="max-h-64 overflow-y-auto">
                {!listLoading ? (
                  <CommandGroup heading={t('Categories')}>
                    {filteredCategories.map((cat) => renderCategoryItem(cat))}
                  </CommandGroup>
                ) : null}
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
                      onBlur={() => {
                        const draft = newCatName.trim()
                        if (draft && !value.trim()) {
                          onChange(draft)
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
