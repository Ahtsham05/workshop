import { forwardRef, useCallback, useImperativeHandle, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useGetLoadReportQuery } from '@/stores/reports.api'
import { useLanguage } from '@/context/language-context'
import { Wallet, TrendingUp, ShoppingCart, CircleDollarSign } from 'lucide-react'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { WalletBalanceStatement } from './wallet-balance-statement'
import { cn } from '@/lib/utils'
import { kpiCardClass, toneIconWrapClass } from '@/lib/stat-card-tones'
import { isLoadWalletName, normalizeWalletTypeParam } from '@/features/mobile-shop/utils/wallet-utils'

const normalizeWalletKey = (name: string) => normalizeWalletTypeParam(name).toLowerCase()

interface LoadReportProps {
  startDate: string
  endDate: string
}

export const LoadReport = forwardRef<{ exportToExcel: () => void }, LoadReportProps>(
  ({ startDate, endDate }, ref) => {
    const { t } = useLanguage()
    const { data, isLoading } = useGetLoadReportQuery({ startDate, endDate })
    const [selectedWallet, setSelectedWallet] = useState<string | null>(null)

    const loadWallets = useMemo(
      () => (data?.wallets ?? []).filter((w) => isLoadWalletName(w.type || '')),
      [data?.wallets],
    )
    const loadByWallet = useMemo(
      () => (data?.byWallet ?? []).filter((w) => isLoadWalletName(w._id || '')),
      [data?.byWallet],
    )
    const loadPurchases = useMemo(
      () => (data?.purchases ?? []).filter((p) => isLoadWalletName(p._id || '')),
      [data?.purchases],
    )
    const soldByWallet = useMemo(() => {
      const map = new Map<string, { totalSold: number; transactions: number; walletLabel: string }>()
      loadByWallet.forEach((row) => {
        const key = normalizeWalletKey(row._id || '')
        if (!key) return
        const existing = map.get(key)
        if (existing) {
          existing.totalSold += row.totalSold
          existing.transactions += row.transactions
        } else {
          map.set(key, {
            totalSold: row.totalSold,
            transactions: row.transactions,
            walletLabel: row._id,
          })
        }
      })
      return map
    }, [loadByWallet])

    const resolveWalletSold = useCallback(
      (walletType: string) => soldByWallet.get(normalizeWalletKey(walletType)),
      [soldByWallet],
    )
    const totalCurrentBalance = useMemo(
      () => loadWallets.reduce((sum, w) => sum + (w.balance || 0), 0),
      [loadWallets],
    )

    useImperativeHandle(ref, () => ({
      exportToExcel: () => {
        try {
          if (!data) { toast.error(t('No data available to export')); return }
          const wb = XLSX.utils.book_new()

          const summaryData = [
            { Metric: 'Total Transactions', Value: data.summary.totalTransactions },
            { Metric: 'Total Sold', Value: data.summary.totalSold },
            { Metric: 'Total Profit', Value: data.summary.totalProfit },
            { Metric: 'Total Extra Charges', Value: data.summary.totalExtraCharges },
            { Metric: 'Total Purchased', Value: data.summary.totalPurchased },
            { Metric: 'Net Balance', Value: data.summary.netBalance },
          ]
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'Summary')

          if (loadByWallet.length > 0) {
            const bwData = loadByWallet.map(r => ({ Wallet: r._id, Transactions: r.transactions, 'Total Sold': r.totalSold, Profit: r.totalProfit }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bwData), 'By Wallet')
          }
          if (data.datewise.length > 0) {
            const dwData = data.datewise.map(r => ({ Date: r._id, Transactions: r.transactions, 'Total Sold': r.totalSold, Profit: r.totalProfit }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dwData), 'Date-wise')
          }
          if (loadWallets.length > 0) {
            const wData = loadWallets.map(r => ({ Type: r.type, Balance: r.balance }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wData), 'Wallet Balances')
          }

          XLSX.writeFile(wb, `load-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
          toast.success(t('Data exported successfully'))
        } catch {
          toast.error(t('Failed to export data'))
        }
      },
    }))

    if (isLoading) return <Skeleton className='h-[400px] w-full' />

    const fmt = (v: number) => new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(v)
    const s = data?.summary
    const savingsMap = new Map<string, number>(loadPurchases.map(p => [p._id, p.totalPurchaseProfit ?? 0]))

    return (
      <div className='space-y-6'>
        {/* Summary cards */}
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          <Card className={kpiCardClass('slate')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Transactions</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('slate'))}>
                <Wallet className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{s?.totalTransactions ?? 0}</div>
              <p className='text-xs text-muted-foreground'>load transactions in period</p>
            </CardContent>
          </Card>
          <Card className={kpiCardClass('sky')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Sold</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('sky'))}>
                <CircleDollarSign className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-blue-600'>{fmt(s?.totalSold ?? 0)}</div>
              <p className='text-xs text-muted-foreground'>includes direct load + sim sale load</p>
              {!!(s?.simSaleLoadSold && s.simSaleLoadSold > 0) && (
                <p className='mt-1 text-xs text-orange-600'>
                  Sim Sale Load: {fmt(s.simSaleLoadSold)} ({s?.simSaleTransactions ?? 0} tx)
                </p>
              )}
            </CardContent>
          </Card>
          <Card className={kpiCardClass('emerald')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Profit</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('emerald'))}>
                <TrendingUp className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-green-600'>{fmt(s?.purchaseSavings ?? 0)}</div>
              <p className='text-xs text-muted-foreground'>supplier commission &amp; discounts</p>
            </CardContent>
          </Card>
          <Card className={kpiCardClass('cyan')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Purchase Savings</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('cyan'))}>
                <TrendingUp className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-emerald-600'>{fmt(s?.purchaseSavings ?? 0)}</div>
              <p className='text-xs text-muted-foreground'>supplier commission &amp; discounts</p>
            </CardContent>
          </Card>
          <Card className={kpiCardClass('orange')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Purchased</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('orange'))}>
                <ShoppingCart className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-orange-600'>{fmt(s?.totalPurchased ?? 0)}</div>
              <p className='text-xs text-muted-foreground'>load purchased from suppliers</p>
            </CardContent>
          </Card>
          <Card className={kpiCardClass('violet')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Net Inventory Balance</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('violet'))}>
                <Wallet className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${(s?.netBalance ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {fmt(s?.netBalance ?? 0)}
              </div>
              <p className='text-xs text-muted-foreground'>purchased minus sold</p>
            </CardContent>
          </Card>
          <Card className={kpiCardClass('amber')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Extra Charges</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('amber'))}>
                <CircleDollarSign className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{fmt(s?.totalExtraCharges ?? 0)}</div>
              <p className='text-xs text-muted-foreground'>additional charges collected</p>
            </CardContent>
          </Card>
        </div>

        {/* Wallet overview — balance + sold per wallet */}
        {loadWallets.length > 0 && (
          <Card>
            <CardHeader>
              <div className='flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between'>
                <div>
                  <CardTitle>Wallet Overview</CardTitle>
                  <CardDescription>
                    Current balance and total sold in the selected period
                  </CardDescription>
                </div>
                <div className='flex flex-wrap gap-4 text-sm'>
                  <div>
                    <p className='text-xs text-muted-foreground'>Total Current Balance</p>
                    <p className='text-lg font-bold text-blue-600'>{fmt(totalCurrentBalance)}</p>
                  </div>
                  <div>
                    <p className='text-xs text-muted-foreground'>Total Sold (Period)</p>
                    <p className='text-lg font-bold text-emerald-600'>{fmt(s?.totalSold ?? 0)}</p>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
                {loadWallets.map((w) => {
                  const sold = resolveWalletSold(w.type || '')
                  return (
                    <div
                      key={w._id}
                      className='rounded-lg border p-4 cursor-pointer hover:border-primary hover:bg-muted/30 transition-colors'
                      onClick={() => setSelectedWallet(w.type)}
                      title={`View ${w.type} load report`}
                    >
                      <p className='text-sm font-medium capitalize mb-3'>{w.type}</p>
                      <div className='space-y-3'>
                        <div>
                          <p className='text-xs text-muted-foreground'>Current Balance</p>
                          <p className='text-xl font-bold text-blue-600'>{fmt(w.balance)}</p>
                        </div>
                        <div className='border-t pt-3'>
                          <p className='text-xs text-muted-foreground'>Sold (Period)</p>
                          <p className='text-lg font-semibold text-emerald-600'>
                            {fmt(sold?.totalSold ?? 0)}
                          </p>
                          <p className='text-xs text-muted-foreground mt-1'>
                            {sold?.transactions ?? 0} transaction{(sold?.transactions ?? 0) === 1 ? '' : 's'}
                          </p>
                        </div>
                      </div>
                      <p className='text-xs text-primary mt-3 opacity-70'>Click to view details →</p>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* By Wallet type — load wallets only */}
        {loadByWallet.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Sales by Wallet / Network</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Wallet / Network</TableHead>
                    <TableHead className='text-right'>Transactions</TableHead>
                    <TableHead className='text-right'>Total Sold</TableHead>
                    <TableHead className='text-right'>Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadByWallet.map(row => (
                    <TableRow
                      key={row._id}
                      className='cursor-pointer hover:bg-muted/50'
                      onClick={() => setSelectedWallet(row._id)}
                    >
                      <TableCell className='font-medium capitalize'>{row._id}</TableCell>
                      <TableCell className='text-right'><Badge variant='secondary'>{row.transactions}</Badge></TableCell>
                      <TableCell className='text-right text-blue-600 font-medium'>{fmt(row.totalSold)}</TableCell>
                      <TableCell className='text-right text-green-600 font-medium'>{fmt(row.totalProfit + (savingsMap.get(row._id) ?? 0))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Stock purchased by wallet — load wallets only */}
        {loadPurchases.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Load Purchased — by Wallet</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Wallet / Network</TableHead>
                    <TableHead className='text-right'>Purchases</TableHead>
                    <TableHead className='text-right'>Total Purchased</TableHead>
                    <TableHead className='text-right text-emerald-600'>Savings</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadPurchases.map(row => (
                    <TableRow key={row._id}>
                      <TableCell className='font-medium capitalize'>{row._id}</TableCell>
                      <TableCell className='text-right'><Badge variant='secondary'>{row.count}</Badge></TableCell>
                      <TableCell className='text-right text-orange-600 font-medium'>{fmt(row.totalPurchased)}</TableCell>
                      <TableCell className='text-right text-emerald-600 font-medium'>{fmt(row.totalPurchaseProfit ?? 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Date-wise */}
        {(data?.datewise?.length ?? 0) > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Date-wise Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className='text-right'>Transactions</TableHead>
                    <TableHead className='text-right'>Total Sold</TableHead>
                    <TableHead className='text-right'>Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data!.datewise.map(row => (
                    <TableRow key={row._id}>
                      <TableCell>{row._id}</TableCell>
                      <TableCell className='text-right'><Badge variant='secondary'>{row.transactions}</Badge></TableCell>
                      <TableCell className='text-right text-blue-600 font-medium'>{fmt(row.totalSold)}</TableCell>
                      <TableCell className='text-right text-green-600 font-medium'>{fmt(row.totalProfit)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {!loadByWallet.length && !(data?.datewise?.length) && (
          <Card>
            <CardContent className='py-12 text-center text-muted-foreground'>
              No load transactions found for the selected date range.
            </CardContent>
          </Card>
        )}

        {/* Wallet Balance Statement Dialog */}
        <WalletBalanceStatement
          walletType={selectedWallet}
          startDate={startDate}
          endDate={endDate}
          onClose={() => setSelectedWallet(null)}
          loadOnly
        />
      </div>
    )
  }
)

LoadReport.displayName = 'LoadReport'
