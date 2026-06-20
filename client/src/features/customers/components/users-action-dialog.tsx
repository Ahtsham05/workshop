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
import SmartInput from '@/components/smart-input.tsx'
import ImageUpload from '@/components/image-upload'
import { useAutoUrduNameFromEnglish } from '@/hooks/use-auto-urdu-name-from-english'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { addCustomer, updateCustomer } from '@/stores/customer.slice'
import toast from 'react-hot-toast'
import { useLanguage } from '@/context/language-context'
import { useEffect } from 'react'
import { EntityFormSection } from '@/components/entity-form-section'

const imageRefSchema = z
  .object({
    url: z.string(),
    publicId: z.string(),
  })
  .optional()

const formSchema = z.object({
  name: z.string().min(1, { message: 'Name is required.' }),
  nameUrdu: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  address: z.string().optional(),
  balance: z.coerce.number().optional(),
  picture: imageRefSchema,
  idCardFront: imageRefSchema,
  idCardBack: imageRefSchema,
})

type customerForm = z.infer<typeof formSchema>

interface Props {
  currentRow?: any
  open: boolean
  onOpenChange: (open: boolean) => void
  setFetch?: any
  onCreated?: (entity: any) => void
  defaultName?: string
}

export function CustomersActionDialog({ currentRow, open, onOpenChange, setFetch, onCreated, defaultName }: Props) {
  const isEdit = !!currentRow
  const { t, isRTL } = useLanguage()
  const form = useForm<customerForm>({
    resolver: zodResolver(formSchema),
    defaultValues: isEdit
      ? {
          ...currentRow,
        }
      : {
          name: '',
          nameUrdu: '',
          email: 'customer@gmail.com',
          phone: '03',
          whatsapp: '03',
          address: 'address',
          balance: 0,
          picture: undefined,
          idCardFront: undefined,
          idCardBack: undefined,
        },
  })

  const customerSessionKey = open ? (currentRow?.id ?? 'new') : null
  useAutoUrduNameFromEnglish(form, 'name', 'nameUrdu', customerSessionKey)

  useEffect(() => {
    if (!open || isEdit || !defaultName?.trim()) return
    form.setValue('name', defaultName.trim())
  }, [open, isEdit, defaultName, form])

  const dispatch = useDispatch<AppDispatch>()

  // Auto-copy phone to WhatsApp field
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === 'phone' && value.phone) {
        form.setValue('whatsapp', value.phone)
      }
    })
    return () => subscription.unsubscribe()
  }, [form])

  const onSubmit = async (values: customerForm) => {
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
      const updated = await dispatch(updateCustomer({ ...payload, _id: currentRow?.id })).unwrap()
      toast.success(
        updated?.offlinePending
          ? 'Customer updated offline — will sync when you are back online'
          : t('customer_updated_success'),
      )
      setFetch?.((prev: any) => !prev)
    } else {
      try {
        const created = await dispatch(addCustomer(payload)).unwrap()
        toast.success(
          created?.offlinePending
            ? 'Customer saved offline — will sync when you are back online'
            : t('customer_created_success'),
        )
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
            {isEdit ? t('edit_customer') : t('add_customer')}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? t('update_customer') : t('create_customer')} {t('click_save')}
          </DialogDescription>
        </DialogHeader>
        <div className='min-h-0 flex-1 overflow-y-auto px-6 py-4'>
          <Form {...form}>
            <form
              id='customer-form'
              onSubmit={form.handleSubmit(onSubmit)}
              className='space-y-6'
            >
              <EntityFormSection
                title={isEdit ? t('customer_dialog_section_primary_edit') : t('customer_dialog_section_primary_new')}
                description={t('customer_dialog_section_primary_desc')}
              >
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem className='grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1'>
                    <FormLabel className='col-span-2 md:text-right'>
                      {t('customer_name')}
                    </FormLabel>
                    <FormControl>
                      <SmartInput
                        placeholder={t('customer_name')}
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
                    <FormLabel className={`col-span-2 pt-2 ${isRTL ? 'text-right' : 'md:text-right'}`}>{t('name_in_urdu')}</FormLabel>
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
                        placeholder={t('email')}
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
                        fieldType='phone'
                        placeholder={t('phone')}
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
                        fieldType='phone'
                        placeholder={t('whatsapp')}
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
                        placeholder={t('address')}
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
                title={t('customer_dialog_section_photos_title')}
                description={t('customer_dialog_section_photos_desc')}
              >
                <FormItem className='grid grid-cols-6 items-start gap-x-4 gap-y-1 space-y-0'>
                  <FormLabel className={`col-span-2 pt-2 ${isRTL ? 'text-right' : 'md:text-right'}`}>{t('profile_picture')}</FormLabel>
                  <div className='col-span-4'>
                    <ImageUpload
                      uploadSlug='customers/upload-image'
                      previewAlt={t('profile_picture')}
                      currentImageUrl={form.watch('picture')?.url}
                      onImageUpload={(img) => form.setValue('picture', img)}
                      onImageRemove={() => form.setValue('picture', undefined)}
                      layout='comfortable'
                    />
                  </div>
                </FormItem>
                <FormItem className='grid grid-cols-6 items-start gap-x-4 gap-y-1 space-y-0'>
                  <FormLabel className={`col-span-2 pt-2 ${isRTL ? 'text-right' : 'md:text-right'}`}>{t('id_card_front')}</FormLabel>
                  <div className='col-span-4'>
                    <ImageUpload
                      uploadSlug='customers/upload-image'
                      previewAlt={t('id_card_front')}
                      currentImageUrl={form.watch('idCardFront')?.url}
                      onImageUpload={(img) => form.setValue('idCardFront', img)}
                      onImageRemove={() => form.setValue('idCardFront', undefined)}
                      layout='comfortable'
                    />
                  </div>
                </FormItem>
                <FormItem className='grid grid-cols-6 items-start gap-x-4 gap-y-1 space-y-0'>
                  <FormLabel className={`col-span-2 pt-2 ${isRTL ? 'text-right' : 'md:text-right'}`}>{t('id_card_back')}</FormLabel>
                  <div className='col-span-4'>
                    <ImageUpload
                      uploadSlug='customers/upload-image'
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
          <Button type='submit' form='customer-form'>
            {t('save_changes')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
