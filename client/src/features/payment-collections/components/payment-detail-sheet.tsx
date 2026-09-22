import { Loader2, Ban, FileText, ListChecks, History } from 'lucide-react'
import { useFormatMoney } from '@/lib/format-money'
import { formatBusinessDate, formatBusinessDateTimeShort } from '@/lib/business-timezone'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  DIRECTION_BADGE_CLASS,
  DIRECTION_LABELS,
  METHOD_LABELS,
  STATUS_BADGE_CLASS,
  STATUS_LABELS,
  type PaymentSheetData,
} from '../utils/payment-sheet-data'

export type PaymentKind = 'customer' | 'supplier'

const KIND_META = {
  customer: {
    title: 'Customer Payment',
    partyLabel: 'Customer',
    invoiceLabel: 'Invoice',
    amountClass: 'text-emerald-600 dark:text-emerald-400',
  },
  supplier: {
    title: 'Supplier Payment',
    partyLabel: 'Supplier',
    invoiceLabel: 'Purchase Bill',
    amountClass: 'text-red-600 dark:text-red-400',
  },
} as const

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='space-y-0.5'>
      <p className='text-[11px] uppercase tracking-wide text-muted-foreground'>{label}</p>
      <div className='text-sm font-medium'>{children}</div>
    </div>
  )
}

function NotSet({ label }: { label: string }) {
  return <span className='text-sm font-normal text-muted-foreground/70'>{label}</span>
}

function SectionTitle({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <h3 className='flex items-center gap-2 text-sm font-semibold'>
      <Icon className='h-4 w-4 text-muted-foreground' />
      {children}
    </h3>
  )
}

const HISTORY_ACTION_LABELS: Record<string, string> = {
  created: 'Created',
  allocated: 'Allocated',
  reallocated: 'Re-allocated',
  credit_applied: 'Credit applied',
  voided: 'Voided',
  refunded: 'Refunded',
}
const HISTORY_ACTION_DOT: Record<string, string> = {
  created: 'bg-emerald-500',
  allocated: 'bg-sky-500',
  reallocated: 'bg-sky-500',
  credit_applied: 'bg-violet-500',
  voided: 'bg-red-500',
  refunded: 'bg-orange-500',
}

interface Props {
  kind: PaymentKind
  payment: PaymentSheetData | null
  open: boolean
  onOpenChange: (open: boolean) => void
  isRefreshing?: boolean
  onVoid?: () => void
}

export function PaymentDetailSheet({ kind, payment, open, onOpenChange, isRefreshing, onVoid }: Props) {
  const formatMoney = useFormatMoney()
  const meta = KIND_META[kind]

  if (!payment) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side='right' className='w-full sm:max-w-2xl'>
          <SheetHeader>
            <SheetTitle>{meta.title}</SheetTitle>
            <SheetDescription>Loading...</SheetDescription>
          </SheetHeader>
          <div className='flex h-40 items-center justify-center'>
            <Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side='right' className='flex w-full flex-col gap-0 p-0 sm:max-w-2xl'>
        <SheetHeader className='space-y-3 border-b px-6 py-4 pr-12'>
          <div className='flex flex-wrap items-start justify-between gap-3'>
            <div className='min-w-0'>
              <SheetTitle className='flex flex-wrap items-center gap-x-2 gap-y-1 text-xl'>
                {payment.paymentNumber}
                {isRefreshing && <Loader2 className='h-4 w-4 animate-spin text-muted-foreground' />}
              </SheetTitle>
              <SheetDescription className='flex flex-wrap items-center gap-2 pt-1'>
                <Badge variant='secondary' className={DIRECTION_BADGE_CLASS[payment.direction]}>
                  {DIRECTION_LABELS[payment.direction]}
                </Badge>
                <Badge variant='secondary' className={STATUS_BADGE_CLASS[payment.status]}>
                  {STATUS_LABELS[payment.status]}
                </Badge>
                <span className='text-xs'>{formatBusinessDate(payment.date)}</span>
              </SheetDescription>
            </div>

            {onVoid && payment.status === 'posted' && (
              <Button size='sm' variant='outline' className='text-destructive hover:text-destructive' onClick={onVoid}>
                <Ban className='mr-2 h-4 w-4' />
                Void
              </Button>
            )}
          </div>

          <div className='grid grid-cols-3 gap-2'>
            <div className='rounded-lg border bg-muted/40 p-3'>
              <p className='text-[11px] uppercase tracking-wide text-muted-foreground'>Amount</p>
              <p className={cn('text-lg font-semibold tabular-nums', meta.amountClass)}>{formatMoney(payment.amount)}</p>
            </div>
            <div className='min-w-0 rounded-lg border bg-muted/40 p-3'>
              <p className='text-[11px] uppercase tracking-wide text-muted-foreground'>{meta.partyLabel}</p>
              <p className='truncate text-lg font-semibold'>{payment.partyName}</p>
            </div>
            <div className='rounded-lg border bg-muted/40 p-3'>
              <p className='text-[11px] uppercase tracking-wide text-muted-foreground'>Invoices Touched</p>
              <p className='text-lg font-semibold tabular-nums'>{payment.allocations.length}</p>
            </div>
          </div>
        </SheetHeader>

        <Tabs defaultValue='overview' className='flex min-h-0 flex-1 flex-col'>
          <TabsList className='mx-6 mt-3 grid w-auto grid-cols-2'>
            <TabsTrigger value='overview'>Overview</TabsTrigger>
            <TabsTrigger value='activity'>Activity</TabsTrigger>
          </TabsList>

          <ScrollArea className='min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]>div]:block!'>
            <TabsContent value='overview' className='m-0 space-y-6 p-6'>
              <section className='space-y-3'>
                <SectionTitle icon={FileText}>Payment Details</SectionTitle>
                <div className='grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-3'>
                  <Field label='Payment Number'>{payment.paymentNumber}</Field>
                  <Field label='Date'>{formatBusinessDate(payment.date)}</Field>
                  <Field label='Method'>
                    {METHOD_LABELS[payment.paymentMethod]}
                    {payment.walletType ? ` · ${payment.walletType}` : ''}
                  </Field>
                  <Field label='Reference'>{payment.referenceNumber || <NotSet label='Not set' />}</Field>
                  <Field label='Allocated'>{formatMoney(payment.allocatedTotal)}</Field>
                  <Field label='Unapplied'>{formatMoney(payment.unappliedAmount)}</Field>
                  <Field label='Created By'>{payment.createdByName || <NotSet label={isRefreshing ? 'Loading…' : 'Unknown'} />}</Field>
                  <Field label='Created On'>{formatBusinessDateTimeShort(payment.createdAt)}</Field>
                  {payment.status === 'void' && (
                    <Field label='Void Reason'>{payment.voidReason || <NotSet label='No reason given' />}</Field>
                  )}
                </div>
                {payment.notes && (
                  <div className='rounded-lg border bg-muted/30 p-3 text-sm'>
                    <p className='mb-1 text-[11px] uppercase tracking-wide text-muted-foreground'>Notes</p>
                    <p className='whitespace-pre-wrap'>{payment.notes}</p>
                  </div>
                )}
              </section>

              <section className='space-y-3'>
                <SectionTitle icon={ListChecks}>{meta.invoiceLabel} Allocations</SectionTitle>
                {payment.allocations.length === 0 ? (
                  <p className='rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground'>
                    Not applied to any {meta.invoiceLabel.toLowerCase()} yet.
                  </p>
                ) : (
                  <div className='overflow-x-auto rounded-lg border'>
                    <Table className='min-w-[480px]'>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{meta.invoiceLabel} #</TableHead>
                          <TableHead className='text-right'>{meta.invoiceLabel} Total</TableHead>
                          <TableHead className='text-right'>Owed Before</TableHead>
                          <TableHead className='text-right'>Applied</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payment.allocations.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell className='font-medium'>{a.invoiceNumber}</TableCell>
                            <TableCell className='text-right tabular-nums'>{formatMoney(a.invoiceTotal)}</TableCell>
                            <TableCell className='text-right tabular-nums'>{formatMoney(a.outstandingBefore)}</TableCell>
                            <TableCell className='text-right font-medium tabular-nums'>{formatMoney(a.amount)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter>
                        <TableRow>
                          <TableCell colSpan={3} className='font-medium'>
                            Total Applied
                          </TableCell>
                          <TableCell className={cn('text-right text-base font-semibold tabular-nums', meta.amountClass)}>
                            {formatMoney(payment.allocatedTotal)}
                          </TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </div>
                )}
              </section>
            </TabsContent>

            <TabsContent value='activity' className='m-0 space-y-4 p-6'>
              <SectionTitle icon={History}>History</SectionTitle>
              {payment.history.length === 0 ? (
                <p className='text-sm text-muted-foreground'>No recorded activity for this payment.</p>
              ) : (
                <ol className='relative space-y-6 border-l pl-5'>
                  {payment.history.map((entry) => (
                    <li key={entry.id} className='relative'>
                      <span
                        className={cn(
                          'absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-background',
                          HISTORY_ACTION_DOT[entry.action] ?? 'bg-primary'
                        )}
                      />
                      <p className='text-sm font-medium'>
                        {HISTORY_ACTION_LABELS[entry.action] ?? entry.action}
                        <span className='ml-2 text-xs font-normal text-muted-foreground'>{formatBusinessDateTimeShort(entry.at)}</span>
                      </p>
                      {entry.byName && <p className='text-xs text-muted-foreground'>by {entry.byName}</p>}
                      {entry.details && <p className='mt-1 text-sm text-muted-foreground'>{entry.details}</p>}
                      {entry.amount != null && <p className='mt-1 text-sm font-medium tabular-nums'>{formatMoney(entry.amount)}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
