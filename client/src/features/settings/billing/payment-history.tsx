import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { METHOD_LABELS, useGetMyManualPaymentsQuery, type ManualPayment } from '@/stores/billing.api'
import { formatDate, formatPkr } from './format'

const STATUS_TONE: Record<ManualPayment['status'], string> = {
  pending: 'bg-amber-600 text-white',
  approved: 'bg-emerald-600 text-white',
  rejected: 'bg-red-600 text-white',
}

export function PaymentHistory() {
  const { data, isLoading } = useGetMyManualPaymentsQuery()
  const rows = data?.results ?? []
  if (isLoading || rows.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-base'>Manual payments</CardTitle>
        <CardDescription>Bank and mobile-wallet payments you've submitted, and their review status.</CardDescription>
      </CardHeader>
      <CardContent className='overflow-x-auto'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Submitted</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className='text-right'>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Receipt / note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className='whitespace-nowrap'>{formatDate(p.createdAt)}</TableCell>
                <TableCell className='font-mono text-xs whitespace-nowrap'>{p.reference}</TableCell>
                <TableCell className='whitespace-nowrap capitalize'>
                  {p.planKey} · {p.months} mo
                </TableCell>
                <TableCell className='text-right whitespace-nowrap tabular-nums'>
                  {formatPkr(p.paidAmountPkr)}
                  <div className='text-muted-foreground text-xs'>{METHOD_LABELS[p.method]}</div>
                </TableCell>
                <TableCell>
                  <Badge className={STATUS_TONE[p.status]}>{p.status}</Badge>
                </TableCell>
                <TableCell className='min-w-[12rem] text-xs'>
                  {p.status === 'approved' && <span className='font-mono'>{p.receiptNumber}</span>}
                  {p.status === 'rejected' && <span className='text-destructive'>{p.rejectionReason}</span>}
                  {p.status === 'pending' && <span className='text-muted-foreground'>Waiting for review</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
