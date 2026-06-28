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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import SmartInput from '@/components/smart-input.tsx'
import { Input } from '@/components/ui/input'
import toast from 'react-hot-toast'
import { useEffect, useState } from 'react'
import { useBrands } from '../context/brands-context'
import { useCreateBrandMutation, useUpdateBrandMutation } from '@/stores/brand.api'
import ImageUpload from '@/components/image-upload'

const brandFormSchema = z.object({
  name: z.string().min(1, 'Brand name is required'),
  description: z.string().optional(),
  website: z.string().optional(),
  contactPerson: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  country: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  logo: z.object({
    url: z.string(),
    publicId: z.string(),
  }).optional(),
})

type BrandFormValues = z.infer<typeof brandFormSchema>

const emptyValues: BrandFormValues = {
  name: '',
  description: '',
  website: '',
  contactPerson: '',
  email: '',
  phone: '',
  country: '',
  status: 'active',
  logo: undefined,
}

export function BrandsActionDialog() {
  const { state, dispatch: contextDispatch } = useBrands()
  const [createBrand, { isLoading: isCreating }] = useCreateBrandMutation()
  const [updateBrand, { isLoading: isUpdating }] = useUpdateBrandMutation()
  const isSubmitting = isCreating || isUpdating

  const form = useForm<BrandFormValues>({
    resolver: zodResolver(brandFormSchema),
    defaultValues: emptyValues,
  })

  useEffect(() => {
    if (!state.open) return
    if (state.currentBrand) {
      form.reset({
        name: state.currentBrand.name,
        description: state.currentBrand.description || '',
        website: state.currentBrand.website || '',
        contactPerson: state.currentBrand.contactPerson || '',
        email: state.currentBrand.email || '',
        phone: state.currentBrand.phone || '',
        country: state.currentBrand.country || '',
        status: state.currentBrand.status || 'active',
        logo: state.currentBrand.logo || undefined,
      })
    } else {
      form.reset(emptyValues)
    }
  }, [state.open, state.currentBrand, form])

  const handleClose = () => {
    contextDispatch({ type: 'SET_OPEN', payload: false })
    contextDispatch({ type: 'SET_BRAND', payload: null })
    form.reset(emptyValues)
  }

  const onSubmit = async (data: BrandFormValues) => {
    try {
      if (state.currentBrand) {
        const id = state.currentBrand._id || state.currentBrand.id || ''
        await updateBrand({ brandId: id, data }).unwrap()
        toast.success(`Brand "${data.name}" updated`)
      } else {
        await createBrand(data).unwrap()
        toast.success(`Brand "${data.name}" created`)
      }
      handleClose()
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to save brand')
    }
  }

  return (
    <Dialog open={state.open} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b border-border/60 px-6 pb-4 pt-6">
          <DialogTitle className="text-xl">
            {state.currentBrand ? 'Edit Brand' : 'Add Brand'}
          </DialogTitle>
          <DialogDescription className="mt-2">
            {state.currentBrand ? 'Update this brand.' : 'Create a new brand for your products.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base">Brand name *</FormLabel>
                      <FormControl>
                        <SmartInput placeholder="e.g. Samsung" showVoiceInput className="min-h-11 text-base" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base">Description</FormLabel>
                      <FormControl>
                        <Input placeholder="Optional description" showVoiceInput={false} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base">Website</FormLabel>
                        <FormControl>
                          <Input placeholder="https://..." showVoiceInput={false} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="country"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base">Country</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. South Korea" showVoiceInput={false} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="contactPerson"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base">Contact person</FormLabel>
                        <FormControl>
                          <Input placeholder="Optional" showVoiceInput={false} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base">Phone</FormLabel>
                        <FormControl>
                          <Input placeholder="Optional" showVoiceInput={false} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base">Email</FormLabel>
                      <FormControl>
                        <Input placeholder="Optional" showVoiceInput={false} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base">Status</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="logo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base">Logo (optional)</FormLabel>
                      <FormControl>
                        <ImageUpload
                          onImageUpload={(img) => form.setValue('logo', img)}
                          onImageRemove={() => form.setValue('logo', undefined)}
                          currentImageUrl={field.value?.url || ''}
                          layout="comfortable"
                          uploadSlug="brands/upload-image"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter className="shrink-0 border-t border-border/60 bg-background/95 px-6 py-4">
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : state.currentBrand ? 'Update Brand' : 'Create Brand'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
