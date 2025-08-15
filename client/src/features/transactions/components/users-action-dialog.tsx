'use client';

import React from 'react';
import { z } from 'zod';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch } from '@/stores/store';
import { addTransaction, updateTransaction } from '@/stores/transaction.slice';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import Select from 'react-select';

import { Transaction } from '../data/schema';

const transactionSchema = z.object({
  account: z.string().min(1, { message: 'Account is required' }),
  amount: z.number().min(0, { message: 'Amount must be positive' }),
  transactionType: z.enum(['cashReceived', 'expenseVoucher']),
  transactionDate: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['pending', 'completed']).optional(),
});

type TransactionFormValues = z.infer<typeof transactionSchema>;

interface TransactionActionDialogProps {
  setFetch: React.Dispatch<React.SetStateAction<boolean>>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentRow?: Transaction | null;
}

export default function TransactionActionDialog({
  setFetch,
  open,
  onOpenChange,
  currentRow,
}: TransactionActionDialogProps) {
  const isEdit = Boolean(currentRow);
  const dispatch = useDispatch<AppDispatch>();
  const accountsOptions = useSelector((state: any) => state.account?.data);
  // console.log("accountsOptions", accountsOptions)

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: isEdit
      ? {
        account: currentRow?.account ?? '',
        amount: currentRow?.amount ?? 0,
        transactionType: currentRow?.transactionType ?? 'cashReceived',
        transactionDate: currentRow?.transactionDate ?? '',
        description: currentRow?.description ?? '',
        status: currentRow?.status ?? 'pending',
      }
      : {
        account: '',
        amount: 0,
        transactionType: 'cashReceived',
        transactionDate: new Date().toISOString().split('T')[0],
        description: '',
        status: 'pending',
      },
  });

  const onSubmit = async (values: any) => {
    try {
      if (isEdit && currentRow?._id) {
        await dispatch(updateTransaction({ ...values, _id: currentRow._id }))
          .unwrap()
          .then(() => {
            toast.success('Transaction updated successfully');
            setFetch((prev) => !prev);
          })
          .catch(() => toast.error('Failed to update transaction'));
      } else {
        await dispatch(addTransaction(values))
          .unwrap()
          .then(() => {
            toast.success('Transaction created successfully');
            setFetch((prev) => !prev);
          })
          .catch(() => toast.error('Failed to create transaction'));
      }
      form.reset();
      onOpenChange(false);
    } catch (error) {
      toast.error('Operation failed');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(state) => {
        form.reset();
        onOpenChange(state);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Transaction' : 'Add New Transaction'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update the transaction details here.' : 'Create a new transaction here.'}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[26rem] overflow-y-auto pr-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* <FormField
                control={form.control}
                name="account"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account ID</FormLabel>
                    <FormControl>
                      <Input placeholder="Account ID" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              /> */}
              <FormField
                control={form.control}
                name="transactionDate"
                render={({ field }) => (
                  <FormItem className='w-full'>
                    <FormLabel>Transaction Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} className='w-full relative text-sm outline-none border-1 rounded-md focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px] bg-transparent text-black dark:text-white' />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="account"
                render={() => (
                  <FormItem className="space-y-0">
                    <FormLabel className="col-span-2 text-right">Account Name</FormLabel>
                    <FormControl>
                      <Controller
                        name="account"
                        control={form.control}
                        render={({ field }) => (
                          <Select
                            {...field}
                            placeholder="Select Account..."
                            options={accountsOptions}
                            value={accountsOptions?.find((o: any) => o?.value === field?.value)} // Ensure value is correctly set
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
                        ]}
                        onChange={(option: any) => field.onChange(option?.value)}
                        value={{
                          value: field.value,
                          label:
                            field.value === 'cashReceived'
                              ? 'Cash Received'
                              : 'Expense Voucher',
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
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <FormControl>
                      <Select
                        {...field}
                        options={[
                          { value: 'pending', label: 'Pending' },
                          { value: 'completed', label: 'Completed' },
                        ]}
                        onChange={(option: any) => field.onChange(option?.value)}
                        value={{
                          value: field.value,
                          label: field.value === 'pending' ? 'Pending' : 'Completed',
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
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              /> */}



              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input placeholder="Description" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="Amount"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="submit">{isEdit ? 'Update Transaction' : 'Create Transaction'}</Button>
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
