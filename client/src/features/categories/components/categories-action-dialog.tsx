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
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { useCategories } from '../context/categories-context'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { createCategory, updateCategory } from '@/stores/category.slice'
import { useEffect, useState } from 'react'
import { useLanguage } from '@/context/language-context'
import ImageUpload from '@/components/image-upload'

const categoryFormSchema = z.object({
  name: z.string().min(1, 'Category name is required'),
  image: z.object({
    url: z.string(),
    publicId: z.string(),
  }).optional(),
})

type CategoryFormValues = z.infer<typeof categoryFormSchema>

interface CategoriesActionDialogProps {
  setFetch: (fetch: boolean) => void
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
      image: undefined,
    },
  })

  // Reset form when dialog opens/closes or category changes
  useEffect(() => {
    if (state.open) {
      if (state.currentCategory) {
        // Edit mode
        form.reset({
          name: state.currentCategory.name,
          image: state.currentCategory.image || undefined,
        })
      } else {
        // Create mode
        form.reset({
          name: '',
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
      setFetch(true)
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

  return (
    <Dialog open={state.open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {state.currentCategory ? t('edit_category') : t('add_category')}
          </DialogTitle>
          <DialogDescription className='mt-3'>
            {state.currentCategory
              ? t('update_category_description')
              : t('create_category_description')
            }
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">


            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('category_name')} *</FormLabel>
                  <FormControl>
                    <Input placeholder={t('enter_category_name')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="image"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('category_image')} ({t('optional')})</FormLabel>
                  <FormControl>
                    <ImageUpload
                      onImageUpload={handleImageUpload}
                      onImageRemove={handleImageRemove}
                      currentImageUrl={field.value?.url || ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
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
      </DialogContent>
    </Dialog>
  )
}
