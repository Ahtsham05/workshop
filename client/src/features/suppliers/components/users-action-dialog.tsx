'use client'

import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
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
import SmartInput from '@/components/smart-input.tsx'
import ImageUpload from '@/components/image-upload'
import { useAutoUrduNameFromEnglish } from '@/hooks/use-auto-urdu-name-from-english'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { addSupplier, updateSupplier } from '@/stores/supplier.slice' // Adjusted to supplier slice
import toast from 'react-hot-toast'
import { useLanguage } from '@/context/language-context'
import { EntityFormSection } from '@/components/entity-form-section'

const imageRefSchema = z
  .object({
    url: z.string(),
    publicId: z.string(),
  })
  .optional()

// Define the form schema with translations
const getFormSchema = (t: (key: string) => string) => z.object({
  name: z.string().min(1, { 
    message: t('name_required') || 'Name is required.' 
  }),
  nameUrdu: z.string().optional(),
  email: z.string().optional(),
  phone: z.string(),
  whatsapp: z.string().optional(),
  address: z.string().optional(),
  balance: z.coerce.number().optional(),
  picture: imageRefSchema,
  idCardFront: imageRefSchema,
  idCardBack: imageRefSchema,
})

interface Props {
  currentRow?: any
  open: boolean
  onOpenChange: (open: boolean) => void
  setFetch?: any
  onCreated?: (entity: any) => void
  defaultName?: string
}

export function SuppliersActionDialog({ currentRow, open, onOpenChange, setFetch, onCreated, defaultName }: Props) {
  const { t, isRTL } = useLanguage()
  const isEdit = !!currentRow
  
  // Use the dynamic form schema with translations
  const formSchema = getFormSchema(t)
  type supplierForm = z.infer<typeof formSchema>
  
  const form = useForm<supplierForm>({
    resolver: zodResolver(formSchema),
    defaultValues: isEdit
      ? {
          ...currentRow,
        }
      : {
          name: '',
          nameUrdu: '',
          email: 'supplier@gmail.com',
          phone: '03',
          whatsapp: '03',
          address: 'address',
          balance: 0,
          picture: undefined,
          idCardFront: undefined,
          idCardBack: undefined,
        },
  })
  
  const supplierSessionKey = open ? (currentRow?.id ?? 'new') : null
  useAutoUrduNameFromEnglish(form, 'name', 'nameUrdu', supplierSessionKey)
  
  // Watch the phone field and update whatsapp field automatically
  const phoneValue = form.watch('phone')
  
  // Update whatsapp field when phone changes
  useEffect(() => {
    // Don't update if we're in edit mode and the component just mounted
    if (phoneValue && (!isEdit || phoneValue !== currentRow?.phone)) {
      form.setValue('whatsapp', phoneValue)
    }
  }, [phoneValue, form, isEdit, currentRow])

  useEffect(() => {
    if (!open || isEdit || !defaultName?.trim()) return
    form.setValue('name', defaultName.trim())
  }, [open, isEdit, defaultName, form])

  const dispatch = useDispatch<AppDispatch>()

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    const { picture, idCardFront, idCardBack, ...rest } = values
    const payload = isEdit
      ? {
          ...rest,
          picture: picture ?? null,
          idCardFront: idCardFront ?? null,
          idCardBack: idCardBack ?? null,
        }
      : {
          ...rest,
          ...(picture ? { picture } : {}),
          ...(idCardFront ? { idCardFront } : {}),
          ...(idCardBack ? { idCardBack } : {}),
        }
    if (isEdit) {
      await dispatch(updateSupplier({ ...payload, _id: currentRow?.id })).then(() => {
        toast.success(t('supplier_updated_success'))
        setFetch?.((prev: any) => !prev)
      })
    } else {
      try {
        const created = await dispatch(addSupplier(payload)).unwrap()
        toast.success(t('supplier_created_success'))
        setFetch?.((prev: any) => !prev)
        onCreated?.(created)
      } catch {
        return
      }
    }
    form.reset()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(state) => {
        form.reset()
        onOpenChange(state)
      }}
    >
      <DialogContent className='flex max-h-[90vh] w-[calc(100vw-1.25rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0'>
        <DialogHeader className='shrink-0 space-y-2 border-b border-border/60 px-6 pb-4 pt-6 text-left'>
          <DialogTitle className='text-xl'>
            {isEdit ? t('edit_supplier') : t('add_supplier')}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? t('update_supplier') : t('create_supplier')}
            {t('click_save')}
          </DialogDescription>
        </DialogHeader>
        <div className='min-h-0 flex-1 overflow-y-auto px-6 py-4'>
          <Form {...form}>
            <form
              id='supplier-form'
              onSubmit={form.handleSubmit(onSubmit)}
              className='space-y-6'
            >
              <EntityFormSection
                title={isEdit ? t('supplier_dialog_section_primary_edit') : t('supplier_dialog_section_primary_new')}
                description={t('supplier_dialog_section_primary_desc')}
              >
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem className='grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1'>
                    <FormLabel className='col-span-2 md:text-right'>
                      {t('supplier_name')}
                    </FormLabel>
                    <FormControl>
                      <SmartInput
                        placeholder={t('supplier_name')}
                        showVoiceInput={true}
                        voiceInputSize="sm"
                        autoComplete='off'
                        className='col-span-4 min-h-11 text-base'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className='col-span-4 col-start-3' />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='nameUrdu'
                render={({ field }) => (
                  <FormItem className='grid grid-cols-6 items-start space-y-0 gap-x-4 gap-y-1'>
                    <FormLabel className={`col-span-2 pt-2 ${isRTL ? 'text-right' : 'md:text-right'}`}>
                      {t('name_in_urdu')}
                    </FormLabel>
                    <div className='col-span-4 space-y-1'>
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
                    </div>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='email'
                render={({ field }) => (
                  <FormItem className='grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1'>
                    <FormLabel className='col-span-2 md:text-right'>
                      {t('email')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={`${t('supplier_name')} ${t('email')}`}
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
                name='phone'
                render={({ field }) => (
                  <FormItem className='grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1'>
                    <FormLabel className='col-span-2 md:text-right'>
                      {t('phone')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={`${t('supplier_name')} ${t('phone')}`}
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
                name='whatsapp'
                render={({ field }) => (
                  <FormItem className='grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1'>
                    <FormLabel className='col-span-2 md:text-right'>
                      {t('whatsapp')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={`${t('supplier_name')} ${t('whatsapp')}`}
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
                name='balance'
                render={({ field }) => (
                  <FormItem className='grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1'>
                    <FormLabel className='col-span-2 md:text-right'>
                      {t('balance')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        placeholder={t('balance')}
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
                name='address'
                render={({ field }) => (
                  <FormItem className='grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1'>
                    <FormLabel className='col-span-2 md:text-right'>
                      {t('address')}
                    </FormLabel>
                    <FormControl>
                      <SmartInput
                        placeholder={`${t('supplier_name')} ${t('address')}`}
                        showVoiceInput={true}
                        voiceInputSize="sm"
                        autoComplete='off'
                        className='col-span-4'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className='col-span-4 col-start-3' />
                  </FormItem>
                )}
              />
              </EntityFormSection>

              <EntityFormSection
                title={t('supplier_dialog_section_photos_title')}
                description={t('supplier_dialog_section_photos_desc')}
              >
                <FormItem className='grid grid-cols-6 items-start gap-x-4 gap-y-1 space-y-0'>
                  <FormLabel className={`col-span-2 pt-2 ${isRTL ? 'text-right' : 'md:text-right'}`}>
                    {t('profile_picture')}
                  </FormLabel>
                  <div className='col-span-4'>
                    <ImageUpload
                      uploadSlug='suppliers/upload-image'
                      previewAlt={t('profile_picture')}
                      currentImageUrl={form.watch('picture')?.url}
                      onImageUpload={(img) => form.setValue('picture', img)}
                      onImageRemove={() => form.setValue('picture', undefined)}
                      layout='comfortable'
                    />
                  </div>
                </FormItem>
                <FormItem className='grid grid-cols-6 items-start gap-x-4 gap-y-1 space-y-0'>
                  <FormLabel className={`col-span-2 pt-2 ${isRTL ? 'text-right' : 'md:text-right'}`}>
                    {t('id_card_front')}
                  </FormLabel>
                  <div className='col-span-4'>
                    <ImageUpload
                      uploadSlug='suppliers/upload-image'
                      previewAlt={t('id_card_front')}
                      currentImageUrl={form.watch('idCardFront')?.url}
                      onImageUpload={(img) => form.setValue('idCardFront', img)}
                      onImageRemove={() => form.setValue('idCardFront', undefined)}
                      layout='comfortable'
                    />
                  </div>
                </FormItem>
                <FormItem className='grid grid-cols-6 items-start gap-x-4 gap-y-1 space-y-0'>
                  <FormLabel className={`col-span-2 pt-2 ${isRTL ? 'text-right' : 'md:text-right'}`}>
                    {t('id_card_back')}
                  </FormLabel>
                  <div className='col-span-4'>
                    <ImageUpload
                      uploadSlug='suppliers/upload-image'
                      previewAlt={t('id_card_back')}
                      currentImageUrl={form.watch('idCardBack')?.url}
                      onImageUpload={(img) => form.setValue('idCardBack', img)}
                      onImageRemove={() => form.setValue('idCardBack', undefined)}
                      layout='comfortable'
                    />
                  </div>
                </FormItem>
              </EntityFormSection>
            </form>
          </Form>
        </div>
        <DialogFooter className='shrink-0 border-t border-border/60 bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80'>
          <Button type='submit' form='supplier-form'>
            {t('save_changes')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
