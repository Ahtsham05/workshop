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
import { addCustomer, updateCustomer } from '@/stores/customer.slice'
import toast from 'react-hot-toast'
import { useLanguage } from '@/context/language-context'
import { useEffect } from 'react'

const formSchema = z.object({
  name: z.string().min(1, { message: 'Name is required.' }),
  email: z.string().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),  // Added whatsapp field
  address: z.string().optional(),
})

type customerForm = z.infer<typeof formSchema>

interface Props {
  currentRow?: any
  open: boolean
  onOpenChange: (open: boolean) => void
  setFetch: any
}

export function CustomersActionDialog({ currentRow, open, onOpenChange, setFetch }: Props) {
  const isEdit = !!currentRow
  const { t } = useLanguage()
  const form = useForm<customerForm>({
    resolver: zodResolver(formSchema),
    defaultValues: isEdit
      ? {
          ...currentRow,
        }
      : {
          name: '',
          email: 'customer@gmail.com',
          phone: '+923',
          whatsapp: '+923',  // Added whatsapp field
          address: 'address',
        },
  })

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
    if (isEdit) {
      await dispatch(updateCustomer({ ...values, _id: currentRow?.id })).then(() => {
        toast.success(t('customer_updated_success'))
        setFetch((prev: any) => !prev)
      })
    } else {
      await dispatch(addCustomer(values)).then(() => {
        toast.success(t('customer_created_success'))
        setFetch((prev: any) => !prev)
      })
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
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader className='text-left'>
          <DialogTitle className='mb-2'>{isEdit ? t('edit_customer') : t('add_customer')}</DialogTitle>
          <DialogDescription>
            {isEdit ? t('update_customer') : t('create_customer')} {t('click_save')}
          </DialogDescription>
        </DialogHeader>
        <div className='-mr-4 h-[26.25rem] w-full overflow-y-auto py-1 pr-4'>
          <Form {...form}>
            <form
              id='customer-form'
              onSubmit={form.handleSubmit(onSubmit)}
              className='space-y-4 p-0.5'
            >
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem className='grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1'>
                    <FormLabel className='col-span-2 text-right'>
                      {t('customer_name')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('customer_name')}
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
                name='email'
                render={({ field }) => (
                  <FormItem className='grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1'>
                    <FormLabel className='col-span-2 text-right'>
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
                    <FormLabel className='col-span-2 text-right'>
                      {t('phone')}
                    </FormLabel>
                    <FormControl>
                      <Input
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
                    <FormLabel className='col-span-2 text-right'>
                      {t('whatsapp')}
                    </FormLabel>
                    <FormControl>
                      <Input
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
                name='address'
                render={({ field }) => (
                  <FormItem className='grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1'>
                    <FormLabel className='col-span-2 text-right'>
                      {t('address')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('address')}
                        className='col-span-4'
                        autoComplete='off'
                        {...field}
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
          <Button type='submit' form='customer-form'>
            {t('save_changes')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
