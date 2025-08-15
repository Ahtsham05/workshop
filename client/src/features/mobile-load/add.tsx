'use client';

import React, { useEffect } from 'react';
import { z } from 'zod';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch } from '@/stores/store';
import { addTransaction, fetchTransactions, updateTransaction } from '@/stores/transaction.slice';
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

import { Transaction } from './data/schema';
import { useNavigate } from '@tanstack/react-router';
// import { getAccountDetailsById } from '@/stores/account.slice';

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
//   setFetch: React.Dispatch<React.SetStateAction<boolean>>;
//   open: boolean;
//   onOpenChange: (open: boolean) => void;
  currentTransaction?: Transaction | null;
}

export default function TransactionActionDialog({
//   setFetch,
//   open,
//   onOpenChange,
  currentTransaction,
}: TransactionActionDialogProps) {
  const isEdit = Boolean(currentTransaction);
  const accountsOptions = useSelector((state: any) => state.account?.data);
  const [formState, setFormState] = React.useState(true);
  const [selectedAccount, setSelectedAccount] = React.useState(null);

    const dispatch = useDispatch<AppDispatch>();
    const [previousBalance, setPreviousBalance] = React.useState(0);

  
    useEffect(() => {
    //   const startDate = new Date().toISOString().split('T')[0];
    //   const endDate = new Date().toISOString().split('T')[0];
      const fetchTransactionss = async () => {
        const params = {
          account: selectedAccount,
        };
        await dispatch(fetchTransactions(params)).then((action) => {
          // Process the payload directly in this effect
          const accountDetails = action.payload;
          // Calculate previous balance from previous sales and transactions
          let previousTransactionsTotal = 0;
   
          accountDetails?.results?.forEach((transaction: any) => {
            if (transaction.transactionType === "cashReceived") {
              previousTransactionsTotal -= transaction.amount;
            } else {
              previousTransactionsTotal += transaction.amount;
            }
          });
        //   console.log("previousBalance",previousTransactionsTotal)
          const previousBalancee = previousTransactionsTotal;
          setPreviousBalance(previousBalancee);
        });
      };
      if(selectedAccount){
        fetchTransactionss();
      }
    }, [selectedAccount, dispatch]);
  
// console.log("previousBalance", previousBalance)
// console.log("selectedAccount", selectedAccount)
  // console.log("accountsOptions", accountsOptions)
const navigate = useNavigate()
  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: isEdit
      ? {
        account: currentTransaction?.account ?? '',
        amount: currentTransaction?.amount ?? 0,
        transactionType: currentTransaction?.transactionType ?? 'cashReceived',
        transactionDate: currentTransaction?.transactionDate ?? '',
        description: currentTransaction?.description ?? '',
        status: currentTransaction?.status ?? 'pending',
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
      if (isEdit && currentTransaction?._id) {
        await dispatch(updateTransaction({ ...values, _id: currentTransaction._id, amount: previousBalance - values.amount }))
          .then(() => {
            toast.success('Transaction updated successfully');
            // setFetch((prev) => !prev);
            navigate({ to: '/transactions', replace: true })
          })
      } else {
        await dispatch(addTransaction({...values, amount: previousBalance - values.amount}))
          .then(() => {
            toast.success('Transaction created successfully');
            // setFetch((prev) => !prev);
            navigate({ to: '/transactions', replace: true })
          })
      }
      form.reset();
    //   onOpenChange(false);
  };

  return (
    <Dialog
      open={formState}
      onOpenChange={() => {
        form.reset();
        setFormState(false)
        navigate({ to: '/transactions', replace: true })
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
              {/* <FormField
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
              /> */}
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
                              setSelectedAccount(option?.value);
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

              {/* <FormField
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
              /> */}

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
                    <FormLabel>Closing Amount</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="Closing Amount"
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
