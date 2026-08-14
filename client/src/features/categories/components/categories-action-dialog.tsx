import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
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
import { useCategories } from '../context/categories-context'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { createCategory, updateCategory, Category } from '@/stores/category.slice'
import { createSubCategory, bulkCreateSubCategories, SubCategory } from '@/stores/subCategory.slice'
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { useLanguage } from '@/context/language-context'
import ImageUpload from '@/components/image-upload'
import { Input } from '@/components/ui/input'
import { VoiceInputButton } from '@/components/ui/voice-input-button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useAutoUrduNameFromEnglish } from '@/hooks/use-auto-urdu-name-from-english'
import { SubCategoryTagsField } from './subcategory-tags-field'
import { SubCategoriesProvider } from '@/features/subcategories/context/subcategories-context'
import { Check, FolderTree, Layers, Plus } from 'lucide-react'
import Axios from '@/utils/Axios'
import summery from '@/utils/summery'

const categoryFormSchema = z.object({
  name: z.string().min(1, 'Category name is required'),
  nameUrdu: z.string().optional(),
  image: z.object({
    url: z.string(),
    publicId: z.string(),
  }).optional(),
  subCategories: z.array(z.string().min(1)),
})

export type CategoryFormValues = z.infer<typeof categoryFormSchema>

interface CategoriesActionDialogProps {
  setFetch: Dispatch<SetStateAction<boolean>>
  /** Pre-fills the name field when opened fresh (e.g. quick-create from another form's category picker). */
  defaultName?: string
  /** Fires with the newly created category — lets a caller (e.g. a picker) auto-select it. Not called on edit/update. */
  onCreated?: (category: Category) => void
}

export function CategoriesActionDialog({ setFetch, defaultName, onCreated }: CategoriesActionDialogProps) {
  const { state, dispatch: contextDispatch } = useCategories()
  const reduxDispatch = useDispatch<AppDispatch>()
  const { t } = useLanguage()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [existingSubCategories, setExistingSubCategories] = useState<SubCategory[]>([])
  const [loadingExisting, setLoadingExisting] = useState(false)
  const [existingRefreshToken, setExistingRefreshToken] = useState(0)

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: '',
      nameUrdu: '',
      image: undefined,
      subCategories: [],
    },
  })

  const categorySessionKey = state.open ? (state.currentCategory?.id ?? 'new') : null
  useAutoUrduNameFromEnglish(form, 'name', 'nameUrdu', categorySessionKey)

  // Reset form when dialog opens/closes or category changes
  useEffect(() => {
    if (state.open) {
      if (state.currentCategory) {
        // Edit mode
        form.reset({
          name: state.currentCategory.name,
          nameUrdu: state.currentCategory.nameUrdu || '',
          image: state.currentCategory.image || undefined,
          subCategories: [],
        })
      } else {
        // Create mode
        form.reset({
          name: defaultName || '',
          nameUrdu: '',
          image: undefined,
          subCategories: [],
        })
      }
    }
  }, [state.open, state.currentCategory, defaultName, form])

  // Load this category's existing sub-categories for display/removal — fetched directly
  // (not via the redux thunk) so we don't clobber the global sub-category list that the
  // Sub Categories page and product form pickers rely on.
  useEffect(() => {
    if (!state.open || !state.currentCategory) {
      setExistingSubCategories([])
      return
    }
    let cancelled = false
    setLoadingExisting(true)
    Axios({
      ...summery.fetchAllSubCategories,
      url: `${summery.fetchAllSubCategories.url}?category=${state.currentCategory.id}`,
    })
      .then((response) => {
        if (cancelled) return
        setExistingSubCategories(response.data?.results || response.data || [])
      })
      .catch(() => {
        if (!cancelled) setExistingSubCategories([])
      })
      .finally(() => {
        if (!cancelled) setLoadingExisting(false)
      })
    return () => {
      cancelled = true
    }
  }, [state.open, state.currentCategory, existingRefreshToken])

  async function onSubmit(data: CategoryFormValues) {
    setIsSubmitting(true)

    let categoryId: string
    try {
      if (state.currentCategory) {
        // Update existing category
        const updated = await reduxDispatch(updateCategory({
          id: state.currentCategory.id,
          name: data.name,
          nameUrdu: data.nameUrdu,
          image: data.image,
        })).unwrap()
        categoryId = updated.id
        toast.success(t('category_updated_successfully'))
      } else {
        // Create new category
        const created = await reduxDispatch(createCategory({
          name: data.name,
          nameUrdu: data.nameUrdu,
          image: data.image,
        })).unwrap()
        categoryId = created.id
        toast.success(t('category_created_successfully'))
        onCreated?.(created)
      }
    } catch {
      toast.error(state.currentCategory ? t('category_update_failed') : t('category_creation_failed'))
      setIsSubmitting(false)
      return
    }

    const newSubCategoryNames = (data.subCategories ?? []).filter((name) => name.trim().length > 0)
    if (newSubCategoryNames.length > 0) {
      try {
        if (newSubCategoryNames.length === 1) {
          await reduxDispatch(createSubCategory({
            name: newSubCategoryNames[0],
            category: categoryId,
          })).unwrap()
          toast.success(t('subcategory_created_successfully'))
        } else {
          const result = await reduxDispatch(bulkCreateSubCategories({
            category: categoryId,
            items: newSubCategoryNames.map((name) => ({ name })),
          })).unwrap()
          toast.success(
            t('subcategories_created_successfully_count', { count: result?.subCategories?.length ?? newSubCategoryNames.length })
          )
        }
      } catch {
        toast.error(t('subcategory_creation_failed'))
      }
    }

    contextDispatch({ type: 'SET_OPEN', payload: false })
    contextDispatch({ type: 'SET_CATEGORY', payload: null })
    setFetch((previous) => !previous)
    setIsSubmitting(false)
  }

  const handleClose = () => {
    contextDispatch({ type: 'SET_OPEN', payload: false })
    contextDispatch({ type: 'SET_CATEGORY', payload: null })
    form.reset()
  }

  const handleImageUpload = (imageData: { url: string; publicId: string }) => {
    form.setValue('image', imageData)
  }

  const handleImageRemove = () => {
    form.setValue('image', undefined)
  }

  const nameWatch = form.watch('name')
  const imageWatch = form.watch('image')
  const subCategoriesWatch = form.watch('subCategories')
  const filledSubCategoryCount = (subCategoriesWatch ?? []).filter((name) => name?.trim()).length

  const submitLabel = isSubmitting
    ? t('saving')
    : state.currentCategory
      ? filledSubCategoryCount > 0
        ? t('save_and_add_subcategories_count', { count: filledSubCategoryCount })
        : t('update_category')
      : filledSubCategoryCount > 0
        ? t('create_category_with_subcategories_count', { count: filledSubCategoryCount })
        : t('create_category')

  return (
    <Dialog open={state.open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[min(90vh,880px)] w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden rounded-xl p-0 shadow-xl sm:max-w-2xl">
        <DialogHeader className="shrink-0 gap-0 border-b border-border/60 px-6 pb-5 pt-6 text-left">
          <div className="flex items-center gap-3.5">
            <Avatar className="h-11 w-11 border border-border/60 bg-muted shadow-sm">
              <AvatarImage src={imageWatch?.url || ''} className="object-cover" />
              <AvatarFallback className="bg-primary/10 text-base font-semibold text-primary">
                {nameWatch?.trim() ? nameWatch.trim().charAt(0).toUpperCase() : <Layers className="h-5 w-5" />}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-xl">
                {state.currentCategory ? t('edit_category') : t('add_category')}
              </DialogTitle>
              <DialogDescription className='mt-1'>
                {state.currentCategory
                  ? t('update_category_description')
                  : t('create_category_description')
                }
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <div className="flex flex-col gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base">{t('category_name')} *</FormLabel>
                      <FormControl>
                        <SmartInput
                          placeholder={t('enter_category_name')}
                          showVoiceInput={true}
                          voiceInputSize="sm"
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
                        <div className="relative">
                          <Input
                            dir="rtl"
                            placeholder={t('name_in_urdu_placeholder')}
                            autoComplete="off"
                            showVoiceInput={false}
                            className="pl-9 text-right"
                            {...field}
                          />
                          <div className="absolute left-2 top-1/2 -translate-y-1/2">
                            <VoiceInputButton
                              size="sm"
                              onTranscript={(text) => {
                                const trimmed = text.trim()
                                const current = typeof field.value === 'string' ? field.value : ''
                                field.onChange(current ? `${current.trimEnd()} ${trimmed}` : trimmed)
                              }}
                            />
                          </div>
                        </div>
                      </FormControl>
                      <p className="text-xs text-muted-foreground">{t('name_in_urdu_hint')}</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-3 rounded-xl border border-border/70 bg-muted/10 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <FolderTree className="h-4 w-4" />
                    </span>
                    <div>
                      <FormLabel className="text-base leading-tight">
                        {t('category_subcategories_section_title')}
                      </FormLabel>
                      <p className="text-xs text-muted-foreground">{t('optional')}</p>
                    </div>
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="subCategories"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <SubCategoriesProvider>
                          <SubCategoryTagsField
                            existing={existingSubCategories}
                            loadingExisting={loadingExisting}
                            onExistingChanged={() => setExistingRefreshToken((n) => n + 1)}
                            draftNames={field.value ?? []}
                            onDraftNamesChange={field.onChange}
                          />
                        </SubCategoriesProvider>
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="image"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base">
                      {t('category_image')} ({t('optional')})
                    </FormLabel>
                    <FormControl>
                    <ImageUpload
                      onImageUpload={handleImageUpload}
                      onImageRemove={handleImageRemove}
                      currentImageUrl={field.value?.url || ''}
                      layout="comfortable"
                      autoSearchFromText={nameWatch}
                      getSearchQuery={() => String(form.getValues('name') ?? '').trim()}
                      searchContext="category"
                    />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter className="shrink-0 border-t border-border/60 bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
              <Button type="button" variant="outline" onClick={handleClose}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting} className="shadow-sm">
                {!isSubmitting && (state.currentCategory ? <Check className="mr-1.5 h-4 w-4" /> : <Plus className="mr-1.5 h-4 w-4" />)}
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
