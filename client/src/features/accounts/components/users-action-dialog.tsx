'use client'

import React from 'react'
import { z } from 'zod'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useDispatch, useSelector } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { addAccount, updateAccount } from '@/stores/account.slice'
import toast from 'react-hot-toast'

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
import Select from 'react-select'  // Importing react-select

import { Account } from '../data/schema'
import { selectBoxStyle } from '@/assets/styling'  // Custom styles for react-select

// Validation schema for Account form
const accountSchema = z.object({
  name: z.string().min(1, { message: 'Account name is required' }),
  type: z.enum(['receivable', 'payable']),
  balance: z.number().min(0).optional(),
  transactionType: z.enum(['cashReceived', 'expenseVoucher', 'generalLedger']),
  customer: z.string().optional(),
  supplier: z.string().optional(),
})

type AccountFormValues = z.infer<typeof accountSchema>

interface AccountActionDialogProps {
  setFetch: React.Dispatch<React.SetStateAction<boolean>>
  open: boolean
  onOpenChange: (open: boolean) => void
  currentAccount?: Account | null
}

export default function AccountActionDialog({
  setFetch,
  open,
  onOpenChange,
  currentAccount,
}: AccountActionDialogProps) {
  const isEdit = Boolean(currentAccount)
  const dispatch = useDispatch<AppDispatch>()

  // Fetch customer data from the store using useSelector
  const customersOptions = useSelector((state: any) => state.customer?.data) || [];
  const suppliersOptions = useSelector((state: any) => state.supplier?.data);
  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: isEdit
      ? {
        name: currentAccount?.name ?? '',
        type: currentAccount?.type ?? 'receivable',
        balance: currentAccount?.balance ?? 0,
        transactionType: currentAccount?.transactionType ?? 'cashReceived',
        customer: currentAccount?.customer ?? '',
        supplier: currentAccount?.supplier ?? '',
      }
      : {
        name: '',
        type: 'receivable',
        balance: 0,
        transactionType: 'cashReceived',
        customer: '',
        supplier: '',
      },
  })

  const onSubmit = async (values: any) => {
    // Ensure supplier and customer fields are null when empty
    if (values.supplier === "") {
      values.supplier = null; // Set supplier to null instead of an empty string
    }

    if (values.customer === "") {
      values.customer = null; // Set customer to null instead of an empty string
    }
    console.log("values", values)
    if (isEdit && currentAccount?.id) {
      await dispatch(updateAccount({ ...values, _id: currentAccount.id }))
        .then(() => {
          toast.success('Account updated successfully')
          setFetch((prev) => !prev)
        })
        .catch(() => toast.error('Failed to update account'))
    } else {
      await dispatch(addAccount(values))
        .then(() => {
          toast.success('Account created successfully')
          setFetch((prev) => !prev)
        })
        .catch(() => toast.error('Failed to create account'))
    }
    form.reset()
    onOpenChange(false)  // Close the dialog after submit
  }

  return (
    <Dialog open={open} onOpenChange={(state) => {
      form.reset()
      onOpenChange(state) // Properly reset the form and handle state change
    }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Account' : 'Add New Account'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update the account details here.' : 'Create a new account here.'}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[26rem] overflow-y-auto pr-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Account name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="customer"
                render={() => (
                  <FormItem className="space-y-0">
                    <FormLabel className="col-span-2 text-right">Customer Name</FormLabel>
                    <FormControl>
                      <Controller
                        name="customer"
                        control={form.control}
                        render={({ field }) => (
                          <Select
                            {...field}
                            placeholder="Select Customer..."
                            options={customersOptions}
                            value={customersOptions?.find((o: any) => o?.value === field?.value)} // Ensure value is correctly set
                            onChange={(option: any) => {
                              field.onChange(option?.value); // Ensure we are passing the correct value
                            }}
                            styles={selectBoxStyle}
                            className="col-span-4 text-sm outline-none border-1 rounded-md focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px] bg-transparent text-black dark:text-white"
                          />
                        )}
                      />
                    </FormControl>
                    <FormMessage className="col-span-4 col-start-3" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="supplier"
                render={() => (
                  <FormItem className="space-y-0">
                    <FormLabel className="col-span-2 text-right">Supplier Name</FormLabel>
                    <FormControl>
                      <Controller
                        name="supplier"
                        control={form.control}
                        render={({ field }) => (
                          <Select
                            {...field}
                            placeholder="Select Supplier..."
                            options={suppliersOptions}
                            value={suppliersOptions?.find((o: any) => o?.value === field?.value)} // Ensure value is correctly set
                            onChange={(option) => {
                              // console.log("option", option)
                              field.onChange(option?.value); // Ensure we are passing the correct value
                            }}
                            styles={{
                              control: (base: any) => ({
                                ...base,
                                boxShadow: 'none',
                                borderColor: 'transparent',
                                backgroundColor: 'transparent',
                                color: document.documentElement.classList.contains('dark')
                                  ? 'white'
                                  : 'black',
                                '&:hover': { borderColor: 'transparent' },
                                minHeight: '2.5rem',
                                borderRadius: '0.5rem',
                              }),
                              singleValue: (base: any) => ({
                                ...base,
                                maxWidth: 'full',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                color: document.documentElement.classList.contains('dark')
                                  ? 'white'
                                  : 'black',
                              }),
                              option: (base: any, state: any) => {
                                const isDark = document.documentElement.classList.contains('dark');
                                return {
                                  ...base,
                                  backgroundColor: state.isSelected
                                    ? isDark
                                      ? '#374151' // dark:bg-gray-700
                                      : '#262E40'
                                    : state.isFocused
                                      ? isDark
                                        ? '#4b5563' // dark:bg-gray-600
                                        : '#d2d5db'
                                      : 'transparent',
                                  color: state.isSelected
                                    ? (isDark ? 'white' : 'white')
                                    : (isDark ? 'white' : 'black'),
                                  cursor: 'pointer',
                                };
                              },
                              menu: (base: any) => ({
                                ...base,
                                backgroundColor: document.documentElement.classList.contains('dark')
                                  ? '#1f2937'
                                  : 'white',
                                zIndex: 20,
                              }),
                            }}
                            className="col-span-4 text-sm outline-none border-1 rounded-md focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px] bg-transparent text-black dark:text-white"
                          />
                        )}
                      />
                    </FormControl>
                    <FormMessage className="col-span-4 col-start-3" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <FormControl>
                      <Select
                        {...field}
                        options={[
                          { value: 'receivable', label: 'Receivable' },
                          { value: 'payable', label: 'Payable' },
                        ]}
                        onChange={(option: any) => field.onChange(option?.value)}
                        value={{
                          value: field.value,
                          label: field.value === 'receivable' ? 'Receivable' : 'Payable',
                        }}
                        styles={selectBoxStyle}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="transactionType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Transaction Type</FormLabel>
                    <FormControl>
                      <Select
                        {...field}
                        options={[
                          { value: 'cashReceived', label: 'Cash Received' },
                          { value: 'expenseVoucher', label: 'Expense Voucher' },
                          { value: 'generalLedger', label: 'General Ledger' },
                        ]}
                        onChange={(option: any) => field.onChange(option?.value)}
                        value={{
                          value: field.value,
                          label: field.value === 'cashReceived'
                            ? 'Cash Received'
                            : field.value === 'expenseVoucher'
                              ? 'Expense Voucher'
                              : 'General Ledger',
                        }}
                        styles={selectBoxStyle}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="balance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Balance</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="Balance"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit">{isEdit ? 'Update Account' : 'Create Account'}</Button>
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
