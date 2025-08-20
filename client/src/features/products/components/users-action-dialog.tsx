'use client'

import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
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
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { addProduct, updateProduct } from '@/stores/product.slice'
import toast from 'react-hot-toast'
import { useLanguage } from '@/context/language-context'
import InlineBarcodeInput from '@/components/inline-barcode-input'
import MobileCameraScanner from '@/components/mobile-camera-scanner'
import ImageUpload from '@/components/image-upload'
import { Camera } from 'lucide-react'

const formSchema = z.object({
  name: z.string().min(1, { message: 'Name is required.' }),
  description: z.string(),
  barcode: z.string().optional(),
  price: z.number().min(1, { message: 'Price is required.' }),
  cost: z.number().min(1, { message: 'Cost is required.' }),
  stockQuantity: z.number().min(1, { message: 'Stock quantity is required.' }),
  image: z.object({
    url: z.string(),
    publicId: z.string(),
  }).optional(),
})

type productForm = z.infer<typeof formSchema>

interface Props {
  currentRow?: any
  open: boolean
  onOpenChange: (open: boolean) => void
  setFetch: any
}

export function UsersActionDialog({ currentRow, open, onOpenChange, setFetch }: Props) {
  const isEdit = !!currentRow
  const { t } = useLanguage()
  
  const form = useForm<productForm>({
    resolver: zodResolver(formSchema),
    defaultValues: isEdit
      ? {
        name: currentRow?.name || '',
        description: currentRow?.description || '',
        barcode: currentRow?.barcode || '',
        price: typeof currentRow?.price === 'string' ? parseFloat(currentRow.price) : (currentRow?.price || 0),
        cost: typeof currentRow?.cost === 'string' ? parseFloat(currentRow.cost) : (currentRow?.cost || 0),
        stockQuantity: currentRow?.stockQuantity || 0,
        image: currentRow?.image || undefined,
      }
      : {
        name: '',
        description: '',
        barcode: '',
        stockQuantity: 0,
        price: 0,
        cost: 0,
        image: undefined,
      },
  })

  const dispatch = useDispatch<AppDispatch>()

  const onSubmit = async (values: productForm) => {
    if (isEdit) {
      await dispatch(updateProduct({ ...values, _id: currentRow?.id || currentRow?._id })).then(() => {
        toast.success(t('product_updated_successfully'))
        setFetch((prev: any) => !prev)
      })
    } else {
      await dispatch(addProduct(values)).then(() => {
        toast.success(t('product_created_successfully'))
        setFetch((prev: any) => !prev)
      })
    }
    form.reset()
    onOpenChange(false)
  }


  const setNumericValue = (field: any, value: any) => {
    form.setValue(field, Number(value), { shouldValidate: true })
  }
  // const isDirty = !!form.formState.dirtyFields
  
  return (
    <Dialog
      open={open}
      onOpenChange={(state) => {
        form.reset()
        onOpenChange(state)
      }}
    >
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader className='text-left'>
          <DialogTitle className='mb-2'>{isEdit ? t('edit_product') : t('add_product')}</DialogTitle>
          <DialogDescription>
            {isEdit ? t('update_product_description') : t('create_product_description')}
          </DialogDescription>
        </DialogHeader>
        <div className='-mr-4 h-[26.25rem] w-full overflow-y-auto py-1 pr-4'>
          <Form {...form}>
            <form
              id='user-form'
              onSubmit={form.handleSubmit(onSubmit)}
              className='space-y-4 p-0.5'
            >
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem className='grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1'>
                    <FormLabel className='col-span-2 text-right'>
                      {t('product_name')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('product_name')}
                        className='col-span-4'
                        autoComplete='off'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className='col-span-4 col-start-3' />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='description'
                render={({ field }) => (
                  <FormItem className='grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1'>
                    <FormLabel className='col-span-2 text-right'>
                      {t('description')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('description')}
                        className='col-span-4'
                        autoComplete='off'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className='col-span-4 col-start-3' />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='barcode'
                render={({ field }) => (
                  <FormItem className='grid grid-cols-6 space-y-0 gap-x-4 gap-y-1'>
                    <FormLabel className='col-span-2 text-right items-start mt-3'>
                      {t('barcode')}
                    </FormLabel>
                    <FormControl>
                      <div className='col-span-4 space-y-2'>
                        <InlineBarcodeInput
                          onBarcodeEntered={(barcode) => {
                            field.onChange(barcode)
                          }}
                          placeholder={t('enter_or_scan_barcode')}
                          value={field.value}
                          onChange={field.onChange}
                          className="w-full"
                        />
                        <div className="text-center">
                          <MobileCameraScanner
                            onScanResult={(barcode) => {
                              field.onChange(barcode)
                            }}
                            trigger={
                              <Button type="button" variant="outline" size="sm" className="w-full">
                                <Camera className="h-4 w-4 mr-2" />
                                {t('scan_with_camera')}
                              </Button>
                            }
                          />
                        </div>
                      </div>
                    </FormControl>
                    <FormMessage className='col-span-4 col-start-3' />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='image'
                render={({ field }) => {
                  console.log('Form image field:', field.value) // Debug log
                  return (
                  <FormItem className='grid grid-cols-6 items-start space-y-0 gap-x-4 gap-y-1'>
                    <FormLabel className='col-span-2 text-right pt-2'>
                      {t('product_image')}
                    </FormLabel>
                    <FormControl>
                      <div className='col-span-4'>
                        <ImageUpload
                          onImageUpload={(imageData) => {
                            console.log('Form received image data:', imageData) // Debug log
                            field.onChange(imageData)
                          }}
                          onImageRemove={() => {
                            console.log('Form removing image') // Debug log
                            field.onChange(undefined)
                          }}
                          currentImageUrl={field.value?.url}
                          className="w-full p-0"
                        />
                        {/* Debug info - remove in production */}
                        {/* <div className="mt-2 text-xs text-gray-500">
                          Field value: {JSON.stringify(field.value)}
                        </div> */}
                      </div>
                    </FormControl>
                    <FormMessage className='col-span-4 col-start-3' />
                  </FormItem>
                )
                }}
              />
              <FormField
                control={form.control}
                name='price'
                render={({ field }) => (
                  <FormItem className='grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1'>
                    <FormLabel className='col-span-2 text-right'>
                      {t('price')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('price')}
                        className='col-span-4'
                        type='number'
                        {...field}
                        onChange={(e) => {
                          setNumericValue('price', e.target.value)
                          // field.onChange(e)
                        }}
                      />
                    </FormControl>
                    <FormMessage className='col-span-4 col-start-3' />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='cost'
                render={({ field }) => (
                  <FormItem className='grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1'>
                    <FormLabel className='col-span-2 text-right'>
                      {t('cost')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('cost')}
                        className='col-span-4'
                        type='number'
                        {...field}
                        onChange={(e) => {
                          setNumericValue('cost', e.target.value)
                          // field.onChange(e)
                        }}
                      />
                    </FormControl>
                    <FormMessage className='col-span-4 col-start-3' />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='stockQuantity'
                render={({ field }) => (
                  <FormItem className='grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1'>
                    <FormLabel className='col-span-2 text-right'>
                      {t('stock_quantity')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('stock_quantity')}
                        className='col-span-4'
                        type='number'
                        {...field}
                        onChange={(e) => {
                          setNumericValue('stockQuantity', e.target.value)
                          // field.onChange(e)
                        }}
                      />
                    </FormControl>
                    <FormMessage className='col-span-4 col-start-3' />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </div>
        <DialogFooter>
          <Button type='submit' form='user-form'>
            {t('save_changes')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
