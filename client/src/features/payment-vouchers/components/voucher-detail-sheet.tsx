import { Loader2, Pencil, Printer, Trash2, History, FileText, ListChecks } from 'lucide-react'
import { useGetAuditLogsQuery } from '@/stores/auditLog.api'
import { usePermissions } from '@/context/permission-context'
import { useFormatMoney } from '@/lib/format-money'
import { formatBusinessDate, formatBusinessDateTimeShort } from '@/lib/business-timezone'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { VoucherSheetData } from '../utils/voucher-sheet-data'

export type VoucherKind = 'payment' | 'receipt'

/** The only things that differ between the two kinds of voucher on this screen. */
const KIND_META = {
  payment: {
    title: 'Payment Voucher',
    accountLabel: 'Paid From',
    partyLabel: 'Paid To',
    totalLabel: 'Total Paid',
    badgeClass: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
    amountClass: 'text-red-600 dark:text-red-400',
    auditModule: 'PaymentVoucher',
  },
  receipt: {
    title: 'Receipt Voucher',
    accountLabel: 'Received Into',
    partyLabel: 'Received From',
    totalLabel: 'Total Received',
    badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    amountClass: 'text-emerald-600 dark:text-emerald-400',
    auditModule: 'ReceiptVoucher',
  },
} as const

/** Label + value, the sheet's smallest building block. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='space-y-0.5'>
      <p className='text-[11px] uppercase tracking-wide text-muted-foreground'>{label}</p>
      <div className='text-sm font-medium'>{children}</div>
    </div>
  )
}

/** An empty optional field reads as "nobody filled this in", not as a broken value. */
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

const CHANGE_LABELS: Record<string, string> = {
  date: 'Date',
  bankAccountName: 'Bank account',
  totalAmount: 'Total',
  reference: 'Reference',
  notes: 'Notes',
  lines: 'Lines',
}

/** The order changes read in, whatever order they were recorded in. */
const CHANGE_ORDER = ['date', 'bankAccountName', 'totalAmount', 'lines', 'reference', 'notes']

/** Short one-line values sit two to a row; the rest (lines, notes) get the full width. */
const COMPACT_FIELDS = new Set(['date', 'bankAccountName', 'totalAmount', 'reference'])

/** Internal identifiers mean nothing to a person reading a history. Older "Created" entries
 *  recorded the raw bank-account id, so it has to be filtered out of what is already stored. */
const HIDDEN_CHANGE_FIELDS = new Set(['bankAccountId', 'id', '_id'])

const ACTION_META: Record<string, { label: string; dotClass: string }> = {
  create: { label: 'Created', dotClass: 'bg-emerald-500' },
  update: { label: 'Edited', dotClass: 'bg-amber-500' },
  delete: { label: 'Deleted', dotClass: 'bg-red-500' },
}

interface LineItem {
  name: string
  amount?: number
  description?: string
}

/** "Rent: 1000 (September)" — how edits and new creations record a line. */
const LINE_TEXT = /^(.*): (-?\d+(?:\.\d+)?)(?: \((.*)\))?$/

/** Lines have been logged two ways: as that one-string-per-line text, and (older "Created" entries)
 *  as the raw stored line objects. Both become the same displayable rows. */
function toLineItems(value: unknown): LineItem[] {
  if (Array.isArray(value)) {
    return value.map((item): LineItem => {
      if (item && typeof item === 'object') {
        const line = item as Record<string, unknown>
        const name = line.payeeName ?? line.payerName ?? line.supplierName ?? line.customerName ?? line.category
        const amount = Number(line.amount)
        return {
          name: name ? String(name) : 'Line',
          amount: Number.isFinite(amount) ? amount : undefined,
          description: line.description ? String(line.description) : undefined,
        }
      }
      return { name: String(item) }
    })
  }
  if (typeof value === 'string' && value.trim()) {
    return value.split('; ').map((text): LineItem => {
      const match = text.match(LINE_TEXT)
      return match ? { name: match[1], amount: Number(match[2]), description: match[3] } : { name: text }
    })
  }
  return []
}

function LineList({ items }: { items: LineItem[] }) {
  const formatMoney = useFormatMoney()
  return (
    <ul className='space-y-1'>
      {items.map((item, index) => (
        <li key={index} className='flex items-baseline justify-between gap-3'>
          <span className='min-w-0'>
            <span className='font-medium'>{item.name}</span>
            {item.description && <span className='text-muted-foreground'> · {item.description}</span>}
          </span>
          {item.amount !== undefined && <span className='shrink-0 tabular-nums'>{formatMoney(item.amount)}</span>}
        </li>
      ))}
    </ul>
  )
}

const isEmptyValue = (value: unknown) =>
  value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)

/** What the audit trail recorded, made readable: dates in business time, the total as money and
 *  lines as rows. Anything unrecognised is shown as text, never as "[object Object]". */
function ChangeValue({ field, value }: { field: string; value: unknown }) {
  const formatMoney = useFormatMoney()
  if (isEmptyValue(value)) return <span className='text-muted-foreground/70'>—</span>
  if (field === 'date') return <>{formatBusinessDate(String(value))}</>
  if (field === 'totalAmount') return <>{formatMoney(Number(value))}</>
  if (field === 'lines') {
    const items = toLineItems(value)
    return items.length ? <LineList items={items} /> : <span className='text-muted-foreground/70'>—</span>
  }
  if (typeof value === 'object') return <>{JSON.stringify(value)}</>
  return <>{String(value)}</>
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className='text-[11px] uppercase tracking-wide text-muted-foreground'>{children}</p>
}

/** A creation has no "before", so it reads as a summary of what was recorded. */
function CreatedSummary({ changes }: { changes: { field: string; newValue: unknown }[] }) {
  const filled = changes.filter((change) => !isEmptyValue(change.newValue))
  const compact = filled.filter((change) => COMPACT_FIELDS.has(change.field))
  const wide = filled.filter((change) => !COMPACT_FIELDS.has(change.field))
  if (filled.length === 0) return null

  return (
    <div className='mt-2 space-y-3 rounded-md border bg-muted/30 p-3 text-sm'>
      {compact.length > 0 && (
        <div className='grid grid-cols-2 gap-3'>
          {compact.map((change) => (
            <div key={change.field}>
              <FieldLabel>{CHANGE_LABELS[change.field] ?? change.field}</FieldLabel>
              <div className='mt-0.5 font-medium'>
                <ChangeValue field={change.field} value={change.newValue} />
              </div>
            </div>
          ))}
        </div>
      )}
      {wide.map((change) => (
        <div key={change.field}>
          <FieldLabel>{CHANGE_LABELS[change.field] ?? change.field}</FieldLabel>
          <div className='mt-1'>
            <ChangeValue field={change.field} value={change.newValue} />
          </div>
        </div>
      ))}
    </div>
  )
}

/** An edit shows each changed field as before → after. */
function EditedChanges({ changes }: { changes: { field: string; oldValue: unknown; newValue: unknown }[] }) {
  return (
    <div className='mt-2 space-y-2'>
      {changes.map((change) => (
        <div key={change.field} className='rounded-md border bg-muted/30 p-3 text-sm'>
          <p className='mb-2 font-medium'>{CHANGE_LABELS[change.field] ?? change.field}</p>
          <div className='space-y-2'>
            <div>
              <FieldLabel>Before</FieldLabel>
              <div className='mt-0.5 text-muted-foreground line-through decoration-muted-foreground/40'>
                <ChangeValue field={change.field} value={change.oldValue} />
              </div>
            </div>
            <div>
              <FieldLabel>After</FieldLabel>
              <div className='mt-0.5'>
                <ChangeValue field={change.field} value={change.newValue} />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/** The edit history. Mounted only while its tab is open, so it always fetches fresh. */
function VoucherActivity({ kind, voucherId }: { kind: VoucherKind; voucherId: string }) {
  const { hasPermission } = usePermissions()
  const canSeeAudit = hasPermission('viewAuditLogs')
  const { data, isLoading } = useGetAuditLogsQuery(
    { module: KIND_META[kind].auditModule, entityId: voucherId, limit: 30, sortBy: 'createdAt:desc' },
    { skip: !canSeeAudit, refetchOnMountOrArgChange: true }
  )

  if (!canSeeAudit) {
    return <p className='text-sm text-muted-foreground'>You do not have permission to view the audit trail.</p>
  }
  if (isLoading) {
    return (
      <div className='flex h-24 items-center justify-center'>
        <Loader2 className='h-5 w-5 animate-spin text-muted-foreground' />
      </div>
    )
  }
  if (!data?.results?.length) {
    return <p className='text-sm text-muted-foreground'>No recorded activity for this voucher.</p>
  }

  return (
    <ol className='relative space-y-6 border-l pl-5'>
      {data.results.map((log) => {
        const meta = ACTION_META[log.action] ?? { label: log.action, dotClass: 'bg-primary' }
        const changes = (log.changes ?? [])
          .filter((change) => !HIDDEN_CHANGE_FIELDS.has(change.field))
          .sort((a, b) => {
            const rank = (field: string) => (CHANGE_ORDER.includes(field) ? CHANGE_ORDER.indexOf(field) : CHANGE_ORDER.length)
            return rank(a.field) - rank(b.field)
          })

        return (
          <li key={log.id} className='relative'>
            <span className={cn('absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-background', meta.dotClass)} />
            <p className='text-sm font-medium'>
              {meta.label}
              <span className='ml-2 text-xs font-normal text-muted-foreground'>{formatBusinessDateTimeShort(log.createdAt)}</span>
            </p>
            <p className='text-xs text-muted-foreground'>
              by {log.userName || (typeof log.userId === 'object' ? log.userId?.name : '') || 'System'}
            </p>
            {log.action === 'create' && <CreatedSummary changes={changes} />}
            {log.action === 'update' && changes.length > 0 && <EditedChanges changes={changes} />}
          </li>
        )
      })}
    </ol>
  )
}

interface VoucherDetailSheetProps {
  kind: VoucherKind
  /** The voucher to show. The list's row is enough to open instantly; the caller swaps in the
   *  fuller single-voucher record (with creator/editor names) once it arrives. */
  voucher: VoucherSheetData | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** True while the fuller record is still being fetched. */
  isRefreshing?: boolean
  onPrint?: () => void
  onEdit?: () => void
  onDelete?: () => void
}

export function VoucherDetailSheet({
  kind,
  voucher,
  open,
  onOpenChange,
  isRefreshing,
  onPrint,
  onEdit,
  onDelete,
}: VoucherDetailSheetProps) {
  const formatMoney = useFormatMoney()
  const meta = KIND_META[kind]

  if (!voucher) {
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
        {/* pr-12 keeps the action buttons clear of SheetContent's own close button, which is
            absolutely positioned at top-4 right-4 and would otherwise sit on top of them. */}
        <SheetHeader className='space-y-3 border-b px-6 py-4 pr-12'>
          <div className='flex flex-wrap items-start justify-between gap-3'>
            <div className='min-w-0'>
              <SheetTitle className='flex flex-wrap items-center gap-x-2 gap-y-1 text-xl'>
                {voucher.voucherNumber}
                {isRefreshing && <Loader2 className='h-4 w-4 animate-spin text-muted-foreground' />}
              </SheetTitle>
              <SheetDescription className='flex flex-wrap items-center gap-2 pt-1'>
                <Badge variant='outline' className={meta.badgeClass}>
                  {meta.title}
                </Badge>
                <span className='text-xs'>{formatBusinessDate(voucher.date)}</span>
                {voucher.isEdited && (
                  <Badge variant='outline' className='border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'>
                    Edited
                  </Badge>
                )}
              </SheetDescription>
            </div>

            <div className='flex flex-wrap items-center gap-2'>
              {onPrint && (
                <Button size='sm' variant='outline' onClick={onPrint}>
                  <Printer className='mr-2 h-4 w-4' />
                  Print
                </Button>
              )}
              {onEdit && (
                <Button size='sm' variant='outline' onClick={onEdit}>
                  <Pencil className='mr-2 h-4 w-4' />
                  Edit
                </Button>
              )}
              {onDelete && (
                <Button size='sm' variant='outline' className='text-destructive hover:text-destructive' onClick={onDelete}>
                  <Trash2 className='mr-2 h-4 w-4' />
                  Delete
                </Button>
              )}
            </div>
          </div>

          {/* The figures that matter, at a glance */}
          <div className='grid grid-cols-3 gap-2'>
            <div className='rounded-lg border bg-muted/40 p-3'>
              <p className='text-[11px] uppercase tracking-wide text-muted-foreground'>{meta.totalLabel}</p>
              <p className={cn('text-lg font-semibold tabular-nums', meta.amountClass)}>{formatMoney(voucher.totalAmount)}</p>
            </div>
            <div className='min-w-0 rounded-lg border bg-muted/40 p-3'>
              <p className='text-[11px] uppercase tracking-wide text-muted-foreground'>{meta.accountLabel}</p>
              <p className='truncate text-lg font-semibold'>{voucher.bankAccountName || '-'}</p>
            </div>
            <div className='rounded-lg border bg-muted/40 p-3'>
              <p className='text-[11px] uppercase tracking-wide text-muted-foreground'>Lines</p>
              <p className='text-lg font-semibold tabular-nums'>{voucher.lines.length}</p>
            </div>
          </div>
        </SheetHeader>

        <Tabs defaultValue='overview' className='flex min-h-0 flex-1 flex-col'>
          <TabsList className='mx-6 mt-3 grid w-auto grid-cols-2'>
            <TabsTrigger value='overview'>Overview</TabsTrigger>
            <TabsTrigger value='activity'>Activity</TabsTrigger>
          </TabsList>

          {/* Radix wraps the content in a `display: table` div, which would let the lines table's
              minimum width stretch every section past the sheet on a phone — keep it a block. */}
          <ScrollArea className='min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]>div]:block!'>
            <TabsContent value='overview' className='m-0 space-y-6 p-6'>
              <section className='space-y-3'>
                <SectionTitle icon={FileText}>Voucher Details</SectionTitle>
                <div className='grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-3'>
                  <Field label='Voucher Number'>{voucher.voucherNumber}</Field>
                  <Field label='Date'>{formatBusinessDate(voucher.date)}</Field>
                  <Field label={meta.accountLabel}>{voucher.bankAccountName || <NotSet label='Unknown' />}</Field>
                  <Field label='Reference'>{voucher.reference || <NotSet label='Not set' />}</Field>
                  <Field label='Created By'>{voucher.createdByName || <NotSet label={isRefreshing ? 'Loading…' : 'Unknown'} />}</Field>
                  <Field label='Created On'>{formatBusinessDateTimeShort(voucher.createdAt)}</Field>
                  <Field label='Last Edited'>
                    {voucher.isEdited && voucher.updatedAt ? (
                      <span className='flex flex-col'>
                        <span>{formatBusinessDateTimeShort(voucher.updatedAt)}</span>
                        {voucher.updatedByName && (
                          <span className='text-xs font-normal text-muted-foreground'>by {voucher.updatedByName}</span>
                        )}
                      </span>
                    ) : (
                      <NotSet label='Never edited' />
                    )}
                  </Field>
                </div>
                {voucher.notes && (
                  <div className='rounded-lg border bg-muted/30 p-3 text-sm'>
                    <p className='mb-1 text-[11px] uppercase tracking-wide text-muted-foreground'>Notes</p>
                    <p className='whitespace-pre-wrap'>{voucher.notes}</p>
                  </div>
                )}
              </section>

              <section className='space-y-3'>
                <SectionTitle icon={ListChecks}>Voucher Lines</SectionTitle>
                <div className='overflow-x-auto rounded-lg border'>
                  <Table className='min-w-[480px]'>
                    <TableHeader>
                      <TableRow>
                        <TableHead className='w-10'>#</TableHead>
                        <TableHead>{meta.partyLabel}</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className='text-right'>Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {voucher.lines.map((line, index) => (
                        <TableRow key={line.id}>
                          <TableCell className='text-muted-foreground'>{index + 1}</TableCell>
                          <TableCell>
                            <div className='font-medium'>{line.partyName}</div>
                            <Badge variant='secondary' className={cn('mt-1', line.typeClassName)}>
                              {line.typeLabel}
                            </Badge>
                          </TableCell>
                          <TableCell className='max-w-[200px] whitespace-normal text-muted-foreground'>
                            {line.description || '—'}
                          </TableCell>
                          <TableCell className='text-right font-medium tabular-nums'>{formatMoney(line.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={3} className='font-medium'>
                          {meta.totalLabel}
                        </TableCell>
                        <TableCell className={cn('text-right text-base font-semibold tabular-nums', meta.amountClass)}>
                          {formatMoney(voucher.totalAmount)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </section>
            </TabsContent>

            <TabsContent value='activity' className='m-0 space-y-4 p-6'>
              <SectionTitle icon={History}>Edit History</SectionTitle>
              <VoucherActivity kind={kind} voucherId={voucher.id} />
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
