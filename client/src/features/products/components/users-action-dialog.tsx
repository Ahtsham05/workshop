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
import { Label } from '@/components/ui/label'
import { useDispatch, useSelector } from 'react-redux'
import { AppDispatch, RootState } from '@/stores/store'
import { addProduct, updateProduct } from '@/stores/product.slice'
import { fetchCategories, createCategory } from '@/stores/category.slice'
import toast from 'react-hot-toast'
import { useLanguage } from '@/context/language-context'
import InlineBarcodeInput from '@/components/inline-barcode-input'
import { VoiceInputButton } from '@/components/ui/voice-input-button'
import { Badge } from '@/components/ui/badge'
import { X, Search, Check, Plus } from 'lucide-react'
import SmartInput from '@/components/smart-input.tsx'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import MobileCameraScanner from '@/components/mobile-camera-scanner'
import ImageUpload from '@/components/image-upload'
import { Camera } from 'lucide-react'
import { getAllUnits, DEFAULT_UNIT } from '@/lib/units'
import { isWholesaleRetailBusiness } from '@/lib/business-types'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { useAutoUrduNameFromEnglish } from '@/hooks/use-auto-urdu-name-from-english'
import { EntityFormSection } from '@/components/entity-form-section'
import { useGetOpeningStockImeisQuery, imeiApi } from '@/stores/imei.api'
import { useGetProductQuery, productApi } from '@/stores/product.api'
import { ProductVariantsSection } from './variants/product-variants-section'
import { VariantInventoryTable } from './variants/variant-inventory-table'
import { ProductDefaultVariantBatchPanel } from './variants/product-default-variant-batch-panel'
import type { VariantDraftRow } from './variants/generate-variant-combinations'
import { generateBatchNumber } from './variants/generate-variant-combinations'
import { useCreateProductVariantMutation } from '@/stores/productVariant.api'
import { BrandSelector } from './brand-selector'

const formSchema = z.object({
  name: z.string().min(1, { message: 'Name is required.' }),
  nameUrdu: z.string().optional(),
  description: z.string(),
  sku: z.string().optional(),
  brandId: z.string().optional(),
  barcode: z.string().optional(),
  hasVariants: z.boolean().optional(),
  trackImei: z.boolean().optional(),
  trackBatch: z.boolean().optional(),
  trackExpiry: z.boolean().optional(),
  // Opening-batch identity, only used the first time trackBatch/trackExpiry is turned
  // on for a product that already has stock — see syncDefaultVariantTracking.
  batchNumber: z.string().optional(),
  expiryDate: z.string().optional(),
  warrantyMonths: z.number().min(0).optional(),
  imeis: z.array(z.string()).optional(),
  // No .min() here — price/cost/stock are only required for products WITHOUT variants;
  // see the superRefine below. Once variants exist these fields are unused fallbacks
  // (each variant has its own price/cost/stock) and are hidden from the form entirely.
  price: z.number().min(0),
  cost: z.number().min(0),
  stockQuantity: z.number().min(0, { message: 'Stock quantity cannot be negative.' }),
  unit: z.string().optional(),
  unitConversions: z.array(z.object({
    fromUnit: z.string().min(1),
    toUnit: z.string().min(1),
    factor: z.number().positive(),
    businessTypes: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
  })).optional(),
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
}).superRefine((data, ctx) => {
  if (data.hasVariants) return
  if (!data.price || data.price < 1) {
    ctx.addIssue({ code: 'custom', path: ['price'], message: 'Sale price is required.' })
  }
  if (!data.cost || data.cost < 1) {
    ctx.addIssue({ code: 'custom', path: ['cost'], message: 'Purchase price is required.' })
  }
})

type productForm = z.infer<typeof formSchema>

interface Props {
  currentRow?: any
  open: boolean
  onOpenChange: (open: boolean) => void
  setFetch?: any
  onCreated?: (entity: any) => void
  defaultName?: string
}

export function UsersActionDialog({ currentRow, open, onOpenChange, setFetch, onCreated, defaultName }: Props) {
  const isEdit = !!currentRow
  const { t, isRTL } = useLanguage()
  const [imageKey, setImageKey] = useState(0) // Force image component re-render
  const [imageRemoved, setImageRemoved] = useState(false) // Track if image was manually removed
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [categorySearchQuery, setCategorySearchQuery] = useState('')
  const [isCreatingCategory, setIsCreatingCategory] = useState(false)
  const [draftVariants, setDraftVariants] = useState<VariantDraftRow[]>([])
  const [unitsOpen, setUnitsOpen] = useState(false)
  const [imeiDraft, setImeiDraft] = useState('')
  
  const dispatch = useDispatch<AppDispatch>()
  const [createProductVariant] = useCreateProductVariantMutation()
  const { categories } = useSelector((state: RootState) => state.category)
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: orgData } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })
  const showConversionRules = isWholesaleRetailBusiness(orgData?.businessType || user?.businessType)
  
  // Refetch categories when dialog opens (in case new ones were added)
  useEffect(() => {
    if (open) {
      dispatch(fetchCategories({ page: 1, limit: 100 }))
    }
  }, [open, dispatch, categories.length])
  
  const form = useForm<productForm>({
    resolver: zodResolver(formSchema),
    defaultValues: isEdit
      ? {
        name: currentRow?.name || '',
        nameUrdu: currentRow?.nameUrdu || '',
        description: currentRow?.description || '',
        sku: currentRow?.sku || '',
        brandId: currentRow?.brandId || undefined,
        barcode: currentRow?.barcode || '',
        hasVariants: currentRow?.hasVariants || false,
        trackImei: currentRow?.trackImei || false,
        trackBatch: currentRow?.trackBatch || false,
        trackExpiry: currentRow?.trackExpiry || false,
        batchNumber: '',
        expiryDate: '',
        warrantyMonths: currentRow?.warrantyMonths || 0,
        price: currentRow?.price || 0,
        cost: currentRow?.cost || 0,
        stockQuantity: currentRow?.stockQuantity || 0,
        unit: currentRow?.unit || DEFAULT_UNIT,
        unitConversions: currentRow?.unitConversions || [],
        image: currentRow?.image || undefined,
        categories: currentRow?.categories || [],
      }
      : {
        name: '',
        nameUrdu: '',
        description: '',
        sku: '',
        brandId: undefined,
        barcode: '',
        hasVariants: false,
        trackImei: false,
        trackBatch: false,
        trackExpiry: false,
        batchNumber: '',
        expiryDate: '',
        warrantyMonths: 0,
        imeis: [],
        stockQuantity: 0,
        price: 0,
        cost: 0,
        unit: DEFAULT_UNIT,
        unitConversions: [],
        image: undefined,
        categories: [],
      },
  })

  useEffect(() => {
    if (!open) return
    if (isEdit && currentRow) {
      form.reset({
        name: currentRow.name || '',
        nameUrdu: currentRow.nameUrdu || '',
        description: currentRow.description || '',
        sku: currentRow.sku || '',
        brandId: currentRow.brandId || undefined,
        barcode: currentRow.barcode || '',
        hasVariants: currentRow.hasVariants || false,
        trackImei: currentRow.trackImei || false,
        trackBatch: currentRow.trackBatch || false,
        trackExpiry: currentRow.trackExpiry || false,
        batchNumber: '',
        expiryDate: '',
        warrantyMonths: currentRow.warrantyMonths || 0,
        price: currentRow.price || 0,
        cost: currentRow.cost || 0,
        stockQuantity: currentRow.stockQuantity || 0,
        unit: currentRow.unit || DEFAULT_UNIT,
        unitConversions: currentRow.unitConversions || [],
        image: currentRow.image || undefined,
        categories: currentRow.categories || [],
      })
    } else {
      form.reset({
        name: '',
        nameUrdu: '',
        description: '',
        sku: '',
        brandId: undefined,
        barcode: '',
        hasVariants: false,
        trackImei: false,
        trackBatch: false,
        trackExpiry: false,
        batchNumber: '',
        expiryDate: '',
        warrantyMonths: 0,
        stockQuantity: 0,
        price: 0,
        cost: 0,
        unit: DEFAULT_UNIT,
        unitConversions: [],
        image: undefined,
        categories: [],
      })
    }
    setImageRemoved(false)
    setDraftVariants([])
  }, [open, currentRow, isEdit, form])

  const productSessionKey = open ? (currentRow?.id ?? currentRow?._id ?? 'new') : null
  useAutoUrduNameFromEnglish(form, 'name', 'nameUrdu', productSessionKey)

  const editingProductId = isEdit ? (currentRow?.id || currentRow?._id) : undefined
  // currentRow comes from the paginated product list, which doesn't carry
  // trackBatch/trackExpiry (only the single-product GET does) — fetch fresh so the
  // checkboxes reflect reality instead of always defaulting to unchecked.
  const { data: freshProduct } = useGetProductQuery(editingProductId!, {
    skip: !open || !isEdit || !editingProductId,
  })
  useEffect(() => {
    if (!open || !isEdit || !freshProduct) return
    form.setValue('trackBatch', !!freshProduct.trackBatch)
    form.setValue('trackExpiry', !!freshProduct.trackExpiry)
  }, [open, isEdit, freshProduct, form])
  const { data: openingStockImeis } = useGetOpeningStockImeisQuery(
    { productId: editingProductId },
    { skip: !open || !isEdit || !editingProductId },
  )
  useEffect(() => {
    if (!open || !isEdit || !openingStockImeis) return
    form.setValue('imeis', openingStockImeis.map((d) => d.imei))
  }, [open, isEdit, openingStockImeis, form])

  useEffect(() => {
    if (!open || isEdit || !defaultName?.trim()) return
    form.setValue('name', defaultName.trim())
  }, [open, isEdit, defaultName, form])

  // Creates the new ProductVariant + Inventory rows for any draft variants generated in
  // this session. Runs after the product itself is saved, since the variant-create
  // endpoint needs a real productId. Failures here are reported but don't roll back the
  // product save — the product is already valid and usable without variants.
  const createPendingVariants = async (productId: string) => {
    if (draftVariants.length === 0) return
    let failures = 0
    for (const row of draftVariants) {
      try {
        await createProductVariant({
          productId,
          data: {
            sku: row.sku || undefined,
            barcode: row.barcode || undefined,
            attributes: row.attributes,
            price: row.price,
            cost: row.cost,
            quantity: row.quantity,
            trackBatch: row.trackBatchOrExpiry,
            trackExpiry: row.trackBatchOrExpiry,
            batchNumber: row.trackBatchOrExpiry ? (row.batchNumber || undefined) : undefined,
            expiryDate: row.trackBatchOrExpiry ? (row.expiryDate || undefined) : undefined,
          },
        }).unwrap()
      } catch {
        failures++
      }
    }
    if (failures > 0) {
      toast.error(`${failures} of ${draftVariants.length} variant(s) failed to save — edit the product to retry.`)
    } else {
      toast.success(`${draftVariants.length} variant(s) saved.`)
    }
  }

  // Without this, pressing Enter (or clicking Save) while a required field is still
  // invalid (e.g. Sale Price left at 0) fails validation completely silently — looks
  // exactly like the button/Enter key "did nothing".
  const onInvalid = (errors: Record<string, { message?: string }>) => {
    const firstError = Object.values(errors)[0]
    toast.error(firstError?.message || 'Please fill in the required fields before saving.')
  }

  // Enter should move to the next field, like Tab, instead of submitting the form —
  // submission only happens via the Save button. Fields that already use Enter for their
  // own purpose (adding an IMEI, a custom attribute value, a conversion rule, etc.) call
  // e.preventDefault() themselves before this ever runs, so e.defaultPrevented lets us
  // skip those and leave their existing behavior untouched.
  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter' || e.defaultPrevented) return
    const target = e.target as HTMLElement
    if (target.tagName !== 'INPUT') return // let buttons/comboboxes/textareas behave normally
    e.preventDefault()
    const focusable = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
      )
    ).filter((el) => el.offsetParent !== null)
    const nextField = focusable[focusable.indexOf(target) + 1]
    nextField?.focus()
  }

  const onSubmit = async (values: productForm) => {
    if (!isEdit && values.trackImei) {
      const imeiCount = (values.imeis || []).length
      if (imeiCount !== values.stockQuantity) {
        toast.error(`Enter ${values.stockQuantity} IMEI number(s) — ${imeiCount} entered`)
        return
      }
    }
    if (isEdit) {
      const productId = currentRow?.id || currentRow?._id
      await dispatch(updateProduct({ ...values, _id: productId })).then(async () => {
        toast.success(t('product_updated_successfully'))
        if (values.hasVariants && draftVariants.length > 0) {
          await createPendingVariants(productId)
        }
        setFetch?.((prev: any) => !prev)
        dispatch(imeiApi.util.invalidateTags(['Imei']))
        dispatch(productApi.util.invalidateTags([{ type: 'Product', id: productId }]))
      })
    } else {
      try {
        const created = await dispatch(addProduct(values)).unwrap()
        toast.success(t('product_created_successfully'))
        if (values.hasVariants && draftVariants.length > 0) {
          await createPendingVariants(created?.id || created?._id)
        }
        setFetch?.((prev: any) => !prev)
        dispatch(imeiApi.util.invalidateTags(['Imei']))
        onCreated?.(created)
      } catch {
        return
      }
    }
    form.reset()
    onOpenChange(false)
  }


  const setNumericValue = (field: any, value: any) => {
    form.setValue(field, Number(value), { shouldValidate: true })
  }

  // Generate SKU function (e.g. for a "Classic T-Shirt" -> "CLASSIC-X7K3Q")
  const generateSku = () => {
    const namePart = (form.getValues('name') || 'SKU').trim().split(/\s+/)[0].toUpperCase().replace(/[^A-Z0-9]+/g, '') || 'SKU'
    const random = Math.random().toString(36).slice(2, 7).toUpperCase()
    form.setValue('sku', `${namePart}-${random}`, { shouldValidate: true })
    toast.success('SKU generated')
  }

  // Auto-generate SKU when dialog opens for new product
  useEffect(() => {
    if (open && !isEdit && !form.getValues('sku')) {
      generateSku()
    }
  }, [open, isEdit])

  // Generate barcode function
  const generateBarcode = () => {
    const timestamp = Date.now().toString()
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
    const barcode = `${timestamp.slice(-10)}${random}` // 13 digit barcode
    form.setValue('barcode', barcode, { shouldValidate: true })
    toast.success(t('barcode_generated'))
  }

  // Auto-generate barcode when dialog opens for new product
  useEffect(() => {
    if (open && !isEdit && !form.getValues('barcode')) {
      generateBarcode()
    }
  }, [open, isEdit])
  
  // Create a new category inline from the product form's category combobox, then
  // immediately select it (mirrors the inline "create brand" flow in BrandSelector).
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
      toast.success(t('category_created_successfully') || `Category "${name}" created`)
      const currentCategories = form.getValues('categories') || []
      form.setValue('categories', [
        ...currentCategories,
        { _id: created.id, name: created.name, image: created.image },
      ])
      setCategorySearchQuery('')
      setCategoriesOpen(false)
    } catch {
      toast.error(`Failed to create category "${name}"`)
    } finally {
      setIsCreatingCategory(false)
    }
  }

  const nameWatch = form.watch('name')
  const hasVariantsWatch = form.watch('hasVariants')
  const trackBatchWatch = form.watch('trackBatch')
  const trackExpiryWatch = form.watch('trackExpiry')
  const stockQuantityWatch = form.watch('stockQuantity')

  return (
    <Dialog
      open={open}
      onOpenChange={(state) => {
        form.reset()
        setImageRemoved(false) // Reset image removed flag when dialog opens/closes
        setDraftVariants([])
        onOpenChange(state)
      }}
    >
      <DialogContent className='flex h-[95vh] w-[97vw] max-w-[1600px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1600px]'>
        <DialogHeader className='shrink-0 space-y-2 border-b border-border/60 px-6 pb-4 pt-6 text-left'>
          <DialogTitle className='text-xl'>
            {isEdit ? t('edit_product') : t('add_product')}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? t('update_product_description') : t('create_product_description')}
          </DialogDescription>
        </DialogHeader>
        <div className='min-h-0 flex-1 overflow-y-auto px-6 py-4'>
          <Form {...form}>
            <form id='user-form' onSubmit={form.handleSubmit(onSubmit, onInvalid)} onKeyDown={handleFormKeyDown} className='grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4'>
              <EntityFormSection
                title={isEdit ? 'Product details' : 'New product'}
                description='Name, description, and categories shoppers see in menus and lists.'
              >
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem className='gap-1.5'>
                    <FormLabel>{t('product_name')} *</FormLabel>
                    <FormControl>
                      <SmartInput
                        placeholder={t('product_name')}
                        autoComplete='off'
                        showVoiceInput={true}
                        voiceInputSize="sm"
                        className='min-h-11 text-base'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='nameUrdu'
                render={({ field }) => (
                  <FormItem className='gap-1.5'>
                    <FormLabel className={isRTL ? 'text-right' : ''}>{t('name_in_urdu')}</FormLabel>
                    <FormControl>
                      <Input
                        dir='rtl'
                        placeholder={t('name_in_urdu_placeholder')}
                        autoComplete='off'
                        className='text-right'
                        {...field}
                      />
                    </FormControl>
                    <p className='text-xs text-muted-foreground'>{t('name_in_urdu_hint')}</p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='description'
                render={({ field }) => (
                  <FormItem className='gap-1.5'>
                    <FormLabel>{t('description')}</FormLabel>
                    <FormControl>
                      <SmartInput
                        placeholder={t('description')}
                        autoComplete='off'
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
                name='categories'
                render={({ field }) => (
                  <FormItem className='gap-1.5'>
                    <FormLabel>{t('categories')}</FormLabel>
                    <FormControl>
                      <div className='space-y-2'>
                        {/* Category Selection Dropdown */}
                        <Popover
                          open={categoriesOpen}
                          onOpenChange={(open) => {
                            setCategoriesOpen(open)
                            if (!open) setCategorySearchQuery('')
                          }}
                        >
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
                                        {category.image?.url ? (
                                          <img 
                                            src={category.image.url} 
                                            alt={category.name}
                                            className="w-3 h-3 rounded-full object-cover"
                                          />
                                        ) : (
                                          <div className="w-3 h-3 rounded-full bg-gray-400 flex items-center justify-center flex-shrink-0">
                                            <span className="text-[10px] font-medium text-white">
                                              {category.name?.charAt(0).toUpperCase() || 'C'}
                                            </span>
                                          </div>
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
                              <div className="relative">
                                <CommandInput
                                  placeholder={t('search_categories')}
                                  value={categorySearchQuery}
                                  onValueChange={setCategorySearchQuery}
                                />
                                <div className="absolute right-2 top-1/2 transform -translate-y-1/2 z-10">
                                  <VoiceInputButton 
                                    onTranscript={(text) => {
                                      // Since CommandInput doesn't expose direct access to its input value,
                                      // we can simulate typing by dispatching input events
                                      const input = document.querySelector('[cmdk-input]') as HTMLInputElement;
                                      if (input) {
                                        input.value = text;
                                        input.dispatchEvent(new Event('input', { bubbles: true }));
                                      }
                                    }}
                                    size="sm"
                                  />
                                </div>
                              </div>
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
                                          {category.image?.url ? (
                                            <img 
                                              src={category.image.url} 
                                              alt={category.name}
                                              className="w-6 h-6 rounded-full object-cover"
                                            />
                                          ) : (
                                            <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                                              <span className="text-sm font-medium text-muted-foreground">
                                                {category.name?.charAt(0).toUpperCase() || 'C'}
                                              </span>
                                            </div>
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
                                    className="cursor-pointer text-primary data-[disabled=true]:opacity-100"
                                  >
                                    <Plus className="mr-2 h-4 w-4" />
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
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='brandId'
                render={({ field }) => (
                  <FormItem className='gap-1.5'>
                    <FormLabel>Brand</FormLabel>
                    <FormControl>
                      <BrandSelector value={field.value} onChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              </EntityFormSection>

              <EntityFormSection title='Pricing & inventory' description='Purchase price, sale price, and stock on hand.'>
              {hasVariantsWatch ? (
                <p className='rounded-lg border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground'>
                  Cost, sale price, and stock are set per variant below — these fields are
                  hidden and unused while this product has variants.
                </p>
              ) : (
              <div className='grid gap-4 sm:grid-cols-2'>
                <FormField
                  control={form.control}
                  name='price'
                  render={({ field }) => (
                    <FormItem className='gap-1.5'>
                      <FormLabel>{t('price')} *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t('price')}
                          type='number'
                          {...field}
                          onChange={(e) => {
                            setNumericValue('price', e.target.value)
                            // field.onChange(e)
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='cost'
                  render={({ field }) => (
                    <FormItem className='gap-1.5'>
                      <FormLabel>{t('cost')} *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t('cost')}
                          type='number'
                          {...field}
                          onChange={(e) => {
                            setNumericValue('cost', e.target.value)
                            // field.onChange(e)
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              )}
              <div className='grid gap-4 sm:grid-cols-2'>
                {!hasVariantsWatch && (
                <FormField
                  control={form.control}
                  name='stockQuantity'
                  render={({ field }) => (
                    <FormItem className='gap-1.5'>
                      <FormLabel>{t('stock_quantity')} *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t('stock_quantity')}
                          type='number'
                          {...field}
                          onChange={(e) => {
                            setNumericValue('stockQuantity', e.target.value)
                            // field.onChange(e)
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                )}
                <FormField
                  control={form.control}
                  name='unit'
                  render={({ field }) => (
                    <FormItem className='gap-1.5'>
                      <FormLabel>{t('unit')}</FormLabel>
                      <FormControl>
                        <Popover open={unitsOpen} onOpenChange={setUnitsOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={unitsOpen}
                              className="w-full justify-between"
                            >
                              <div className="flex items-center gap-2">
                                <Search className="w-4 h-4" />
                                <span>
                                  {field.value
                                    ? getAllUnits().find((unit) => unit.value === field.value)?.label
                                    : t('select_unit')}
                                </span>
                              </div>
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[300px] p-0" align={isRTL ? "end" : "start"}>
                            <Command>
                              <CommandInput placeholder={t('Search Units') || 'Search units...'} />
                              <CommandEmpty>{t('no_units_found') || 'No unit found.'}</CommandEmpty>
                              <CommandList>
                                <CommandGroup>
                                  {getAllUnits().map((unit) => {
                                    const isSelected = field.value === unit.value
                                    return (
                                      <CommandItem
                                        key={unit.value}
                                        onSelect={() => {
                                          field.onChange(unit.value)
                                          setUnitsOpen(false)
                                        }}
                                        className="flex items-center justify-between cursor-pointer"
                                      >
                                        <span>{unit.label}</span>
                                        {isSelected && (
                                          <Check className="w-4 h-4 text-black" />
                                        )}
                                      </CommandItem>
                                    )
                                  })}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              {/* Opening-batch identity inputs only matter the first time tracking turns
                  on for a product that already has stock (no default variant/batches
                  exist yet) — each shown right under its own checkbox, one per line.
                  Once a default variant exists, ProductDefaultVariantBatchPanel below
                  takes over for receiving further batches. */}
              {!hasVariantsWatch && (
                <div className='grid gap-2'>
                  <FormField
                    control={form.control}
                    name='trackBatch'
                    render={({ field }) => (
                      <FormItem className='gap-1.5'>
                        <FormControl>
                          <div className='flex items-center gap-2'>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={(checked) => {
                                field.onChange(checked)
                                if (checked && !form.getValues('batchNumber')) {
                                  form.setValue('batchNumber', generateBatchNumber())
                                }
                              }}
                            />
                            <span className='text-sm text-muted-foreground'>
                              Track batch numbers for this product
                            </span>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {trackBatchWatch && stockQuantityWatch > 0 && !freshProduct?.defaultVariantId && (
                    <FormField
                      control={form.control}
                      name='batchNumber'
                      render={({ field }) => (
                        <FormItem className='gap-1.5'>
                          <FormLabel>Batch number</FormLabel>
                          <FormControl>
                            <Input placeholder='Batch number' {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  <FormField
                    control={form.control}
                    name='trackExpiry'
                    render={({ field }) => (
                      <FormItem className='gap-1.5'>
                        <FormControl>
                          <div className='flex items-center gap-2'>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                            <span className='text-sm text-muted-foreground'>
                              Track expiry dates for this product
                            </span>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {trackExpiryWatch && stockQuantityWatch > 0 && !freshProduct?.defaultVariantId && (
                    <FormField
                      control={form.control}
                      name='expiryDate'
                      render={({ field }) => (
                        <FormItem className='gap-1.5'>
                          <FormLabel>Expiry date</FormLabel>
                          <FormControl>
                            <Input type='date' {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              )}
              {isEdit && editingProductId && (form.watch('trackBatch') || form.watch('trackExpiry')) && (
                <ProductDefaultVariantBatchPanel productId={editingProductId} productName={form.watch('name')} />
              )}
              {showConversionRules && (
                <FormField
                  control={form.control}
                  name='unitConversions'
                  render={({ field }) => {
                    const conversionRows = field.value || []
                    const baseUnit = form.watch('unit') || DEFAULT_UNIT

                    const updateRule = (index: number, patch: Record<string, unknown>) => {
                      const nextRules = [...conversionRows]
                      nextRules[index] = { ...nextRules[index], ...patch }
                      field.onChange(nextRules)
                    }

                    return (
                      <FormItem className='gap-1.5'>
                        <FormLabel>Conversion Rules</FormLabel>
                        <FormControl>
                          <div className='space-y-3'>
                            <div className='rounded-md border p-3 bg-muted/20 text-sm text-muted-foreground'>
                              Stock is stored in <span className='font-medium text-foreground'>{getAllUnits().find((unit) => unit.value === baseUnit)?.label || baseUnit}</span>. Add rules like bag to pcs = 50.
                            </div>

                            {conversionRows.map((rule, index) => (
                              <div key={`${rule.fromUnit || 'rule'}-${index}`} className='grid grid-cols-12 gap-2 rounded-md border p-3'>
                                <div className='col-span-4'>
                                  <Label className='text-xs mb-1 block'>Purchase/Sale Unit</Label>
                                  <Select
                                    value={rule.fromUnit || ''}
                                    onValueChange={(value) => updateRule(index, { fromUnit: value, toUnit: baseUnit, isActive: true })}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder='Select unit' />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {getAllUnits().map((unit) => (
                                        <SelectItem key={unit.value} value={unit.value}>{unit.label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className='col-span-3'>
                                  <Label className='text-xs mb-1 block'>Stock Unit</Label>
                                  <Input value={getAllUnits().find((unit) => unit.value === baseUnit)?.label || baseUnit} disabled />
                                </div>
                                <div className='col-span-3'>
                                  <Label className='text-xs mb-1 block'>Factor</Label>
                                  <Input
                                    type='number'
                                    min='0.000001'
                                    step='0.000001'
                                    value={rule.factor ?? ''}
                                    onChange={(e) => updateRule(index, { factor: Number(e.target.value || 0), toUnit: baseUnit, isActive: true })}
                                    placeholder='e.g. 50'
                                  />
                                </div>
                                <div className='col-span-2 flex items-end justify-end'>
                                  <Button
                                    type='button'
                                    variant='ghost'
                                    size='sm'
                                    onClick={() => field.onChange(conversionRows.filter((_, rowIndex) => rowIndex !== index))}
                                  >
                                    <X className='h-4 w-4' />
                                  </Button>
                                </div>
                              </div>
                            ))}

                            <Button
                              type='button'
                              variant='outline'
                              size='sm'
                              onClick={() => field.onChange([
                                ...conversionRows,
                                { fromUnit: '', toUnit: baseUnit, factor: 1, businessTypes: ['wholesale_retail'], isActive: true },
                              ])}
                            >
                              <Plus className='mr-2 h-4 w-4' />
                              Add Conversion Rule
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )
                  }}
                />
              )}
              </EntityFormSection>

              <EntityFormSection title='SKU, barcode & scanning'>
              <FormField
                control={form.control}
                name='sku'
                render={({ field }) => (
                  <FormItem className='gap-1.5'>
                    <FormLabel>SKU</FormLabel>
                    <FormControl>
                      <div className='flex gap-2'>
                        <Input placeholder='Auto-generated SKU' showVoiceInput={false} {...field} value={field.value ?? ''} />
                        <Button type='button' variant='outline' size='sm' onClick={generateSku}>
                          Generate
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='barcode'
                render={({ field }) => (
                  <FormItem className='gap-1.5'>
                    <FormLabel>{t('barcode')}</FormLabel>
                    <FormControl>
                      <div className='space-y-2'>
                        <div className="flex gap-2">
                          <InlineBarcodeInput
                            onBarcodeEntered={(barcode) => {
                              field.onChange(barcode)
                            }}
                            placeholder={t('enter_or_scan_barcode')}
                            value={field.value}
                            onChange={field.onChange}
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={generateBarcode}
                            className="whitespace-nowrap"
                          >
                            {t('generate')}
                          </Button>
                        </div>
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
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='trackImei'
                render={({ field }) => (
                  <FormItem className='gap-1.5'>
                    <FormLabel>Track IMEI</FormLabel>
                    <FormControl>
                      <div className='flex items-center gap-2'>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                        <span className='text-sm text-muted-foreground'>
                          Track an IMEI/serial number for each unit of this product (mobile phones)
                        </span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {form.watch('trackImei') && (
                <FormField
                  control={form.control}
                  name='warrantyMonths'
                  render={({ field }) => (
                    <FormItem className='gap-1.5'>
                      <FormLabel>Warranty (months)</FormLabel>
                      <FormControl>
                        <Input
                          type='number'
                          min={0}
                          step={1}
                          showVoiceInput={false}
                          placeholder='e.g. 12'
                          value={field.value ?? 0}
                          onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                        />
                      </FormControl>
                      <p className='text-xs text-muted-foreground'>
                        Applied automatically to every IMEI sold for this product. Set 0 for no warranty.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {form.watch('trackImei') && (form.watch('stockQuantity') > 0 || isEdit) && (
                <FormField
                  control={form.control}
                  name='imeis'
                  render={({ field }) => {
                    const imeis = field.value || []
                    const stockQuantity = form.watch('stockQuantity')
                    const addImei = () => {
                      const cleaned = imeiDraft.trim()
                      if (!cleaned || imeis.includes(cleaned)) return
                      field.onChange([...imeis, cleaned])
                      setImeiDraft('')
                    }
                    return (
                      <FormItem className='gap-1.5'>
                        <FormLabel>IMEI Numbers</FormLabel>
                        <FormControl>
                          <div className='space-y-2'>
                            <span className='text-xs font-medium text-amber-700'>
                              {isEdit
                                ? `${imeis.length} entered`
                                : `${imeis.length}/${stockQuantity} entered`}
                            </span>
                            <div className='flex items-center gap-2'>
                              <Input
                                placeholder='Scan or type IMEI, press Enter'
                                value={imeiDraft}
                                showVoiceInput={false}
                                onChange={(e) => setImeiDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ',') {
                                    e.preventDefault()
                                    addImei()
                                  }
                                }}
                              />
                              <Button type='button' size='sm' variant='outline' onClick={addImei}>
                                <Plus className='h-3.5 w-3.5' />
                              </Button>
                            </div>
                            {imeis.length > 0 && (
                              <div className='flex flex-wrap gap-1.5'>
                                {imeis.map((num: string) => (
                                  <Badge key={num} variant='secondary' className='gap-1 pr-1'>
                                    {num}
                                    <button
                                      type='button'
                                      onClick={() => field.onChange(imeis.filter((n: string) => n !== num))}
                                      className='ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5'
                                    >
                                      <X className='h-3 w-3' />
                                    </button>
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )
                  }}
                />
              )}
              </EntityFormSection>

              <EntityFormSection title={t('product_photo_section_title')}>
              <FormField
                control={form.control}
                name='image'
                render={({ field }) => (
                  <FormItem className='space-y-0'>
                    <FormControl>
                      <ImageUpload
                        key={`product-image-${imageKey}`}
                        onImageUpload={(imageData) => {
                          setImageRemoved(false)
                          field.onChange(imageData)
                          setImageKey((k) => k + 1)
                        }}
                        onImageRemove={() => {
                          setImageRemoved(true)
                          field.onChange(undefined)
                          form.setValue('image', undefined, { shouldValidate: true, shouldDirty: true })
                          form.resetField('image', { defaultValue: undefined })
                          form.trigger('image')
                          setImageKey((prev) => prev + 1)
                        }}
                        currentImageUrl={imageRemoved ? undefined : field.value?.url}
                        className='w-full'
                        layout='comfortable'
                        autoSearchFromText={nameWatch}
                        getSearchQuery={() => String(form.getValues('name') ?? '').trim()}
                        searchContext='product'
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              </EntityFormSection>

              <EntityFormSection
                title='Variants'
                description='Sell this product in multiple options (e.g. size, color, pack size) instead of a single price and stock count.'
                className='col-span-full'
              >
                <FormField
                  control={form.control}
                  name='hasVariants'
                  render={({ field }) => (
                    <FormItem className='flex flex-row items-center justify-between gap-4 rounded-lg border border-border/60 p-3'>
                      <div className='space-y-0.5'>
                        <FormLabel>This product has variants</FormLabel>
                        <p className='text-xs text-muted-foreground'>
                          The price, cost, and stock quantity above stay as-is and are only
                          used as a fallback — each variant gets its own price, cost, and stock.
                        </p>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                {form.watch('hasVariants') && (
                  <>
                    {isEdit && editingProductId && (
                      <VariantInventoryTable productId={editingProductId} />
                    )}
                    <ProductVariantsSection
                      draftVariants={draftVariants}
                      onDraftVariantsChange={setDraftVariants}
                      productName={nameWatch}
                    />
                  </>
                )}
              </EntityFormSection>

            </form>
          </Form>
        </div>
        <DialogFooter className='shrink-0 border-t border-border/60 bg-background/95 px-6 py-4'>
          <Button type='submit' form='user-form'>
            {t('save_changes')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
