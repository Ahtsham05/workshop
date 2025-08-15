'use client';

import { useState } from 'react';
import { useSelector } from 'react-redux';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Select from 'react-select';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import TransactionsProvider from '../transactions/context/users-context';
import { Header } from '@/components/layout/header';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Main } from '@/components/layout/main';
import { selectBoxStyle } from '@/assets/styling';
import { useNavigate } from '@tanstack/react-router';

const accountLedgerSchema = z.object({
  account: z.string().min(1, { message: 'Account is required' }),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

type AccountLedgerFormValues = z.infer<typeof accountLedgerSchema>;

export default function AccountLedger() {
  const [fetching, setFetching] = useState(false);
  // Fallback to an empty array if accountsOptions is null or undefined
  const storeAccounts = useSelector((state: any) => state.account?.data) || []
  const accountsOptions = storeAccounts?.filter((account: any) => !account.customer && !account.supplier);

  const form = useForm<AccountLedgerFormValues>({
    resolver: zodResolver(accountLedgerSchema),
    defaultValues: {
      account: '',
      startDate: '',
      endDate: '',
    },
  });

  const navigate = useNavigate()
  const onSubmit = async (values: AccountLedgerFormValues) => {
    setFetching(true);
    try {
      navigate({ to: `/account-ledger-detail?account=${values.account}&startDate=${values.startDate}&endDate=${values.endDate}`, replace: true })
    } catch (error) {
      toast.error('Failed to fetch transactions');
    } finally {
      setFetching(false);
    }
  };

  return (
    <TransactionsProvider>
      <Header fixed>
        <Search />
        <div className="ml-auto flex items-center space-x-4">
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>
      <Main>
        <div className="mb-2 flex flex-wrap items-center justify-between space-y-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Accounts Ledger</h2>
            <p className="text-muted-foreground">Manage your Accounts Ledger here.</p>
          </div>
          {/* <TransactionPrimaryButtons /> */}
        </div>
        <div className="p-6">
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* account Select */}
            <div>
              <label htmlFor="account" className="block text-sm font-medium mb-2">
                Accounts
              </label>
              <Controller
                name="account"
                control={form.control}
                render={({ field }) => (
                  <Select
                    {...field}
                    options={accountsOptions}
                    placeholder="Select account..."
                    value={accountsOptions?.find((o: any) => o?.value === field?.value)}
                    onChange={(option) => field.onChange(option?.value)}
                    styles={selectBoxStyle}
                    className="col-span-4 text-sm outline-none border-1 rounded-md focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px] bg-transparent text-black dark:text-white"

                  />
                )}
              />
            </div>

            {/* Date Range */}
            <div className="flex space-x-4">
              <div className="w-full">
                <label htmlFor="startDate" className="block text-sm font-medium mb-2">
                  Start Date
                </label>
                <Controller
                  name="startDate"
                  control={form.control}
                  render={({ field }) => (
                    <Input type="date" {...field} className="w-full" />
                  )}
                />
              </div>
              <div className="w-full">
                <label htmlFor="endDate" className="block text-sm font-medium mb-2">
                  End Date
                </label>
                <Controller
                  name="endDate"
                  control={form.control}
                  render={({ field }) => (
                    <Input type="date" {...field} className="w-full" />
                  )}
                />
              </div>
            </div>

            {/* Submit Button */}
            <div>
              <Button type="submit" disabled={fetching} className="mt-4">
                {fetching ? 'Fetching Ledger...' : 'Get Ledger'}
              </Button>
            </div>
          </form>
        </div>
      </Main>
    </TransactionsProvider>
  );
}
