'use client'

import { useEffect, useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useDispatch } from 'react-redux'
import toast from 'react-hot-toast'
import { UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { AppDispatch } from '@/stores/store'
import { addCustomer } from '@/stores/customer.slice'
import { useLanguage } from '@/context/language-context'
import { toneColor } from '@/lib/stat-card-tones'
import { handleFormEnterKeyDown } from '@/lib/form-enter-navigation'

const formSchema = z.object({
  name: z.string().min(1, { message: 'Name is required.' }),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().optional(),
  balance: z.coerce.number().optional(),
  address: z.string().optional(),
})

type QuickAddForm = z.infer<typeof formSchema>

const emptyValues: QuickAddForm = {
  name: '',
  phone: '',
  whatsapp: '',
  email: '',
  balance: 0,
  address: '',
}

interface Props {
  setFetch?: (updater: (prev: boolean) => boolean) => void
  onCreated?: (entity: unknown) => void
}

/** Fast, no-photos customer entry — sits beside the list for one-line-at-a-time
 *  data entry. The full "Add Customer" header button still opens the complete
 *  dialog (Urdu name, photos, ID uploads) for when those are needed. */
export function QuickAddCustomerCard({ setFetch, onCreated }: Props) {
  const { t, isRTL } = useLanguage()
  const dispatch = useDispatch<AppDispatch>()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<QuickAddForm>({
    resolver: zodResolver(formSchema),
    defaultValues: emptyValues,
  })

  // Auto-copy phone to WhatsApp, same UX as the full Add Customer dialog.
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === 'phone' && value.phone) {
        form.setValue('whatsapp', value.phone)
      }
    })
    return () => subscription.unsubscribe()
  }, [form])

  const onSubmit = async (values: QuickAddForm) => {
    setIsSubmitting(true)
    try {
      const created = await dispatch(addCustomer(values)).unwrap()
      toast.success(t('customer_created_success'))
      setFetch?.((prev) => !prev)
      onCreated?.(created)
      form.reset(emptyValues)
    } catch {
      // addCustomer already surfaces its own error toast
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className='rounded-xl border bg-card p-5 shadow-sm'>
      <div className='mb-4 flex items-center gap-3'>
        <span
          className='inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white'
          style={{ backgroundColor: toneColor('violet') }}
        >
          <UserPlus className='h-5 w-5' />
        </span>
        <div className='min-w-0'>
          <p className='truncate text-sm font-semibold'>{t('quick_add_customer')}</p>
          <p className='truncate text-xs text-muted-foreground'>{t('quick_add_customer_desc')}</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} onKeyDown={handleFormEnterKeyDown} className='space-y-3.5'>
          <FormField
            control={form.control}
            name='name'
            render={({ field }) => (
              <FormItem className='gap-1.5'>
                <FormLabel className='text-xs'>{t('customer_name')}</FormLabel>
                <FormControl>
                  <Input placeholder={t('enter_customer_name')} autoComplete='off' showVoiceInput={false} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className='grid grid-cols-2 gap-3'>
            <FormField
              control={form.control}
              name='phone'
              render={({ field }) => (
                <FormItem className='gap-1.5'>
                  <FormLabel className='text-xs'>{t('phone')}</FormLabel>
                  <FormControl>
                    <Input fieldType='phone' placeholder='03XXXXXXXXX' autoComplete='off' showVoiceInput={false} {...field} />
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
                  <FormLabel className='text-xs'>{t('whatsapp')}</FormLabel>
                  <FormControl>
                    <Input fieldType='phone' placeholder='03XXXXXXXXX' autoComplete='off' showVoiceInput={false} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <FormField
              control={form.control}
              name='email'
              render={({ field }) => (
                <FormItem className='gap-1.5'>
                  <FormLabel className='text-xs'>{t('email')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('email')} autoComplete='off' showVoiceInput={false} {...field} />
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
                  <FormLabel className='text-xs'>{t('opening_balance')}</FormLabel>
                  <FormControl>
                    <Input type='number' placeholder='0' autoComplete='off' showVoiceInput={false} {...field} />
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
                <FormLabel className={`text-xs ${isRTL ? 'text-right' : ''}`}>{t('address')}</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder={t('address')}
                    autoComplete='off'
                    showVoiceInput={false}
                    className='min-h-[4.5rem] resize-none'
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className='flex items-center gap-2 pt-1'>
            <Button
              type='button'
              variant='outline'
              className='flex-1'
              disabled={isSubmitting}
              onClick={() => form.reset(emptyValues)}
            >
              {t('clear')}
            </Button>
            <Button type='submit' className='flex-1' disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : t('save_customer')}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}
