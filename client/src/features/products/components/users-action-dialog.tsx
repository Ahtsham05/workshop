'use client'

import { useState, useEffect } from 'react'
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
import { useDispatch, useSelector } from 'react-redux'
import { AppDispatch, RootState } from '@/stores/store'
import { addProduct, updateProduct } from '@/stores/product.slice'
import { fetchCategories } from '@/stores/category.slice'
import toast from 'react-hot-toast'
import { useLanguage } from '@/context/language-context'
import InlineBarcodeInput from '@/components/inline-barcode-input'
import { Badge } from '@/components/ui/badge'
import { X, Search, Check } from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
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
  categories: z.array(z.object({
    _id: z.string(),
    name: z.string(),
    image: z.object({
      url: z.string(),
      publicId: z.string(),
    }).optional(),
  })).optional(),
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
  const { t, isRTL } = useLanguage()
  const [imageKey, setImageKey] = useState(0) // Force image component re-render
  const [imageRemoved, setImageRemoved] = useState(false) // Track if image was manually removed
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  
  const dispatch = useDispatch<AppDispatch>()
  const { categories } = useSelector((state: RootState) => state.category)
  
  // Fetch categories when dialog opens
  useEffect(() => {
    if (open && categories.length === 0) {
      dispatch(fetchCategories({ page: 1, limit: 100 }))
    }
  }, [open, dispatch, categories.length])
  
  const form = useForm<productForm>({
    resolver: zodResolver(formSchema),
    defaultValues: isEdit
      ? {
        name: currentRow?.name || '',
        description: currentRow?.description || '',
        barcode: currentRow?.barcode || '',
        price: currentRow?.price || 0,
        cost: currentRow?.cost || 0,
        stockQuantity: currentRow?.stockQuantity || 0,
        image: currentRow?.image || undefined,
        categories: currentRow?.categories || [],
      }
      : {
        name: '',
        description: '',
        barcode: '',
        stockQuantity: 0,
        price: 0,
        cost: 0,
        image: undefined,
        categories: [],
      },
  })

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
        setImageRemoved(false) // Reset image removed flag when dialog opens/closes
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
                    <FormLabel className='col-span-2 md:text-right'>
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
                    <FormLabel className='col-span-2 md:text-right'>
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
                name='categories'
                render={({ field }) => (
                  <FormItem className='grid grid-cols-6 space-y-0 gap-x-4 gap-y-1'>
                    <FormLabel className={`col-span-2 items-start mt-3 ${isRTL ? 'text-right' : 'md:text-right'}`}>
                      {t('categories')}
                    </FormLabel>
                    <FormControl>
                      <div className='col-span-4 space-y-2'>
                        {/* Category Selection Dropdown */}
                        <Popover open={categoriesOpen} onOpenChange={setCategoriesOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={categoriesOpen}
                              className="w-full justify-between min-h-[2.5rem] h-auto py-0"
                            >
                              <div className="flex items-center gap-2 flex-1">
                                <Search className="w-4 h-4 flex-shrink-0" />
                                {field.value && field.value.length > 0 ? (
                                  <div className="flex flex-wrap items-center gap-1 flex-1">
                                    {field.value.map((category) => (
                                      <Badge key={category._id} variant="secondary" className="flex items-center gap-1">
                                        {category.image?.url && (
                                          <img 
                                            src={category.image.url} 
                                            alt={category.name}
                                            className="w-3 h-3 rounded-full object-cover"
                                          />
                                        )}
                                        <span className="text-xs">{category.name}</span>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            const newCategories = field.value?.filter(c => c._id !== category._id) || []
                                            field.onChange(newCategories)
                                          }}
                                          className="ml-1 hover:bg-gray-200 rounded-full p-0.5"
                                        >
                                          <X className="w-2 h-2" />
                                        </button>
                                      </Badge>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">{t('select_categories')}</span>
                                )}
                              </div>
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[300px] p-0" align={isRTL ? "end" : "start"}>
                            <Command>
                              <CommandInput placeholder={t('search_categories')} />
                              <CommandEmpty>{t('no_categories_found')}</CommandEmpty>
                              <CommandList>
                                <CommandGroup>
                                  {categories.map((category) => {
                                    const isSelected = field.value?.some(c => c._id === category.id) || false
                                    return (
                                      <CommandItem
                                        key={category.id}
                                        onSelect={() => {
                                          const currentCategories = field.value || []
                                          if (isSelected) {
                                            // Remove category
                                            const newCategories = currentCategories.filter(c => c._id !== category.id)
                                            field.onChange(newCategories)
                                          } else {
                                            // Add category
                                            const newCategories = [...currentCategories, {
                                              _id: category.id,
                                              name: category.name,
                                              image: category.image
                                            }]
                                            field.onChange(newCategories)
                                          }
                                        }}
                                        className="flex items-center gap-2 cursor-pointer"
                                      >
                                        <div className="flex items-center gap-2 flex-1">
                                          {category.image?.url && (
                                            <img 
                                              src={category.image.url} 
                                              alt={category.name}
                                              className="w-6 h-6 rounded-full object-cover"
                                            />
                                          )}
                                          <span>{category.name}</span>
                                        </div>
                                        {isSelected && (
                                          <div className="w-4 h-4 rounded-sm flex items-center justify-center">
                                            <Check className="w-3 h-3 text-black" />
                                          </div>
                                        )}
                                      </CommandItem>
                                    )
                                  })}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
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
                    <FormLabel className='col-span-2 md:text-right items-start mt-3'>
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
                              <Button type="button" variant="outline" size="sm" className="w-full text-xs sm:text-sm">
                                <Camera className="h-4 w-4 mr-2 text-xs sm:text-sm" />
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
                    <FormLabel className='col-span-2 md:text-right pt-2'>
                      {t('product_image')}
                    </FormLabel>
                    <FormControl>
                      <div className='col-span-4'>
                        <ImageUpload
                          key={`image-${imageKey}-${field.value ? 'has-image' : 'no-image'}`} // Force re-render when image changes
                          onImageUpload={(imageData) => {
                            console.log('Form received image data:', imageData) // Debug log
                            setImageRemoved(false) // Reset removed flag when new image is uploaded
                            field.onChange(imageData)
                          }}
                          onImageRemove={() => {
                            console.log('Form removing image, current value:', field.value) // Debug log
                            
                            // Set local state to immediately hide image
                            setImageRemoved(true)
                            
                            // Try multiple approaches to ensure field is cleared
                            field.onChange(undefined)
                            form.setValue('image', undefined, { shouldValidate: true, shouldDirty: true })
                            form.resetField('image', { defaultValue: undefined })
                            form.trigger('image') // Force field validation and re-render
                            
                            // Force component re-render
                            setImageKey(prev => prev + 1)
                            
                            console.log('Form after remove, new value:', form.getValues('image'))
                            console.log("field.value?.url after remove:", field.value?.url)
                            
                            // Check if field updates after a short delay
                            setTimeout(() => {
                              console.log('Field value after timeout:', field.value)
                              console.log('Form getValue after timeout:', form.getValues('image'))
                            }, 100)
                          }}
                          currentImageUrl={imageRemoved ? undefined : field.value?.url}
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
                    <FormLabel className='col-span-2 md:text-right'>
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
                    <FormLabel className='col-span-2 md:text-right'>
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
                    <FormLabel className='col-span-2 md:text-right'>
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
