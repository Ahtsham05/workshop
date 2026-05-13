import { Link } from '@tanstack/react-router'
import { format, isValid } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { useGetCashWithdrawalsQuery, useGetLoadTransactionsQuery } from '@/stores/mobile-shop.api'
import { useLanguage } from '@/context/language-context'
import { ArrowRight } from 'lucide-react'

const fmtMoney = (n: number) =>
  `Rs ${Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

const fmtRowDate = (d?: string) => {
  if (!d) return '—'
  const parsed = new Date(d)
  return isValid(parsed) ? format(parsed, 'MMM dd, yyyy') : '—'
}

export function AccountsMobileShopLists() {
  const { t } = useLanguage()
  const listLimit = 10

  const { data: loadData, isLoading: loadLoading } = useGetLoadTransactionsQuery({
    page: 1,
    limit: listLimit,
  })
  const { data: cashData, isLoading: cashLoading } = useGetCashWithdrawalsQuery({
    page: 1,
    limit: listLimit,
  })

  const loadRows = loadData?.results ?? []
  const cashRows = cashData?.results ?? []

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg">{t('recent_load_sales')}</CardTitle>
          <Button variant="ghost" size="sm" className="gap-1" asChild>
            <Link to="/mobile-shop/load">
              {t('open')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {loadLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{t('loading')}</p>
          ) : loadRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{t('no_load_sales_yet')}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('date')}</TableHead>
                    <TableHead>{t('wallet')}</TableHead>
                    <TableHead>{t('customer')}</TableHead>
                    <TableHead className="text-right">{t('amount')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap">{fmtRowDate(row.date)}</TableCell>
                      <TableCell>{row.walletType}</TableCell>
                      <TableCell>
                        {row.customerName?.trim() ||
                          (row as { customerId?: { name?: string } }).customerId?.name ||
                          t('walk_in_customer')}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{fmtMoney(row.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg">{t('recent_cash_management')}</CardTitle>
          <Button variant="ghost" size="sm" className="gap-1" asChild>
            <Link to="/mobile-shop/cash-management">
              {t('open')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {cashLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{t('loading')}</p>
          ) : cashRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{t('no_cash_transactions_yet')}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('date')}</TableHead>
                    <TableHead>{t('type')}</TableHead>
                    <TableHead>{t('wallet')}</TableHead>
                    <TableHead className="text-right">{t('amount')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cashRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap">{fmtRowDate(row.date)}</TableCell>
                      <TableCell className="capitalize">{row.transactionType}</TableCell>
                      <TableCell>{row.walletType}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{fmtMoney(row.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
