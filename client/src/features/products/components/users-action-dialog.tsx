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

const formSchema = z.object({
  name: z.string().min(1, { message: 'Name is required.' }),
  description: z.string(),
  price: z.number().min(1, { message: 'Price is required.' }),
  cost: z.number().min(1, { message: 'Cost is required.' }),
  stockQuantity: z.number().min(1, { message: 'Stock quantity is required.' }),
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
  const form = useForm<productForm>({
    resolver: zodResolver(formSchema),
    defaultValues: isEdit
      ? {
        ...currentRow,
      }
      : {
        name: '',
        description: '',
        stockQuantity: 0,
        price: 0,
        cost: 0,
      },
  })

  const dispatch = useDispatch<AppDispatch>()

  const onSubmit = async (values: productForm) => {
    if (isEdit) {
      await dispatch(updateProduct({ ...values, _id: currentRow?.id })).then(() => {
        toast.success('Product updated successfully')
        setFetch((prev: any) => !prev)
      })
    } else {
      await dispatch(addProduct(values)).then(() => {
        toast.success('Product Created successfully')
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
          <DialogTitle>{isEdit ? 'Edit Product' : 'Add New Product'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update the Product here. ' : 'Create new Product here. '}
            Click save when you&apos;re done.
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
                      Product Name
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder='Product Name'
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
                      Description
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder='Description'
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
                name='price'
                render={({ field }) => (
                  <FormItem className='grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1'>
                    <FormLabel className='col-span-2 text-right'>
                      Price
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder='Product price'
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
                      Cost
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder='Product Cost.'
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
                      stockQuantity
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder='Product Cost.'
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
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
