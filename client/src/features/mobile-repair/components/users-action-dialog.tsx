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
import { addMobileRepair, updateMobileRepair } from '@/stores/mobileRepair.slice'
import toast from 'react-hot-toast'
import { MobileRepair } from '../data/schema'

import { useReactToPrint } from 'react-to-print'
import { useRef } from 'react'

const formSchema = z.object({
  name: z.string().min(1, { message: 'Name is required.' }),
  phone: z.string().optional(),
  mobileModel: z.string().optional(),
  mobileFault: z.string().optional(),
  totalAmount: z.number().min(0, { message: 'Total Amount must be positive' }).optional(),
  advance: z.number().min(0, { message: 'Advance must be positive' }).optional(),
})

type MobileRepairForm = z.infer<typeof formSchema>

interface Props {
  currentRow?: MobileRepair
  open: boolean
  onOpenChange: (open: boolean) => void
  setFetch: any
}

export function MobileRepairActionDialog({ currentRow, open, onOpenChange, setFetch }: Props) {
  const isEdit = !!currentRow
  const form = useForm<MobileRepairForm>({
    resolver: zodResolver(formSchema),
    defaultValues: isEdit
      ? {
        ...currentRow,
        totalAmount: currentRow?.totalAmount ?? 0,
      }
      : {
        name: '',
        phone: '',
        mobileModel: '',
        mobileFault: '',
        totalAmount: 0,
        advance: 0,
      },
  })

  const dispatch = useDispatch<AppDispatch>()
  const componentRef = useRef<HTMLDivElement>(null)

  const onSubmit = async (values: MobileRepairForm) => {
    if (isEdit) {
      await dispatch(updateMobileRepair({ ...values, _id: currentRow?.id }))
      toast.success('Mobile Repair updated successfully')
    } else {
      await dispatch(addMobileRepair(values))
      toast.success('Mobile Repair created successfully')
    }
    setFetch((prev: any) => !prev)
    // Do not reset/close here, wait until after print
  }

  const handleAfterPrint = () => {
    form.reset()
    onOpenChange(false)
  }

  // Define handlePrint once, stable
  const handlePrint = useReactToPrint({
    contentRef: componentRef,
    documentTitle: 'Mobile Repair Invoice',
    pageStyle: 'margin: 0.5cm;',
    onAfterPrint: handleAfterPrint,
  })

  const handleSaveAndPrint = async () => {
    const valid = await form.trigger()
    if (!valid) return
    const values = form.getValues()
    await onSubmit(values)

    if (!componentRef.current) {
      toast.error('Nothing to print!')
      return
    }

    // Slight delay to ensure DOM ready for printing
    setTimeout(() => {
      handlePrint()
    }, 100)
  }

  return (
    <>
      <style>{`
        .print-invoice {
          display: none !important;
        }
        @media print {
          form {
            display: none !important;
          }
          .print-invoice {
            display: block !important;
          }
        }
      `}</style>

      <Dialog
        open={open}
        onOpenChange={(state) => {
          form.reset()
          onOpenChange(state)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="text-left">
            <DialogTitle>{isEdit ? 'Edit Mobile Repair' : 'Add New Mobile Repair'}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? 'Update the mobile repair record here.'
                : 'Create a new mobile repair record here.'}{' '}
              Click save when you're done.
            </DialogDescription>
          </DialogHeader>

          <div className="-mr-4 h-[26.25rem] w-full overflow-y-auto py-1 pr-4">
            <Form {...form}>
              <form
                id="mobileRepair-form"
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4 p-0.5"
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1">
                      <FormLabel className="col-span-2 text-right">Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Name" className="col-span-4" autoComplete="off" {...field} />
                      </FormControl>
                      <FormMessage className="col-span-4 col-start-3" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem className="grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1">
                      <FormLabel className="col-span-2 text-right">Phone</FormLabel>
                      <FormControl>
                        <Input placeholder="Phone" className="col-span-4" autoComplete="off" {...field} />
                      </FormControl>
                      <FormMessage className="col-span-4 col-start-3" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="mobileModel"
                  render={({ field }) => (
                    <FormItem className="grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1">
                      <FormLabel className="col-span-2 text-right">Mobile Model</FormLabel>
                      <FormControl>
                        <Input placeholder="Mobile Model" className="col-span-4" autoComplete="off" {...field} />
                      </FormControl>
                      <FormMessage className="col-span-4 col-start-3" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="mobileFault"
                  render={({ field }) => (
                    <FormItem className="grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1">
                      <FormLabel className="col-span-2 text-right">Mobile Fault</FormLabel>
                      <FormControl>
                        <Input placeholder="Mobile Fault" className="col-span-4" autoComplete="off" {...field} />
                      </FormControl>
                      <FormMessage className="col-span-4 col-start-3" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="totalAmount"
                  render={({ field }) => (
                    <FormItem className="grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1">
                      <FormLabel className="col-span-2 text-right">Total Amount</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Total Amount"
                          className="col-span-4"
                          autoComplete="off"
                          type="number"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage className="col-span-4 col-start-3" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="advance"
                  render={({ field }) => (
                    <FormItem className="grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1">
                      <FormLabel className="col-span-2 text-right">Advance Amount</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Advance Amount"
                          className="col-span-4"
                          autoComplete="off"
                          type="number"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage className="col-span-4 col-start-3" />
                    </FormItem>
                  )}
                />
              </form>
            </Form>

            {/* Printable Invoice */}
            <div
              ref={componentRef}
              className="print-invoice"
              style={{ fontFamily: 'Arial, sans-serif', color: '#000', padding: '1rem' }}
            >
              <div className="bg-white border rounded-lg shadow-lg px-6 py-8 max-w-md mx-auto mt-8">
                <h1 className="font-bold text-2xl my-4 text-center text-blue-600">SHAHID MOBILES</h1>
                <hr className="mb-2" />
                <div className="flex justify-between mb-6">
                  <h1 className="text-lg font-bold">Invoice</h1>
                  <div className="text-gray-700">
                    <div>
                      Date: {new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                  </div>
                </div>
                <div className="mb-8">
                  <h2 className="text-lg font-bold mb-4">Bill To:</h2>
                  <div className="text-gray-700 mb-2">{form.getValues('name')}</div>
                  <div className="text-gray-700 mb-2">{form.getValues('phone')}</div>
                  <div className="text-gray-700 mb-2">{form.getValues('mobileModel')}</div>
                </div>
                <table className="w-full mb-8">
                  <thead>
                    <tr>
                      <th className="text-left font-bold text-gray-700">Description</th>
                      <th className="text-right font-bold text-gray-700">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="text-left text-gray-700">{form.getValues('mobileFault')}</td>
                      <td className="text-right text-gray-700">Rs.{form.getValues('totalAmount') ?? 0}</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="text-left font-bold text-gray-700">Total</td>
                      <td className="text-right font-bold text-gray-700">Rs.{form.getValues('totalAmount') ?? 0}</td>
                    </tr>
                    <tr>
                      <td className="text-left font-bold text-gray-700">Advance</td>
                      <td className="text-right font-bold text-gray-700">Rs.{form.getValues('advance') ?? 0}</td>
                    </tr>
                    <tr>
                      <td className="text-left font-bold text-gray-700">Due Amount</td>
                      <td className="text-right font-bold text-gray-700">
                        Rs. {(
                          (form.getValues('totalAmount') || 0) - (form.getValues('advance') || 0)
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
                <div className="text-gray-700 mb-2">Thank you for your business!</div>
              </div>
            </div>
          </div>

          <DialogFooter className="space-x-2">
            <Button type="submit" form="mobileRepair-form">
              Save
            </Button>
            <Button type="button" onClick={handleSaveAndPrint}>
              Save and Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
