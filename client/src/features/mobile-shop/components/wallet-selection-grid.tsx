import {
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpRight,
  Wallet,
} from 'lucide-react'
import { format, isValid } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { resolveWalletId, type WalletLike } from '@/features/mobile-shop/utils/wallet-utils'

const formatWalletDate = (dateValue?: string) => {
  if (!dateValue) return '-'
  const parsedDate = new Date(dateValue)
  if (!isValid(parsedDate)) return '-'
  return format(parsedDate, 'MMM dd, yyyy')
}

const formatWalletBalance = (value?: number) => {
  const numericValue = Number(value)
  const safeValue = Number.isFinite(numericValue) ? numericValue : 0
  return safeValue.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export type WalletSelectionAction =
  | { tab: 'purchase' }
  | { tab: 'sell' }
  | { action: 'withdrawal' }
  | { action: 'deposit' }

type WalletSelectionGridProps = {
  wallets: WalletLike[]
  variant: 'load' | 'cash'
  isLoading?: boolean
  onWalletAction: (wallet: WalletLike, action: WalletSelectionAction) => void
}

export function WalletSelectionGrid({
  wallets,
  variant,
  isLoading,
  onWalletAction,
}: WalletSelectionGridProps) {
  const isLoad = variant === 'load'
  const emptyLabel = isLoad
    ? 'No load wallets yet. Create one in Wallet Management (include "Load" in the name).'
    : 'No cash wallets yet. Create one in Wallet Management (JazzCash, EasyPaisa, etc.).'

  if (isLoading) {
    return (
      <div className='flex h-40 items-center justify-center rounded-xl border bg-muted/20'>
        <p className='text-muted-foreground'>Loading wallets...</p>
      </div>
    )
  }

  if (wallets.length === 0) {
    return (
      <div className='flex h-40 flex-col items-center justify-center gap-2 rounded-xl border bg-muted/20'>
        <Wallet className='h-10 w-10 text-muted-foreground/40' />
        <p className='max-w-md text-center text-muted-foreground'>{emptyLabel}</p>
      </div>
    )
  }

  return (
    <div className='space-y-4'>
      <p className='text-sm text-muted-foreground'>
        {isLoad
          ? 'Choose a load wallet and action (purchase or sale)'
          : 'Choose a cash wallet and action (deposit or withdrawal)'}
      </p>
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
        {wallets.map((wallet) => (
          <Card
            key={resolveWalletId(wallet) || wallet.type}
            className={cn(
              'relative overflow-hidden transition-shadow hover:shadow-md',
              isLoad ? 'border-blue-200/80' : 'border-orange-200/80',
            )}
          >
            <div
              className={cn(
                'absolute top-0 left-0 right-0 h-1',
                isLoad ? 'bg-blue-500' : 'bg-orange-500',
              )}
            />
            <CardHeader className='pb-2'>
              <div className='flex items-start gap-2'>
                <div
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                    isLoad ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700',
                  )}
                >
                  <Wallet className='h-4 w-4' />
                </div>
                <div className='min-w-0 flex-1'>
                  <Badge variant='secondary' className='mb-1 text-xs'>
                    {isLoad ? 'Load Wallet' : 'Cash Wallet'}
                  </Badge>
                  <CardTitle className='text-base leading-tight break-words'>
                    {wallet.type}
                  </CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className='space-y-3'>
              <div>
                <p className='mb-0.5 text-xs text-muted-foreground'>Balance</p>
                <p className='text-2xl font-bold text-green-600'>
                  Rs {formatWalletBalance(wallet.balance)}
                </p>
              </div>
              <div className='flex flex-wrap gap-2 text-xs'>
                {isLoad && Number(wallet.commissionRate ?? 0) > 0 && (
                  <span className='rounded-md bg-blue-50 px-2 py-1 text-blue-700'>
                    Load sale {Number(wallet.commissionRate).toFixed(2)}%
                  </span>
                )}
                {!isLoad && Number(wallet.withdrawalCommissionRate ?? 0) > 0 && (
                  <span className='rounded-md bg-orange-50 px-2 py-1 text-orange-700'>
                    Withdrawal {Number(wallet.withdrawalCommissionRate).toFixed(2)}%
                  </span>
                )}
                {!isLoad && Number(wallet.depositCommissionRate ?? 0) > 0 && (
                  <span className='rounded-md bg-purple-50 px-2 py-1 text-purple-700'>
                    Deposit {Number(wallet.depositCommissionRate).toFixed(2)}%
                  </span>
                )}
              </div>
              <p className='text-xs text-muted-foreground'>
                Updated {formatWalletDate(wallet.updatedAt)}
              </p>
              <div className='grid grid-cols-2 gap-2 pt-1'>
                {isLoad ? (
                  <>
                    <Button
                      type='button'
                      className='bg-blue-600 hover:bg-blue-700'
                      onClick={() => onWalletAction(wallet, { tab: 'purchase' })}
                    >
                      <ArrowDownToLine className='mr-1.5 h-4 w-4 shrink-0' />
                      Purchase Load
                    </Button>
                    <Button
                      type='button'
                      variant='outline'
                      className='border-blue-300 text-blue-700 hover:bg-blue-50'
                      onClick={() => onWalletAction(wallet, { tab: 'sell' })}
                    >
                      <ArrowUpFromLine className='mr-1.5 h-4 w-4 shrink-0' />
                      Sale Load
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type='button'
                      className='bg-purple-600 hover:bg-purple-700'
                      onClick={() => onWalletAction(wallet, { action: 'deposit' })}
                    >
                      <ArrowDownLeft className='mr-1.5 h-4 w-4 shrink-0' />
                      Deposit
                    </Button>
                    <Button
                      type='button'
                      variant='outline'
                      className='border-orange-300 text-orange-700 hover:bg-orange-50'
                      onClick={() => onWalletAction(wallet, { action: 'withdrawal' })}
                    >
                      <ArrowUpRight className='mr-1.5 h-4 w-4 shrink-0' />
                      Withdrawal
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
