import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import toast from 'react-hot-toast'
import { AppDispatch, RootState } from '@/stores/store'
import { bulkSetProductCategories } from '@/stores/product.slice'
import { fetchCategories, createCategory } from '@/stores/category.slice'
import { fetchAllSubCategories, createSubCategory } from '@/stores/subCategory.slice'
import { purchaseCatalogApi } from '@/stores/purchaseCatalog.api'
import { useLanguage } from '@/context/language-context'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Check, Loader2, Plus, Search, Tags, X } from 'lucide-react'
import { Product } from '../data/schema'

const PREVIEW_LIMIT = 5

type CategoryRef = { _id: string; name: string; image?: { url?: string; publicId?: string } }

interface BulkCategoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  products: Product[]
  onApplied: () => void
}

export function BulkCategoryDialog({ open, onOpenChange, products, onApplied }: BulkCategoryDialogProps) {
  const { t, isRTL } = useLanguage()
  const dispatch = useDispatch<AppDispatch>()
  const { categories } = useSelector((state: RootState) => state.category)
  const { subCategories } = useSelector((state: RootState) => state.subCategory)

  const [selectedCategories, setSelectedCategories] = useState<CategoryRef[]>([])
  const [selectedSubCategories, setSelectedSubCategories] = useState<CategoryRef[]>([])

  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [categorySearchQuery, setCategorySearchQuery] = useState('')
  const [isCreatingCategory, setIsCreatingCategory] = useState(false)

  const [subCategoriesOpen, setSubCategoriesOpen] = useState(false)
  const [subCategorySearchQuery, setSubCategorySearchQuery] = useState('')
  const [isCreatingSubCategory, setIsCreatingSubCategory] = useState(false)

  const [isSubmitting, setIsSubmitting] = useState(false)

  const count = products.length
  const previewNames = products.slice(0, PREVIEW_LIMIT).map((p) => p.name || 'Unnamed product')
  const remaining = count - previewNames.length

  // Refetch in case categories/sub-categories were added elsewhere since the Products
  // page first loaded them.
  useEffect(() => {
    if (open) {
      dispatch(fetchCategories({ page: 1, limit: 100 }))
      dispatch(fetchAllSubCategories({}))
    }
  }, [open, dispatch])

  const reset = () => {
    setSelectedCategories([])
    setSelectedSubCategories([])
    setCategorySearchQuery('')
    setSubCategorySearchQuery('')
  }

  const handleClose = (nextOpen: boolean) => {
    if (!isSubmitting) {
      onOpenChange(nextOpen)
      if (!nextOpen) reset()
    }
  }

  // Sub-categories are scoped to whichever categories are currently selected, same as
  // the Add/Edit Product form's picker — dropping a category prunes any of its
  // sub-categories that were already picked.
  const selectedCategoryIds = selectedCategories.map((c) => c._id)
  const selectedSubCategoryIds = new Set(selectedSubCategories.map((c) => c._id))
  const availableSubCategories = subCategories.filter((sc) => {
    const parentId = typeof sc.category === 'object' ? sc.category?.id : sc.category
    if (!parentId || !selectedCategoryIds.includes(parentId)) return false
    if (selectedSubCategoryIds.has(sc.id)) return true
    return sc.isActive !== false
  })

  useEffect(() => {
    setSelectedSubCategories((current) => {
      if (current.length === 0) return current
      const validIds = new Set(availableSubCategories.map((sc) => sc.id))
      const pruned = current.filter((sc) => validIds.has(sc._id))
      return pruned.length !== current.length ? pruned : current
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategoryIds.join(',')])

  const handleCreateCategory = async () => {
    const name = categorySearchQuery.trim()
    if (!name) return
    if (categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      toast.error(`"${name}" already exists`)
      return
    }
    setIsCreatingCategory(true)
    try {
      const created = await dispatch(createCategory({ name })).unwrap()
      toast.success(`Category "${name}" created`)
      setSelectedCategories((current) => [...current, { _id: created.id, name: created.name, image: created.image }])
      setCategorySearchQuery('')
      setCategoriesOpen(false)
    } catch {
      toast.error(`Failed to create category "${name}"`)
    } finally {
      setIsCreatingCategory(false)
    }
  }

  const handleCreateSubCategory = async () => {
    const name = subCategorySearchQuery.trim()
    const parentCategoryId = selectedCategoryIds[0]
    if (!name || !parentCategoryId) return
    if (availableSubCategories.some((sc) => sc.name.toLowerCase() === name.toLowerCase())) {
      toast.error(`"${name}" already exists`)
      return
    }
    setIsCreatingSubCategory(true)
    try {
      const created = await dispatch(createSubCategory({ name, category: parentCategoryId })).unwrap()
      toast.success(`Sub-category "${name}" created`)
      setSelectedSubCategories((current) => [...current, { _id: created.id, name: created.name, image: created.image }])
      setSubCategorySearchQuery('')
      setSubCategoriesOpen(false)
    } catch {
      toast.error(`Failed to create sub-category "${name}"`)
    } finally {
      setIsCreatingSubCategory(false)
    }
  }

  const isClearing = selectedCategories.length === 0 && selectedSubCategories.length === 0

  const handleApply = async () => {
    if (count === 0) return
    setIsSubmitting(true)
    try {
      const productIds = products.map((p) => p._id || p.id || '').filter(Boolean)
      const result = await dispatch(
        bulkSetProductCategories({
          productIds,
          categories: selectedCategories,
          subCategories: selectedSubCategories,
        })
      )

      if (result.meta.requestStatus === 'fulfilled') {
        const payload = result.payload as { modifiedCount?: number }
        toast.success(
          isClearing
            ? `Cleared categories on ${payload?.modifiedCount ?? productIds.length} product(s)`
            : `Updated categories on ${payload?.modifiedCount ?? productIds.length} product(s)`
        )
        dispatch(purchaseCatalogApi.util.invalidateTags(['PurchaseCatalog']))
        onOpenChange(false)
        reset()
        onApplied()
      } else {
        throw new Error((result.payload as string) || 'Bulk category update failed')
      }
    } catch (error) {
      console.error('Bulk category update error:', error)
      toast.error('Failed to update categories')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <Tags className='h-5 w-5' />
            {t('bulk_set_category')} ({count})
          </DialogTitle>
          <DialogDescription>{t('bulk_set_category_description')}</DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='flex flex-wrap gap-1.5 rounded-md border bg-muted/40 p-2'>
            {previewNames.map((name, i) => (
              <Badge key={i} variant='secondary' className='max-w-[12rem] truncate font-normal'>
                {name}
              </Badge>
            ))}
            {remaining > 0 && (
              <Badge variant='outline' className='font-normal'>
                {t('and_more_products', { count: remaining })}
              </Badge>
            )}
          </div>

          {/* Category picker */}
          <div className='space-y-1.5'>
            <label className='text-sm font-medium'>{t('categories')}</label>
            <Popover
              open={categoriesOpen}
              onOpenChange={(next) => {
                setCategoriesOpen(next)
                if (!next) setCategorySearchQuery('')
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  type='button'
                  variant='outline'
                  role='combobox'
                  aria-expanded={categoriesOpen}
                  className='h-auto min-h-[2.5rem] w-full justify-between py-1.5'
                >
                  <div className='flex flex-1 items-center gap-2'>
                    <Search className='h-4 w-4 shrink-0' />
                    {selectedCategories.length > 0 ? (
                      <div className='flex flex-1 flex-wrap items-center gap-1'>
                        {selectedCategories.map((category) => (
                          <Badge key={category._id} variant='secondary' className='flex items-center gap-1'>
                            <span className='text-xs'>{category.name}</span>
                            <button
                              type='button'
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedCategories((current) => current.filter((c) => c._id !== category._id))
                              }}
                              className='ml-1 rounded-full p-0.5 hover:bg-gray-200'
                            >
                              <X className='h-2 w-2' />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className='text-muted-foreground'>{t('select_categories')}</span>
                    )}
                  </div>
                </Button>
              </PopoverTrigger>
              <PopoverContent className='w-[300px] p-0' align={isRTL ? 'end' : 'start'}>
                <Command>
                  <CommandInput
                    placeholder={t('search_categories')}
                    value={categorySearchQuery}
                    onValueChange={setCategorySearchQuery}
                  />
                  <CommandEmpty>{t('no_categories_found')}</CommandEmpty>
                  <CommandList>
                    <CommandGroup>
                      {categories
                        .filter((category) => category.isActive !== false || selectedCategoryIds.includes(category.id))
                        .map((category) => {
                          const isSelected = selectedCategoryIds.includes(category.id)
                          return (
                            <CommandItem
                              key={category.id}
                              onSelect={() => {
                                setSelectedCategories((current) =>
                                  isSelected
                                    ? current.filter((c) => c._id !== category.id)
                                    : [...current, { _id: category.id, name: category.name, image: category.image }]
                                )
                              }}
                              className='flex cursor-pointer items-center gap-2'
                            >
                              <span className='flex-1'>{category.name}</span>
                              {isSelected && <Check className='h-4 w-4 text-primary' />}
                            </CommandItem>
                          )
                        })}
                    </CommandGroup>
                    <CommandGroup>
                      <CommandItem
                        value={categorySearchQuery.trim() ? `create-category-${categorySearchQuery.trim()}` : 'create-category-prompt'}
                        onSelect={
                          categorySearchQuery.trim() &&
                          !categories.some((c) => c.name.toLowerCase() === categorySearchQuery.trim().toLowerCase())
                            ? handleCreateCategory
                            : undefined
                        }
                        disabled={
                          isCreatingCategory ||
                          !categorySearchQuery.trim() ||
                          categories.some((c) => c.name.toLowerCase() === categorySearchQuery.trim().toLowerCase())
                        }
                        className='cursor-pointer text-primary data-[disabled=true]:opacity-100'
                      >
                        {isCreatingCategory ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : <Plus className='mr-2 h-4 w-4' />}
                        {!categorySearchQuery.trim()
                          ? 'Type a name above to create a new category'
                          : categories.some((c) => c.name.toLowerCase() === categorySearchQuery.trim().toLowerCase())
                            ? `"${categorySearchQuery.trim()}" already exists — select it above`
                            : `Create "${categorySearchQuery.trim()}"`}
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Sub-category picker */}
          <div className='space-y-1.5'>
            <label className='text-sm font-medium'>{t('subcategories')}</label>
            <Popover
              open={subCategoriesOpen}
              onOpenChange={(next) => {
                if (next && selectedCategoryIds.length === 0) return
                setSubCategoriesOpen(next)
                if (!next) setSubCategorySearchQuery('')
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  type='button'
                  variant='outline'
                  role='combobox'
                  aria-expanded={subCategoriesOpen}
                  disabled={selectedCategoryIds.length === 0}
                  className='h-auto min-h-[2.5rem] w-full justify-between py-1.5'
                >
                  <div className='flex flex-1 items-center gap-2'>
                    <Search className='h-4 w-4 shrink-0' />
                    {selectedSubCategories.length > 0 ? (
                      <div className='flex flex-1 flex-wrap items-center gap-1'>
                        {selectedSubCategories.map((subCategory) => (
                          <Badge key={subCategory._id} variant='secondary' className='flex items-center gap-1'>
                            <span className='text-xs'>{subCategory.name}</span>
                            <button
                              type='button'
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedSubCategories((current) => current.filter((sc) => sc._id !== subCategory._id))
                              }}
                              className='ml-1 rounded-full p-0.5 hover:bg-gray-200'
                            >
                              <X className='h-2 w-2' />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className='text-muted-foreground'>
                        {selectedCategoryIds.length === 0
                          ? t('select_category_first_hint')
                          : t('select_subcategories')}
                      </span>
                    )}
                  </div>
                </Button>
              </PopoverTrigger>
              <PopoverContent className='w-[300px] p-0' align={isRTL ? 'end' : 'start'}>
                <Command>
                  <CommandInput
                    placeholder={t('search_subcategories')}
                    value={subCategorySearchQuery}
                    onValueChange={setSubCategorySearchQuery}
                  />
                  <CommandEmpty>{t('no_subcategories_found')}</CommandEmpty>
                  <CommandList>
                    <CommandGroup>
                      {availableSubCategories.map((subCategory) => {
                        const isSelected = selectedSubCategoryIds.has(subCategory.id)
                        return (
                          <CommandItem
                            key={subCategory.id}
                            onSelect={() => {
                              setSelectedSubCategories((current) =>
                                isSelected
                                  ? current.filter((sc) => sc._id !== subCategory.id)
                                  : [...current, { _id: subCategory.id, name: subCategory.name, image: subCategory.image }]
                              )
                            }}
                            className='flex cursor-pointer items-center gap-2'
                          >
                            <span className='flex-1'>{subCategory.name}</span>
                            {isSelected && <Check className='h-4 w-4 text-primary' />}
                          </CommandItem>
                        )
                      })}
                    </CommandGroup>
                    <CommandGroup>
                      <CommandItem
                        value={subCategorySearchQuery.trim() ? `create-subcategory-${subCategorySearchQuery.trim()}` : 'create-subcategory-prompt'}
                        onSelect={
                          subCategorySearchQuery.trim() &&
                          !availableSubCategories.some((sc) => sc.name.toLowerCase() === subCategorySearchQuery.trim().toLowerCase())
                            ? handleCreateSubCategory
                            : undefined
                        }
                        disabled={
                          isCreatingSubCategory ||
                          !subCategorySearchQuery.trim() ||
                          availableSubCategories.some((sc) => sc.name.toLowerCase() === subCategorySearchQuery.trim().toLowerCase())
                        }
                        className='cursor-pointer text-primary data-[disabled=true]:opacity-100'
                      >
                        {isCreatingSubCategory ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : <Plus className='mr-2 h-4 w-4' />}
                        {!subCategorySearchQuery.trim()
                          ? t('type_a_name_to_create_subcategory')
                          : availableSubCategories.some((sc) => sc.name.toLowerCase() === subCategorySearchQuery.trim().toLowerCase())
                            ? `"${subCategorySearchQuery.trim()}" already exists — select it above`
                            : `Create "${subCategorySearchQuery.trim()}"`}
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {isClearing && (
            <Alert>
              <AlertDescription>{t('bulk_category_clear_warning')}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button type='button' variant='outline' onClick={() => handleClose(false)} disabled={isSubmitting}>
            {t('cancel')}
          </Button>
          <Button type='button' onClick={handleApply} disabled={isSubmitting || count === 0}>
            {isSubmitting && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {t('apply_to_products', { count })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
