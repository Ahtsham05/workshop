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
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { addSupplier, updateSupplier } from '@/stores/supplier.slice' // Adjusted to supplier slice
import toast from 'react-hot-toast'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'

// Define the form schema with translations
const getFormSchema = (t: (key: string) => string) => z.object({
  name: z.string().min(1, { 
    message: t('name_required') || 'Name is required.' 
  }),
  email: z.string().optional(),
  phone: z.string(),
  whatsapp: z.string().optional(),
  address: z.string().optional(),
})

interface Props {
  currentRow?: any
  open: boolean
  onOpenChange: (open: boolean) => void
  setFetch: any
}

export function SuppliersActionDialog({ currentRow, open, onOpenChange, setFetch }: Props) {
  const { t, language } = useLanguage()
  const isEdit = !!currentRow
  const isUrdu = language === 'ur'
  
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
          email: 'supplier@gmail.com',
          phone: '03',
          whatsapp: '03',
          address: 'address',
        },
  })
  
  // Watch the phone field and update whatsapp field automatically
  const phoneValue = form.watch('phone')
  
  // Update whatsapp field when phone changes
  useEffect(() => {
    // Don't update if we're in edit mode and the component just mounted
    if (phoneValue && (!isEdit || phoneValue !== currentRow?.phone)) {
      form.setValue('whatsapp', phoneValue)
    }
  }, [phoneValue, form, isEdit, currentRow])

  const dispatch = useDispatch<AppDispatch>()

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (isEdit) {
      await dispatch(updateSupplier({ ...values, _id: currentRow?.id })).then(() => {
        toast.success(t('supplier_updated_success'))
        setFetch((prev: any) => !prev)
      })
    } else {
      await dispatch(addSupplier(values)).then(() => {
        toast.success(t('supplier_created_success'))
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
        <DialogHeader className={cn('text-left', isUrdu && 'text-right')}>
          <DialogTitle className='mb-3'>{isEdit ? t('edit_supplier') : t('add_supplier')}</DialogTitle>
          <DialogDescription>
            {isEdit ? t('update_supplier') : t('create_supplier')} 
            {t('click_save')}
          </DialogDescription>
        </DialogHeader>
        <div className='-mr-4 h-[26.25rem] w-full overflow-y-auto py-1 pr-4'>
          <Form {...form}>
            <form
              id='supplier-form'
              onSubmit={form.handleSubmit(onSubmit)}
              className='space-y-4 p-0.5'
            >
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem className='grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1'>
                    <FormLabel className={cn('col-span-2', isUrdu ? 'text-left' : 'text-right')}>
                      {t('supplier_name')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('supplier_name')}
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
                    <FormLabel className={cn('col-span-2', isUrdu ? 'text-left' : 'text-right')}>
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
                    <FormLabel className={cn('col-span-2', isUrdu ? 'text-left' : 'text-right')}>
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
                    <FormLabel className={cn('col-span-2', isUrdu ? 'text-left' : 'text-right')}>
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
                name='address'
                render={({ field }) => (
                  <FormItem className='grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1'>
                    <FormLabel className={cn('col-span-2', isUrdu ? 'text-left' : 'text-right')}>
                      {t('address')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={`${t('supplier_name')} ${t('address')}`}
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
          <Button type='submit' form='supplier-form'>
            {t('save_changes')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
