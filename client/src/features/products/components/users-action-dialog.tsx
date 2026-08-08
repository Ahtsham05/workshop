'use client'

import { useState, useEffect, useRef } from 'react'
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
import { fetchAllSubCategories, createSubCategory } from '@/stores/subCategory.slice'
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
import { isWholesaleRetailBusiness, isMobileShopBusiness } from '@/lib/business-types'
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
import { handleFormEnterKeyDown } from '@/lib/form-enter-navigation'

const formSchema = z.object({
  name: z.string().min(1, { message: 'Name is required.' }),
  nameUrdu: z.string().optional(),
  description: z.string(),
  sku: z.string().optional(),
  brandId: z.string().optional(),
  barcode: z.string().optional(),
  hasVariants: z.boolean().optional(),
  trackImei: z.boolean().optional(),
  trackSerial: z.boolean().optional(),
  trackBatch: z.boolean().optional(),
  trackExpiry: z.boolean().optional(),
  // Opening-batch identity, only used the first time trackBatch/trackExpiry is turned
  // on for a product that already has stock — see syncDefaultVariantTracking.
  batchNumber: z.string().optional(),
  expiryDate: z.string().optional(),
  warrantyMonths: z.number().min(0).optional(),
  // Plain string for a single-IMEI unit, or { imei, imei2 } for a dual-SIM phone.
  imeis: z.array(z.union([z.string(), z.object({ imei: z.string(), imei2: z.string().optional() })])).optional(),
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
  subCategories: z.array(z.object({
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
  if (data.trackImei && data.trackSerial) {
    ctx.addIssue({ code: 'custom', path: ['trackSerial'], message: 'A product tracks either IMEI or Serial Number, not both.' })
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
  const [subCategoriesOpen, setSubCategoriesOpen] = useState(false)
  const [subCategorySearchQuery, setSubCategorySearchQuery] = useState('')
  const [isCreatingSubCategory, setIsCreatingSubCategory] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [draftVariants, setDraftVariants] = useState<VariantDraftRow[]>([])
  const [unitsOpen, setUnitsOpen] = useState(false)
  const [imeiDraft, setImeiDraft] = useState('')
  const [imei2Draft, setImei2Draft] = useState('')
  const imei1InputRef = useRef<HTMLInputElement>(null)
  const imei2InputRef = useRef<HTMLInputElement>(null)
  
  const dispatch = useDispatch<AppDispatch>()
  const [createProductVariant] = useCreateProductVariantMutation()
  const { categories } = useSelector((state: RootState) => state.category)
  const { subCategories } = useSelector((state: RootState) => state.subCategory)
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: orgData } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })
  const showConversionRules = isWholesaleRetailBusiness(orgData?.businessType || user?.businessType)
  // IMEI tracking only makes sense for mobile phones — restrict it to mobile shop orgs.
  // Serial number tracking (TVs, laptops, appliances) applies to every business type.
  const isMobileShop = isMobileShopBusiness(orgData?.businessType || user?.businessType)
  
  // Refetch categories when dialog opens (in case new ones were added)
  useEffect(() => {
    if (open) {
      dispatch(fetchCategories({ page: 1, limit: 100 }))
      dispatch(fetchAllSubCategories({}))
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
        trackSerial: currentRow?.trackSerial || false,
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
        subCategories: currentRow?.subCategories || [],
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
        trackSerial: false,
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
        subCategories: [],
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
        trackSerial: currentRow.trackSerial || false,
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
        subCategories: currentRow.subCategories || [],
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
        trackSerial: false,
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
        subCategories: [],
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
    form.setValue('imeis', openingStockImeis.map((d) => (d.imei2 ? { imei: d.imei, imei2: d.imei2 } : d.imei)))
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


  const onSubmit = async (values: productForm) => {
    if (!isEdit && (values.trackImei || values.trackSerial)) {
      const label = values.trackSerial ? 'serial' : 'IMEI'
      const imeiCount = (values.imeis || []).length
      if (imeiCount !== values.stockQuantity) {
        toast.error(`Enter ${values.stockQuantity} ${label} number(s) — ${imeiCount} entered`)
        return
      }
    }
    setIsSubmitting(true)
    try {
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
        const created = await dispatch(addProduct(values)).unwrap()
        toast.success(t('product_created_successfully'))
        if (values.hasVariants && draftVariants.length > 0) {
          await createPendingVariants(created?.id || created?._id)
        }
        setFetch?.((prev: any) => !prev)
        dispatch(imeiApi.util.invalidateTags(['Imei']))
        onCreated?.(created)
      }
      form.reset()
      onOpenChange(false)
    } catch {
      return
    } finally {
      setIsSubmitting(false)
    }
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

  // Sub-categories only make sense in the context of a category, so the picker is scoped
  // to whichever categories are already selected on this product.
  const categoriesWatch = form.watch('categories')
  const selectedCategoryIds = (categoriesWatch || []).map((c) => c._id)
  const availableSubCategories = subCategories.filter((sc) => {
    const parentId = typeof sc.category === 'object' ? sc.category?.id : sc.category
    return parentId && selectedCategoryIds.includes(parentId)
  })

  // If a category is removed, drop any of its sub-categories that were already selected
  // on this product so the two fields never disagree.
  useEffect(() => {
    const current = form.getValues('subCategories') || []
    if (current.length === 0) return
    const validIds = new Set(availableSubCategories.map((sc) => sc.id))
    const pruned = current.filter((sc) => validIds.has(sc._id))
    if (pruned.length !== current.length) {
      form.setValue('subCategories', pruned)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategoryIds.join(',')])

  // Create a new sub-category inline, attached to the first selected category — mirrors
  // handleCreateCategory above.
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
      toast.success(t('subcategory_created_successfully') || `Sub-category "${name}" created`)
      const currentSubCategories = form.getValues('subCategories') || []
      form.setValue('subCategories', [
        ...currentSubCategories,
        { _id: created.id, name: created.name, image: created.image },
      ])
      setSubCategorySearchQuery('')
      setSubCategoriesOpen(false)
    } catch {
      toast.error(`Failed to create sub-category "${name}"`)
    } finally {
      setIsCreatingSubCategory(false)
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
            <form id='user-form' onSubmit={form.handleSubmit(onSubmit, onInvalid)} onKeyDown={handleFormEnterKeyDown} className='grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4'>
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
                name='subCategories'
                render={({ field }) => (
                  <FormItem className='gap-1.5'>
                    <FormLabel>{t('subcategories')}</FormLabel>
                    <FormControl>
                      <div className='space-y-2'>
                        <Popover
                          open={subCategoriesOpen}
                          onOpenChange={(open) => {
                            if (open && selectedCategoryIds.length === 0) return
                            setSubCategoriesOpen(open)
                            if (!open) setSubCategorySearchQuery('')
                          }}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              type='button'
                              variant='outline'
                              role='combobox'
                              aria-expanded={subCategoriesOpen}
                              disabled={selectedCategoryIds.length === 0}
                              className='w-full justify-between min-h-[2.5rem] h-auto py-0'
                            >
                              <div className='flex items-center gap-2 flex-1'>
                                <Search className='w-4 h-4 flex-shrink-0' />
                                {field.value && field.value.length > 0 ? (
                                  <div className='flex flex-wrap items-center gap-1 flex-1'>
                                    {field.value.map((subCategory) => (
                                      <Badge key={subCategory._id} variant='secondary' className='flex items-center gap-1'>
                                        {subCategory.image?.url ? (
                                          <img
                                            src={subCategory.image.url}
                                            alt={subCategory.name}
                                            className='w-3 h-3 rounded-full object-cover'
                                          />
                                        ) : (
                                          <div className='w-3 h-3 rounded-full bg-gray-400 flex items-center justify-center flex-shrink-0'>
                                            <span className='text-[10px] font-medium text-white'>
                                              {subCategory.name?.charAt(0).toUpperCase() || 'S'}
                                            </span>
                                          </div>
                                        )}
                                        <span className='text-xs'>{subCategory.name}</span>
                                        <button
                                          type='button'
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            const next = field.value?.filter((sc) => sc._id !== subCategory._id) || []
                                            field.onChange(next)
                                          }}
                                          className='ml-1 hover:bg-gray-200 rounded-full p-0.5'
                                        >
                                          <X className='w-2 h-2' />
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
                                    const isSelected = field.value?.some((sc) => sc._id === subCategory.id) || false
                                    return (
                                      <CommandItem
                                        key={subCategory.id}
                                        onSelect={() => {
                                          const current = field.value || []
                                          if (isSelected) {
                                            field.onChange(current.filter((sc) => sc._id !== subCategory.id))
                                          } else {
                                            field.onChange([
                                              ...current,
                                              { _id: subCategory.id, name: subCategory.name, image: subCategory.image },
                                            ])
                                          }
                                        }}
                                        className='flex items-center gap-2 cursor-pointer'
                                      >
                                        <div className='flex items-center gap-2 flex-1'>
                                          {subCategory.image?.url ? (
                                            <img
                                              src={subCategory.image.url}
                                              alt={subCategory.name}
                                              className='w-6 h-6 rounded-full object-cover'
                                            />
                                          ) : (
                                            <div className='w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0'>
                                              <span className='text-sm font-medium text-muted-foreground'>
                                                {subCategory.name?.charAt(0).toUpperCase() || 'S'}
                                              </span>
                                            </div>
                                          )}
                                          <span>{subCategory.name}</span>
                                        </div>
                                        {isSelected && (
                                          <div className='w-4 h-4 rounded-sm flex items-center justify-center'>
                                            <Check className='w-3 h-3 text-black' />
                                          </div>
                                        )}
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
                                    <Plus className='mr-2 h-4 w-4' />
                                    {!subCategorySearchQuery.trim()
                                      ? t('type_a_name_to_create_subcategory')
                                      : availableSubCategories.some((sc) => sc.name.toLowerCase() === subCategorySearchQuery.trim().toLowerCase())
                                        ? `"${subCategorySearchQuery.trim()}" already exists — select it above`
                                        : t('create_subcategory_under', {
                                            name: subCategorySearchQuery.trim(),
                                            category: categories.find((c) => c.id === selectedCategoryIds[0])?.name || '',
                                          })}
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
              <div className='grid gap-2'>
                {isMobileShop && (
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
                              onCheckedChange={(checked) => {
                                field.onChange(checked)
                                if (checked) form.setValue('trackSerial', false)
                              }}
                            />
                            <span className='text-sm text-muted-foreground'>
                              Track an IMEI number for each unit of this product (mobile phones)
                            </span>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <FormField
                  control={form.control}
                  name='trackSerial'
                  render={({ field }) => (
                    <FormItem className='gap-1.5'>
                      <FormLabel>Track Serial Number</FormLabel>
                      <FormControl>
                        <div className='flex items-center gap-2'>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={(checked) => {
                              field.onChange(checked)
                              if (checked) form.setValue('trackImei', false)
                            }}
                          />
                          <span className='text-sm text-muted-foreground'>
                            Track a serial number for each unit of this product (TVs, laptops, appliances, etc.)
                          </span>
                        </div>
                      </FormControl>
                      {isMobileShop && (
                        <p className='text-xs text-muted-foreground'>
                          A product tracks one or the other, never both — pick IMEI for phones, Serial Number for everything else that's individually serialized.
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              {(form.watch('trackImei') || form.watch('trackSerial')) && (
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
                        Applied automatically to every unit sold for this product. Set 0 for no warranty.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {(form.watch('trackImei') || form.watch('trackSerial')) && (form.watch('stockQuantity') > 0 || isEdit) && (
                <FormField
                  control={form.control}
                  name='imeis'
                  render={({ field }) => {
                    const imeis: (string | { imei: string; imei2?: string })[] = field.value || []
                    const stockQuantity = form.watch('stockQuantity')
                    const isSerial = form.watch('trackSerial')
                    const label = isSerial ? 'serial number' : 'IMEI'
                    const entryImei = (e: string | { imei: string; imei2?: string }) => (typeof e === 'string' ? e : e.imei)
                    const entryImei2 = (e: string | { imei: string; imei2?: string }) => (typeof e === 'string' ? undefined : e.imei2)
                    // Real IMEIs are always 15 digits — serial numbers vary (letters, dashes,
                    // etc.) and are left free-form. Sanitizing on change (not just capping
                    // maxLength) also strips pasted spaces/dashes from a scanner's raw output.
                    const sanitizeImei = (raw: string) => (isSerial ? raw : raw.replace(/\D/g, '').slice(0, 15))
                    const addImei = () => {
                      const cleaned = imeiDraft.trim()
                      const cleaned2 = imei2Draft.trim()
                      if (!cleaned) return
                      if (cleaned2 && cleaned2 === cleaned) {
                        toast.error(`IMEI and IMEI 2 cannot be the same number`)
                        return
                      }
                      // Check both slots of every existing entry, not just its primary
                      // number — otherwise "112 / 12" already entered lets a second phone
                      // reuse "12" as its own primary IMEI undetected (they'd then be
                      // treated as the same dual-SIM unit everywhere).
                      const usedNumbers = new Set(imeis.flatMap((e) => [entryImei(e), entryImei2(e)].filter(Boolean)))
                      if (usedNumbers.has(cleaned) || (cleaned2 && usedNumbers.has(cleaned2))) {
                        toast.error(`This ${label} is already entered for another phone`)
                        return
                      }
                      field.onChange([...imeis, cleaned2 ? { imei: cleaned, imei2: cleaned2 } : cleaned])
                      setImeiDraft('')
                      setImei2Draft('')
                      imei1InputRef.current?.focus()
                    }
                    const imei1Field = (
                      <Input
                        ref={imei1InputRef}
                        placeholder={isSerial ? `Scan or type ${label}` : 'Scan or type IMEI'}
                        value={imeiDraft}
                        showVoiceInput={false}
                        inputMode={isSerial ? undefined : 'numeric'}
                        onChange={(e) => setImeiDraft(sanitizeImei(e.target.value))}
                        onKeyDown={(e) => {
                          if (e.key === ',') {
                            e.preventDefault()
                            addImei()
                          } else if (e.key === 'Enter') {
                            e.preventDefault()
                            // A serial-tracked product has no second field to hop to — Enter
                            // commits right away. For IMEI, Enter first moves to IMEI 2 (in
                            // case this is a dual-SIM unit); a second Enter there commits.
                            if (isSerial) addImei()
                            else if (imeiDraft.trim()) imei2InputRef.current?.focus()
                          }
                        }}
                      />
                    )
                    return (
                      <FormItem className='gap-1.5'>
                        <FormLabel>{isSerial ? 'Serial Numbers' : 'IMEI Numbers'}</FormLabel>
                        <FormControl>
                          <div className='space-y-2'>
                            <span className='text-xs font-medium text-amber-700'>
                              {isEdit
                                ? `${imeis.length} entered`
                                : `${imeis.length}/${stockQuantity} entered`}
                            </span>
                            {isSerial ? (
                              <div className='flex items-center gap-2'>
                                {imei1Field}
                                <Button type='button' size='sm' variant='outline' className='shrink-0' onClick={addImei}>
                                  <Plus className='h-3.5 w-3.5' />
                                </Button>
                              </div>
                            ) : (
                              <div className='space-y-1.5'>
                                <div className='space-y-1'>
                                  {imei1Field}
                                  {imeiDraft.length > 0 && (
                                    <p className='text-[11px] text-muted-foreground'>{imeiDraft.length}/15 digits</p>
                                  )}
                                </div>
                                <div className='flex items-center gap-2'>
                                  <Input
                                    ref={imei2InputRef}
                                    placeholder='IMEI 2 (optional)'
                                    value={imei2Draft}
                                    showVoiceInput={false}
                                    inputMode='numeric'
                                    className='flex-1 min-w-0'
                                    onChange={(e) => setImei2Draft(sanitizeImei(e.target.value))}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ',') {
                                        e.preventDefault()
                                        addImei()
                                      } else if (e.key === 'Backspace' && !imei2Draft) {
                                        // Empty + Backspace hops back to fix IMEI 1 instead of doing nothing.
                                        imei1InputRef.current?.focus()
                                      }
                                    }}
                                  />
                                  <Button type='button' size='sm' variant='outline' className='shrink-0' onClick={addImei}>
                                    <Plus className='h-3.5 w-3.5' />
                                  </Button>
                                </div>
                              </div>
                            )}
                            {imeis.length > 0 && (
                              <div className='flex flex-wrap gap-1.5'>
                                {imeis.map((entry, idx) => {
                                  const num = entryImei(entry)
                                  const num2 = entryImei2(entry)
                                  return (
                                    <Badge key={`${num}-${idx}`} variant='secondary' className='gap-1 pr-1'>
                                      {num2 ? `${num} · ${num2}` : num}
                                      <button
                                        type='button'
                                        onClick={() => field.onChange(imeis.filter((e) => entryImei(e) !== num))}
                                        className='ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5'
                                      >
                                        <X className='h-3 w-3' />
                                      </button>
                                    </Badge>
                                  )
                                })}
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
          <Button type='submit' form='user-form' disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : t('save_changes')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
