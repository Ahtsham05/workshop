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
import { Textarea } from '@/components/ui/textarea'
import toast from 'react-hot-toast'
import { useEffect } from 'react'
import { useBrands } from '../context/brands-context'
import { useCreateBrandMutation, useUpdateBrandMutation } from '@/stores/brand.api'
import ImageUpload from '@/components/image-upload'
import { EntityFormSection } from '@/components/entity-form-section'
import { handleFormEnterKeyDown } from '@/lib/form-enter-navigation'
import {
  Building2,
  Globe,
  MapPin,
  User,
  Phone as PhoneIcon,
  Mail,
  FileText,
  Image as ImageIcon,
} from 'lucide-react'

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
      <DialogContent className='flex max-h-[92vh] w-[calc(100vw-1.25rem)] max-w-[min(94vw,900px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(94vw,900px)]'>
        <DialogHeader className='shrink-0 flex-row items-start gap-3 space-y-0 border-b border-border/60 px-6 pb-4 pt-6 text-left'>
          <span className='mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground'>
            <Building2 className='h-5 w-5' />
          </span>
          <div className='space-y-1'>
            <DialogTitle className='text-xl'>
              {state.currentBrand ? 'Edit Brand' : 'Add Brand'}
            </DialogTitle>
            <DialogDescription>
              {state.currentBrand ? 'Update this brand.' : 'Create a new brand for your products.'}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className='min-h-0 flex-1 overflow-y-auto px-6 py-4'>
          <Form {...form}>
            <form
              id='brand-form'
              onSubmit={form.handleSubmit(onSubmit)}
              onKeyDown={handleFormEnterKeyDown}
              className='space-y-4'
            >
              <EntityFormSection
                icon={<Building2 />}
                tone='sky'
                className='p-3 sm:p-4'
                title='Brand details'
                description='The name is required — everything else helps identify the brand but can be filled in later.'
              >
                <FormField
                  control={form.control}
                  name='name'
                  render={({ field }) => (
                    <FormItem className='gap-1.5'>
                      <FormLabel>Brand name *</FormLabel>
                      <FormControl>
                        <div className='relative'>
                          <Building2 className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                          <SmartInput
                            placeholder='e.g. Samsung'
                            showVoiceInput
                            className='pl-9'
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
                  <FormField
                    control={form.control}
                    name='website'
                    render={({ field }) => (
                      <FormItem className='gap-1.5'>
                        <FormLabel>Website</FormLabel>
                        <FormControl>
                          <div className='relative'>
                            <Globe className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                            <Input placeholder='https://...' className='pl-9' {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name='country'
                    render={({ field }) => (
                      <FormItem className='gap-1.5'>
                        <FormLabel>Country</FormLabel>
                        <FormControl>
                          <div className='relative'>
                            <MapPin className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                            <Input placeholder='e.g. South Korea' className='pl-9' {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name='status'
                    render={({ field }) => (
                      <FormItem className='gap-1.5'>
                        <FormLabel>Status</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger className='w-full'>
                              <SelectValue placeholder='Select status' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value='active'>Active</SelectItem>
                            <SelectItem value='inactive'>Inactive</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
                  <FormField
                    control={form.control}
                    name='contactPerson'
                    render={({ field }) => (
                      <FormItem className='gap-1.5'>
                        <FormLabel>Contact person</FormLabel>
                        <FormControl>
                          <div className='relative'>
                            <User className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                            <Input placeholder='Optional' className='pl-9' {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name='phone'
                    render={({ field }) => (
                      <FormItem className='gap-1.5'>
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <div className='relative'>
                            <PhoneIcon className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                            <Input fieldType='phone' placeholder='Optional' className='pl-9' {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name='email'
                    render={({ field }) => (
                      <FormItem className='gap-1.5'>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <div className='relative'>
                            <Mail className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                            <Input placeholder='Optional' className='pl-9' {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name='description'
                  render={({ field }) => (
                    <FormItem className='gap-1.5'>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <div className='relative'>
                          <FileText className='pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground' />
                          <Textarea placeholder='Optional description' className='min-h-[4rem] pl-9' {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </EntityFormSection>

              <EntityFormSection
                icon={<ImageIcon />}
                tone='emerald'
                className='p-3 sm:p-4'
                title='Logo'
                description='Optional — shown next to the brand name in lists and pickers.'
              >
                <FormField
                  control={form.control}
                  name='logo'
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <ImageUpload
                          onImageUpload={(img) => form.setValue('logo', img)}
                          onImageRemove={() => form.setValue('logo', undefined)}
                          currentImageUrl={field.value?.url || ''}
                          layout='compact'
                          uploadSlug='brands/upload-image'
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </EntityFormSection>
            </form>
          </Form>
        </div>

        <DialogFooter className='shrink-0 border-t border-border/60 bg-background/95 px-6 py-4'>
          <Button type='button' variant='outline' onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type='submit' form='brand-form' disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : state.currentBrand ? 'Update Brand' : 'Create Brand'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
