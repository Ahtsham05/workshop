import { zodResolver } from '@hookform/resolvers/zod'
import { useFieldArray, useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import SmartInput from '@/components/smart-input.tsx'
import { toast } from 'sonner'
import { useSubCategories } from '../context/subcategories-context'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { createSubCategory, updateSubCategory, bulkCreateSubCategories } from '@/stores/subCategory.slice'
import { Category } from '@/stores/category.slice'
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useLanguage } from '@/context/language-context'
import ImageUpload from '@/components/image-upload'
import { Input } from '@/components/ui/input'
import { useAutoUrduNameFromEnglish } from '@/hooks/use-auto-urdu-name-from-english'
import { CategoryPickerField } from './category-picker-field'
import { SubCategoryNameRow } from './subcategory-name-row'
import { Plus, FolderTree, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

const subCategoryFormSchema = z.object({
  category: z.string().min(1, 'Please select a main category'),
  items: z
    .array(
      z.object({
        name: z.string().min(1, 'Sub-category name is required'),
        nameUrdu: z.string().optional(),
      })
    )
    .min(1, 'Add at least one sub-category'),
  nameUrdu: z.string().optional(),
  image: z.object({
    url: z.string(),
    publicId: z.string(),
  }).optional(),
})

export type SubCategoryFormValues = z.infer<typeof subCategoryFormSchema>

interface SubCategoriesActionDialogProps {
  setFetch: Dispatch<SetStateAction<boolean>>
  categories: Category[]
}

export function SubCategoriesActionDialog({ setFetch, categories }: SubCategoriesActionDialogProps) {
  const { state, dispatch: contextDispatch } = useSubCategories()
  const reduxDispatch = useDispatch<AppDispatch>()
  const { t } = useLanguage()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const rowRefs = useRef<Array<HTMLInputElement | null>>([])

  const isEditMode = Boolean(state.currentSubCategory)

  const form = useForm<SubCategoryFormValues>({
    resolver: zodResolver(subCategoryFormSchema),
    defaultValues: {
      category: '',
      items: [{ name: '', nameUrdu: '' }],
      nameUrdu: '',
      image: undefined,
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  })

  const subCategorySessionKey = state.open ? (state.currentSubCategory?.id ?? 'new') : null
  useAutoUrduNameFromEnglish(form, 'items.0.name', 'nameUrdu', isEditMode ? subCategorySessionKey : undefined)

  useEffect(() => {
    if (!state.open) return

    if (state.currentSubCategory) {
      const categoryId =
        typeof state.currentSubCategory.category === 'object'
          ? state.currentSubCategory.category?.id
          : state.currentSubCategory.category
      form.reset({
        category: categoryId || '',
        items: [{ name: state.currentSubCategory.name, nameUrdu: state.currentSubCategory.nameUrdu || '' }],
        nameUrdu: state.currentSubCategory.nameUrdu || '',
        image: state.currentSubCategory.image || undefined,
      })
    } else {
      form.reset({
        category: state.defaultCategoryId || '',
        items: [{ name: '', nameUrdu: '' }],
        nameUrdu: '',
        image: undefined,
      })
    }
  }, [state.open, state.currentSubCategory, state.defaultCategoryId, form])

  const selectedCategoryId = form.watch('category')
  const selectedCategory = categories.find((c) => c.id === selectedCategoryId)
  const nameWatch = form.watch('items.0.name')

  const focusRow = (index: number) => {
    requestAnimationFrame(() => rowRefs.current[index]?.focus())
  }

  const handleAddRow = () => {
    append({ name: '', nameUrdu: '' })
    focusRow(fields.length)
  }

  const handleRowKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (index === fields.length - 1) {
      const value = form.getValues(`items.${index}.name`)
      if (!value?.trim()) return
      handleAddRow()
    } else {
      focusRow(index + 1)
    }
  }

  async function onSubmit(data: SubCategoryFormValues) {
    setIsSubmitting(true)
    try {
      if (state.currentSubCategory) {
        await reduxDispatch(updateSubCategory({
          id: state.currentSubCategory.id,
          name: data.items[0].name,
          nameUrdu: data.nameUrdu,
          category: data.category,
          image: data.image,
        })).unwrap()
        toast.success(t('subcategory_updated_successfully'))
      } else if (data.items.length === 1) {
        await reduxDispatch(createSubCategory({
          name: data.items[0].name,
          nameUrdu: data.items[0].nameUrdu,
          category: data.category,
        })).unwrap()
        toast.success(t('subcategory_created_successfully'))
      } else {
        const result = await reduxDispatch(bulkCreateSubCategories({
          category: data.category,
          items: data.items.map((item) => ({ name: item.name, nameUrdu: item.nameUrdu })),
        })).unwrap()
        toast.success(
          t('subcategories_created_successfully_count', { count: result?.subCategories?.length ?? data.items.length })
        )
      }

      contextDispatch({ type: 'SET_OPEN', payload: false })
      contextDispatch({ type: 'SET_SUBCATEGORY', payload: null })
      setFetch((previous) => !previous)
    } catch (error) {
      toast.error(state.currentSubCategory ? t('subcategory_update_failed') : t('subcategory_creation_failed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    contextDispatch({ type: 'SET_OPEN', payload: false })
    contextDispatch({ type: 'SET_SUBCATEGORY', payload: null })
    form.reset()
  }

  const handleImageUpload = (imageData: { url: string; publicId: string }) => {
    form.setValue('image', imageData)
  }

  const handleImageRemove = () => {
    form.setValue('image', undefined)
  }

  const submitLabel = isEditMode
    ? (isSubmitting ? t('saving') : t('update_subcategory'))
    : isSubmitting
      ? t('saving')
      : fields.length > 1
        ? t('create_subcategories_count', { count: fields.length })
        : t('create_subcategory')

  return (
    <Dialog open={state.open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[min(90vh,880px)] w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b border-border/60 px-6 pb-4 pt-6">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FolderTree className="h-4 w-4" />
            </span>
            {isEditMode ? t('edit_subcategory') : t('add_subcategory')}
          </DialogTitle>
          <DialogDescription className='mt-2'>
            {isEditMode
              ? t('update_subcategory_description')
              : t('create_subcategory_description')
            }
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain py-5 pl-6 pr-4 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/60">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base">{t('main_category')} *</FormLabel>
                    <FormControl>
                      <CategoryPickerField
                        categories={categories}
                        value={field.value}
                        onValueChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {!isEditMode && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <FormLabel className="text-base">{t('subcategory_names')} *</FormLabel>
                    {fields.length > 1 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                        <Sparkles className="h-3 w-3" />
                        {t('creating_count_subcategories', { count: fields.length })}
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    {fields.map((fieldItem, index) => (
                      <SubCategoryNameRow
                        key={fieldItem.id}
                        form={form}
                        index={index}
                        canRemove={fields.length > 1}
                        onRemove={() => remove(index)}
                        onKeyDown={(e) => handleRowKeyDown(e, index)}
                        autoFocus={index === 0}
                        inputRef={(el) => { rowRefs.current[index] = el }}
                      />
                    ))}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 border-dashed"
                    onClick={handleAddRow}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    {t('add_another_subcategory')}
                  </Button>

                  <p className="text-xs text-muted-foreground">
                    {t('add_multiple_subcategories_hint')}
                  </p>
                </div>
              )}

              {isEditMode && (
                <>
                  <FormField
                    control={form.control}
                    name="items.0.name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base">{t('subcategory_name')} *</FormLabel>
                        <FormControl>
                          <SmartInput
                            placeholder={t('enter_subcategory_name_placeholder')}
                            showVoiceInput={false}
                            className="h-11 text-base"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="nameUrdu"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base">{t('name_in_urdu')}</FormLabel>
                        <FormControl>
                          <Input
                            dir="rtl"
                            placeholder={t('name_in_urdu_placeholder')}
                            autoComplete="off"
                            showVoiceInput={false}
                            className="h-11 text-base text-right"
                            {...field}
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">{t('name_in_urdu_hint')}</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="image"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base">
                          {t('subcategory_image')} ({t('optional')})
                        </FormLabel>
                        <FormControl>
                        <ImageUpload
                          onImageUpload={handleImageUpload}
                          onImageRemove={handleImageRemove}
                          currentImageUrl={field.value?.url || ''}
                          layout="comfortable"
                          autoSearchFromText={nameWatch}
                          getSearchQuery={() => String(form.getValues('items.0.name') ?? '').trim()}
                          searchContext="subcategory"
                        />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              {selectedCategory && (
                <div className={cn(
                  'flex items-center gap-2 rounded-lg border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-sm text-muted-foreground',
                )}>
                  <FolderTree className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>
                    {t('will_be_added_under')} <strong className="text-foreground">{selectedCategory.name}</strong>
                  </span>
                </div>
              )}
            </div>
            <DialogFooter className="shrink-0 border-t border-border/60 bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
              <Button type="button" variant="outline" onClick={handleClose}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
