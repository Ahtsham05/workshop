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
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import SmartInput from '@/components/smart-input.tsx'
import ImageUpload from '@/components/image-upload'
import { useAutoUrduNameFromEnglish } from '@/hooks/use-auto-urdu-name-from-english'
import { useUrduDisplay } from '@/context/urdu-display-context'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { addCustomer, updateCustomer } from '@/stores/customer.slice'
import toast from 'react-hot-toast'
import { useLanguage } from '@/context/language-context'
import { useEffect, useState } from 'react'
import { EntityFormSection } from '@/components/entity-form-section'
import { handleFormEnterKeyDown } from '@/lib/form-enter-navigation'
import {
  User,
  UserPlus,
  IdCard,
  Phone as PhoneIcon,
  MessageCircle,
  Mail,
  Wallet,
  MapPin,
  Receipt,
} from 'lucide-react'

const imageRefSchema = z
  .object({
    url: z.string(),
    publicId: z.string(),
  })
  .optional()

const NONE = '__none__'
const customerTypeValues = ['retail', 'wholesale', 'vip', 'corporate'] as const
const paymentTermsValues = ['cash', 'due_on_receipt', 'net_15', 'net_30', 'net_60'] as const

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
  customerType: z.enum(customerTypeValues).optional().or(z.literal(NONE)),
  creditLimit: z.coerce.number().optional(),
  paymentTerms: z.enum(paymentTermsValues).optional().or(z.literal(NONE)),
  taxNumber: z.string().optional(),
  taxExempt: z.boolean().optional(),
  notes: z.string().optional(),
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
  const { showUrduInput } = useUrduDisplay()
  const form = useForm<customerForm>({
    resolver: zodResolver(formSchema),
    defaultValues: isEdit
      ? {
          ...currentRow,
          customerType: currentRow?.customerType || NONE,
          paymentTerms: currentRow?.paymentTerms || NONE,
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
          customerType: NONE,
          creditLimit: 0,
          paymentTerms: NONE,
          taxNumber: '',
          taxExempt: false,
          notes: '',
        },
  })

  const customerSessionKey = open ? (currentRow?.id ?? 'new') : null
  useAutoUrduNameFromEnglish(form, 'name', 'nameUrdu', customerSessionKey)

  useEffect(() => {
    if (!open || isEdit || !defaultName?.trim()) return
    form.setValue('name', defaultName.trim())
  }, [open, isEdit, defaultName, form])

  const dispatch = useDispatch<AppDispatch>()
  const [isSubmitting, setIsSubmitting] = useState(false)

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
    const { picture, idCardFront, idCardBack, customerType, paymentTerms, ...rest } = values
    const payload = isEdit
      ? {
          ...rest,
          picture: picture ?? null,
          idCardFront: idCardFront ?? null,
          idCardBack: idCardBack ?? null,
          customerType: customerType && customerType !== NONE ? customerType : undefined,
          paymentTerms: paymentTerms && paymentTerms !== NONE ? paymentTerms : undefined,
        }
      : {
          ...rest,
          ...(picture ? { picture } : {}),
          ...(idCardFront ? { idCardFront } : {}),
          ...(idCardBack ? { idCardBack } : {}),
          ...(customerType && customerType !== NONE ? { customerType } : {}),
          ...(paymentTerms && paymentTerms !== NONE ? { paymentTerms } : {}),
        }
    setIsSubmitting(true)
    try {
      if (isEdit) {
        const updated = await dispatch(updateCustomer({ ...payload, _id: currentRow?.id })).unwrap()
        toast.success(
          updated?.offlinePending
            ? 'Customer updated offline — will sync when you are back online'
            : t('customer_updated_success'),
        )
        setFetch?.((prev: any) => !prev)
      } else {
        const created = await dispatch(addCustomer(payload)).unwrap()
        toast.success(
          created?.offlinePending
            ? 'Customer saved offline — will sync when you are back online'
            : t('customer_created_success'),
        )
        setFetch?.((prev: any) => !prev)
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

  return (
    <Dialog
      open={open}
      onOpenChange={(state) => {
        form.reset()
        onOpenChange(state)
      }}
    >
      <DialogContent className='flex max-h-[96vh] w-[calc(100vw-1.25rem)] max-w-[min(96vw,1100px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,1100px)]'>
        <DialogHeader className='shrink-0 flex-row items-start gap-3 space-y-0 border-b border-border/60 px-6 pb-4 pt-6 text-left'>
          <span className='mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground'>
            <UserPlus className='h-5 w-5' />
          </span>
          <div className='space-y-1'>
            <DialogTitle className='text-xl'>
              {isEdit ? t('edit_customer') : t('add_customer')}
            </DialogTitle>
            <DialogDescription>
              {isEdit ? t('update_customer') : t('create_customer')} {t('click_save')}
            </DialogDescription>
          </div>
        </DialogHeader>
        <div className='min-h-0 flex-1 overflow-y-auto px-6 py-3'>
          <Form {...form}>
            <form
              id='customer-form'
              onSubmit={form.handleSubmit(onSubmit)}
              onKeyDown={handleFormEnterKeyDown}
              className='space-y-4'
            >
              <EntityFormSection
                icon={<User />}
                tone='sky'
                className='p-3 sm:p-4'
                title={isEdit ? t('customer_dialog_section_primary_edit') : t('customer_dialog_section_primary_new')}
                description={t('customer_dialog_section_primary_desc')}
              >
              <div className={showUrduInput ? 'grid gap-4 sm:grid-cols-2' : ''}>
                <FormField
                  control={form.control}
                  name='name'
                  render={({ field }) => (
                    <FormItem className='gap-1.5'>
                      <FormLabel>{t('customer_name')} *</FormLabel>
                      <FormControl>
                        <div className='relative'>
                          <User className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                          <SmartInput
                            placeholder={t('customer_name')}
                            showVoiceInput={true}
                            voiceInputSize="sm"
                            autoComplete='off'
                            className='pl-9'
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {showUrduInput && (
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
                )}
              </div>
              <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
                <FormField
                  control={form.control}
                  name='phone'
                  render={({ field }) => (
                    <FormItem className='gap-1.5'>
                      <FormLabel>{t('phone')}</FormLabel>
                      <FormControl>
                        <div className='relative'>
                          <PhoneIcon className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                          <Input
                            fieldType='phone'
                            placeholder={t('phone')}
                            autoComplete='off'
                            className='pl-9'
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='whatsapp'
                  render={({ field }) => (
                    <FormItem className='gap-1.5'>
                      <FormLabel>{t('whatsapp')}</FormLabel>
                      <FormControl>
                        <div className='relative'>
                          <MessageCircle className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                          <Input
                            fieldType='phone'
                            placeholder={t('whatsapp')}
                            autoComplete='off'
                            className='pl-9'
                            {...field}
                          />
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
                      <FormLabel>{t('email')}</FormLabel>
                      <FormControl>
                        <div className='relative'>
                          <Mail className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                          <Input
                            placeholder={t('email')}
                            autoComplete='off'
                            className='pl-9'
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='balance'
                  render={({ field }) => (
                    <FormItem className='gap-1.5'>
                      <FormLabel>{t('opening_balance')}</FormLabel>
                      <FormControl>
                        <div className='relative'>
                          <Wallet className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                          <Input
                            type='number'
                            placeholder={t('balance')}
                            autoComplete='off'
                            className='pl-9'
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name='address'
                render={({ field }) => (
                  <FormItem className='gap-1.5'>
                    <FormLabel>{t('address')}</FormLabel>
                    <FormControl>
                      <div className='relative'>
                        <MapPin className='pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground' />
                        <Textarea
                          placeholder={t('address')}
                          showVoiceInput={true}
                          autoComplete='off'
                          className='min-h-[4.5rem] pl-9'
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              </EntityFormSection>

              <EntityFormSection
                icon={<Receipt />}
                tone='amber'
                className='p-3 sm:p-4'
                title='Tax Information'
                description='Used on invoices and to determine whether this customer is charged tax.'
              >
                <div className='grid gap-4 sm:grid-cols-2'>
                  <FormField
                    control={form.control}
                    name='taxNumber'
                    render={({ field }) => (
                      <FormItem className='gap-1.5'>
                        <FormLabel>Tax Registration Number</FormLabel>
                        <FormControl>
                          <Input placeholder='e.g. GB123456789' autoComplete='off' {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name='taxExempt'
                    render={({ field }) => (
                      <FormItem className='flex flex-row items-center justify-between gap-3 rounded-lg border p-3'>
                        <div className='space-y-0.5'>
                          <FormLabel>Tax Exempt</FormLabel>
                          <p className='text-xs text-muted-foreground'>No tax is calculated on this customer's invoices.</p>
                        </div>
                        <FormControl>
                          <Switch checked={!!field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </EntityFormSection>

              <EntityFormSection
                icon={<IdCard />}
                tone='emerald'
                className='p-3 sm:p-4'
                title={t('customer_dialog_section_photos_title')}
                description={t('customer_dialog_section_photos_desc')}
              >
                <div className='grid gap-4 sm:grid-cols-3'>
                  <div className='space-y-1.5'>
                    <FormLabel>{t('profile_picture')}</FormLabel>
                    <ImageUpload
                      layout='compact'
                      uploadSlug='customers/upload-image'
                      previewAlt={t('profile_picture')}
                      currentImageUrl={form.watch('picture')?.url}
                      onImageUpload={(img) => form.setValue('picture', img)}
                      onImageRemove={() => form.setValue('picture', undefined)}
                    />
                  </div>
                  <div className='space-y-1.5'>
                    <FormLabel>{t('id_card_front')}</FormLabel>
                    <ImageUpload
                      layout='compact'
                      uploadSlug='customers/upload-image'
                      previewAlt={t('id_card_front')}
                      currentImageUrl={form.watch('idCardFront')?.url}
                      onImageUpload={(img) => form.setValue('idCardFront', img)}
                      onImageRemove={() => form.setValue('idCardFront', undefined)}
                    />
                  </div>
                  <div className='space-y-1.5'>
                    <FormLabel>{t('id_card_back')}</FormLabel>
                    <ImageUpload
                      layout='compact'
                      uploadSlug='customers/upload-image'
                      previewAlt={t('id_card_back')}
                      currentImageUrl={form.watch('idCardBack')?.url}
                      onImageUpload={(img) => form.setValue('idCardBack', img)}
                      onImageRemove={() => form.setValue('idCardBack', undefined)}
                    />
                  </div>
                </div>
              </EntityFormSection>
            </form>
          </Form>
        </div>
        <DialogFooter className='shrink-0 border-t border-border/60 bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80'>
          <Button type='button' variant='outline' onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('cancel')}
          </Button>
          <Button type='submit' form='customer-form' disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : t('save_customer')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
