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
import { createCategory, updateCategory } from '@/stores/category.slice'
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { useLanguage } from '@/context/language-context'
import ImageUpload from '@/components/image-upload'
import { Input } from '@/components/ui/input'
import { useAutoUrduNameFromEnglish } from '@/hooks/use-auto-urdu-name-from-english'

const categoryFormSchema = z.object({
  name: z.string().min(1, 'Category name is required'),
  nameUrdu: z.string().optional(),
  image: z.object({
    url: z.string(),
    publicId: z.string(),
  }).optional(),
})

type CategoryFormValues = z.infer<typeof categoryFormSchema>

interface CategoriesActionDialogProps {
  setFetch: Dispatch<SetStateAction<boolean>>
}

export function CategoriesActionDialog({ setFetch }: CategoriesActionDialogProps) {
  const { state, dispatch: contextDispatch } = useCategories()
  const reduxDispatch = useDispatch<AppDispatch>()
  const { t } = useLanguage()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: '',
      nameUrdu: '',
      image: undefined,
    },
  })

  const categorySessionKey = state.open ? (state.currentCategory?._id ?? 'new') : null
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
        })
      } else {
        // Create mode
        form.reset({
          name: '',
          nameUrdu: '',
          image: undefined,
        })
      }
    }
  }, [state.open, state.currentCategory, form])

  async function onSubmit(data: CategoryFormValues) {
    setIsSubmitting(true)
    try {
      if (state.currentCategory) {
        // Update existing category
        await reduxDispatch(updateCategory({
          id: state.currentCategory.id,
          ...data
        })).unwrap()
        toast.success(t('category_updated_successfully'))
      } else {
        // Create new category
        await reduxDispatch(createCategory(data)).unwrap()
        toast.success(t('category_created_successfully'))
      }

      contextDispatch({ type: 'SET_OPEN', payload: false })
      contextDispatch({ type: 'SET_CATEGORY', payload: null })
      setFetch((previous) => !previous)
    } catch (error) {
      toast.error(state.currentCategory ? t('category_update_failed') : t('category_creation_failed'))
    } finally {
      setIsSubmitting(false)
    }
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

  return (
    <Dialog open={state.open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[min(90vh,880px)] w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b border-border/60 px-6 pb-4 pt-6">
          <DialogTitle className="text-xl">
            {state.currentCategory ? t('edit_category') : t('add_category')}
          </DialogTitle>
          <DialogDescription className='mt-2'>
            {state.currentCategory
              ? t('update_category_description')
              : t('create_category_description')
            }
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
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
                        className="min-h-11 text-base"
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
                        className="min-h-11 text-base text-right"
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
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? t('saving')
                  : state.currentCategory
                    ? t('update_category')
                    : t('create_category')
                }
              </Button>
            </DialogFooter>
          </form>
        </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
