import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { toast } from 'sonner'
import { ArrowRight, Check, CircleSlash, Loader2, PackageCheck, Printer, Repeat, Send, Undo2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { DatePicker } from '@/components/ui/date-picker'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { SerialPickDialog } from '@/components/serial-pick-dialog'
import { Can } from '@/context/permission-context'
import { useLanguage } from '@/context/language-context'
import { getBusinessToday } from '@/lib/business-timezone'
import { formatAppDate, formatAppDateTime } from '@/lib/date-format'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import type { AppDispatch, RootState } from '@/stores/store'
import { fetchAllSuppliers } from '@/stores/supplier.slice'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { useClaimActionMutation, useGetWarrantyClaimQuery, type WarrantyClaim, type WarrantyResolution } from '@/stores/warrantyClaim.api'
import { COVER_META, RESOLUTION_META, STATUS_META, STEPS } from '../lib/claim-meta'
import { printClaimReceipt } from '../lib/print-claim'

const MANAGE = ['manageWarrantyClaims', 'manageImeiTracking', 'editProducts'] as const

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='min-w-0 space-y-0.5'>
      <p className='text-[11px] uppercase tracking-wide text-muted-foreground'>{label}</p>
      <div className='truncate text-sm font-medium'>{children || <span className='font-normal text-muted-foreground'>—</span>}</div>
    </div>
  )
}

/** Received → At supplier → Back → Closed. */
function Stepper({ claim }: { claim: WarrantyClaim }) {
  const { t } = useLanguage()
  const current = STEPS.indexOf(claim.status)
  return (
    <ol className='flex items-center gap-1 text-xs'>
      {STEPS.map((step, i) => {
        // "At supplier" only counts if it was actually sent (an in-house repair skips it).
        const done = claim.status !== 'cancelled' && i <= current && (step !== 'sent' || !!claim.sentAt)
        return (
          <li key={step} className='flex items-center gap-1'>
            <span className={cn('flex items-center gap-1 rounded-full border px-2 py-0.5', done ? 'border-primary bg-primary/10 text-foreground' : 'text-muted-foreground')}>
              {done && i < current && <Check className='h-3 w-3' />}
              {t(STATUS_META[step].label)}
            </span>
            {i < STEPS.length - 1 && <ArrowRight className='h-3 w-3 text-muted-foreground' />}
          </li>
        )
      })}
    </ol>
  )
}

export function ClaimDetailSheet({ claimId, onClose }: { claimId: string | null; onClose: () => void }) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const dispatch = useDispatch<AppDispatch>()
  const { data: claim, isFetching } = useGetWarrantyClaimQuery(claimId ?? '', { skip: !claimId })
  const { data: org } = useGetMyOrganizationQuery()
  const [runAction, { isLoading: acting }] = useClaimActionMutation()
  const suppliersRaw = useSelector((s: RootState) => s.supplier.data)
  const suppliers: { id: string; name: string }[] = useMemo(() => (Array.isArray(suppliersRaw) ? suppliersRaw : []), [suppliersRaw])

  // Send
  const [supplierId, setSupplierId] = useState('')
  const [reference, setReference] = useState('')
  const [expectedBack, setExpectedBack] = useState('')
  // Receive back
  const [resolution, setResolution] = useState<WarrantyResolution>('repaired')
  const [replacementSerial, setReplacementSerial] = useState('')
  const [creditAmount, setCreditAmount] = useState('')
  const [returnTo, setReturnTo] = useState<'stock' | 'scrap'>('stock')
  const [returnNote, setReturnNote] = useState('')
  // Replacement from stock
  const [swapSerials, setSwapSerials] = useState<string[]>([])
  const [swapPickerOpen, setSwapPickerOpen] = useState(false)
  // Close / cancel
  const [closingNote, setClosingNote] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const [showCancel, setShowCancel] = useState(false)

  useEffect(() => {
    if (!claim) return
    setSupplierId(claim.supplier?.id || '')
    setReference('')
    setExpectedBack('')
    setResolution('repaired')
    setReplacementSerial('')
    setCreditAmount('')
    setReturnTo('stock')
    setReturnNote('')
    setSwapSerials([])
    setClosingNote('')
    setCancelReason('')
    setShowCancel(false)
  }, [claim?.id, claim?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (claimId && !suppliers.length) dispatch(fetchAllSuppliers({}))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimId])

  const supplierOptions = useMemo(() => suppliers.map((s) => ({ value: s.id, label: s.name })), [suppliers])
  const serialized = !!claim?.imeiId

  const act = async (action: 'send' | 'replacement' | 'receive' | 'close' | 'cancel', body: Record<string, unknown>, ok: string) => {
    if (!claim) return
    try {
      await runAction({ id: claim.id, action, body }).unwrap()
      toast.success(t(ok))
    } catch (err) {
      toast.error((err as { data?: { message?: string } })?.data?.message || t('Could not update the claim'))
    }
  }

  const print = () => {
    if (!claim) return
    try {
      printClaimReceipt(claim, {
        name: org?.name,
        address: [org?.address, org?.city].filter(Boolean).join(', '),
        phone: org?.phone,
        logoUrl: org?.logo?.url,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Could not open the print window'))
    }
  }

  const open = claim && ['received', 'sent'].includes(claim.status)
  const overdue = claim?.status === 'sent' && claim.expectedBackAt && new Date(claim.expectedBackAt).getTime() < Date.now()

  return (
    <Sheet open={!!claimId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side='right' className='flex w-full flex-col gap-0 p-0 sm:max-w-2xl'>
        <SheetHeader className='space-y-2 border-b px-6 py-4 pr-12'>
          <SheetTitle className='flex flex-wrap items-center gap-2'>
            {claim?.claimNumber || t('Warranty claim')}
            {claim && <Badge variant='outline' className={STATUS_META[claim.status].className}>{t(STATUS_META[claim.status].label)}</Badge>}
            {claim && (
              <Badge variant='outline' className='text-[10px]'>
                {claim.type === 'customer' ? t('Customer claim') : t('Our stock')}
              </Badge>
            )}
            {overdue && <Badge variant='destructive' className='text-[10px]'>{t('Overdue')}</Badge>}
            {isFetching && <Loader2 className='h-4 w-4 animate-spin text-muted-foreground' />}
          </SheetTitle>
          <SheetDescription asChild>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              {claim ? <Stepper claim={claim} /> : <span />}
              {claim && (
                <Button size='sm' variant='outline' className='h-8 gap-1.5' onClick={print}>
                  <Printer className='h-3.5 w-3.5' />
                  {t('Print receipt')}
                </Button>
              )}
            </div>
          </SheetDescription>
        </SheetHeader>

        {!claim ? (
          <div className='space-y-3 p-6'>
            <Skeleton className='h-6 w-1/2' />
            <Skeleton className='h-24 w-full' />
          </div>
        ) : (
          <div className='min-h-0 flex-1 space-y-5 overflow-y-auto p-6'>
            <div className='grid grid-cols-2 gap-4 sm:grid-cols-3'>
              <Field label={t('Product')}>{claim.productName}{claim.quantity > 1 ? ` × ${claim.quantity}` : ''}</Field>
              <Field label={t('Serial / IMEI')}>
                {claim.originalSerial && claim.serial !== claim.originalSerial ? (
                  <span className='font-mono'>
                    {claim.originalSerial} → {claim.serial}
                  </span>
                ) : (
                  <span className='font-mono'>{claim.serial}</span>
                )}
              </Field>
              <Field label={t('Warranty')}>
                <Badge variant='outline' className={cn('text-[10px]', COVER_META[claim.warranty.status].className)}>{t(COVER_META[claim.warranty.status].label)}</Badge>
                {claim.warranty.endDate && <span className='ml-1 text-xs font-normal text-muted-foreground'>{formatAppDate(claim.warranty.endDate)}</span>}
              </Field>
              {claim.type === 'customer' && <Field label={t('Customer')}>{[claim.customer.name, claim.customer.phone].filter(Boolean).join(' · ')}</Field>}
              {claim.type === 'customer' && (
                <Field label={t('Invoice')}>{[claim.invoiceNumber, claim.saleDate && formatAppDate(claim.saleDate)].filter(Boolean).join(' · ')}</Field>
              )}
              <Field label={t('Received')}>{formatAppDateTime(claim.receivedAt)}</Field>
              <Field label={t('Supplier / service centre')}>{claim.supplier?.name}</Field>
              {claim.sentAt && <Field label={t('Sent')}>{formatAppDate(claim.sentAt)}{claim.sentReference ? ` · ${claim.sentReference}` : ''}</Field>}
              {claim.expectedBackAt && <Field label={t('Expected back')}>{formatAppDate(claim.expectedBackAt)}</Field>}
              {claim.resolution && <Field label={t('Outcome')}>{t(RESOLUTION_META[claim.resolution].label)}{claim.creditAmount > 0 ? ` · ${formatMoney(claim.creditAmount)}` : ''}</Field>}
              {claim.returnedTo && claim.returnedTo !== 'none' && (
                <Field label={t('Went to')}>{t({ stock: 'Back into stock', scrap: 'Written off', customer: 'The customer', none: '' }[claim.returnedTo])}</Field>
              )}
              {claim.replacementGiven && (
                <Field label={t('Replacement given')}>
                  {claim.replacementGiven.productName}
                  {claim.replacementGiven.serial ? ` · ${claim.replacementGiven.serial}` : ''}
                </Field>
              )}
            </div>

            <div className='rounded-lg border bg-muted/30 p-3 text-sm'>
              <p className='text-[11px] uppercase tracking-wide text-muted-foreground'>{t('Fault')}</p>
              <p className='whitespace-pre-wrap'>{claim.problem}</p>
              {claim.conditionNotes && <p className='mt-2 whitespace-pre-wrap text-xs text-muted-foreground'>{claim.conditionNotes}</p>}
              {claim.accessories.length > 0 && (
                <div className='mt-2 flex flex-wrap gap-1'>
                  {claim.accessories.map((a) => (
                    <Badge key={a} variant='secondary' className='text-[10px]'>{t(a)}</Badge>
                  ))}
                </div>
              )}
            </div>

            <Can anyPermissions={[...MANAGE]}>
              {claim.status === 'received' && (
                <section className='space-y-3 rounded-lg border p-4'>
                  <h3 className='flex items-center gap-2 text-sm font-semibold'>
                    <Send className='h-4 w-4' />
                    {t('Send to supplier / service centre')}
                  </h3>
                  <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
                    <SearchableSelect options={supplierOptions} value={supplierId} onValueChange={setSupplierId} placeholder={t('Supplier')} />
                    <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t('Courier / RMA / reference')} />
                    <div className='space-y-1'>
                      <Label className='text-xs'>{t('Expected back')}</Label>
                      <DatePicker value={expectedBack} onChange={setExpectedBack} min={getBusinessToday()} clearable />
                    </div>
                  </div>
                  <Button
                    size='sm'
                    disabled={acting || !supplierId}
                    onClick={() => act('send', { supplierId, reference, expectedBackAt: expectedBack || undefined }, 'Marked as sent')}
                  >
                    {t('Mark as sent')}
                  </Button>
                </section>
              )}

              {open && (
                <section className='space-y-3 rounded-lg border p-4'>
                  <h3 className='flex items-center gap-2 text-sm font-semibold'>
                    <PackageCheck className='h-4 w-4' />
                    {t('It came back')}
                  </h3>
                  <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
                    {(Object.keys(RESOLUTION_META) as WarrantyResolution[]).map((r) => (
                      <button
                        key={r}
                        type='button'
                        aria-pressed={resolution === r}
                        onClick={() => setResolution(r)}
                        title={t(RESOLUTION_META[r].hint)}
                        className={cn('rounded-md border px-2 py-1.5 text-sm hover:bg-accent', resolution === r && 'border-primary bg-primary/10 ring-1 ring-primary')}
                      >
                        {t(RESOLUTION_META[r].label)}
                      </button>
                    ))}
                  </div>
                  <p className='text-xs text-muted-foreground'>{t(RESOLUTION_META[resolution].hint)}</p>
                  {resolution === 'replaced' && serialized && (
                    <Input value={replacementSerial} onChange={(e) => setReplacementSerial(e.target.value)} placeholder={t('Serial / IMEI of the new unit')} className='font-mono' />
                  )}
                  {resolution === 'credited' && (
                    <Input type='number' min={0} value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} placeholder={t('Credit amount (optional)')} />
                  )}
                  {claim.ownership === 'shop' && resolution !== 'credited' && (
                    <div className='flex flex-wrap gap-2 text-sm'>
                      {(['stock', 'scrap'] as const).map((r) => (
                        <label key={r} className={cn('flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5', returnTo === r && 'border-primary bg-primary/5')}>
                          <input type='radio' name='return-to' checked={returnTo === r} onChange={() => setReturnTo(r)} />
                          {r === 'stock' ? t('Back into sellable stock') : t('Write it off')}
                        </label>
                      ))}
                    </div>
                  )}
                  {claim.ownership === 'customer' && resolution !== 'credited' && (
                    <p className='text-xs text-muted-foreground'>{t('It goes back to the customer — close the claim when they collect it.')}</p>
                  )}
                  <Textarea rows={2} value={returnNote} onChange={(e) => setReturnNote(e.target.value)} placeholder={t('Note (optional)')} />
                  <Button
                    size='sm'
                    disabled={acting || (resolution === 'replaced' && serialized && !replacementSerial.trim())}
                    onClick={() =>
                      act(
                        'receive',
                        {
                          resolution,
                          ...(replacementSerial.trim() ? { replacementSerial: replacementSerial.trim() } : {}),
                          ...(creditAmount ? { creditAmount: Number(creditAmount) } : {}),
                          ...(claim.ownership === 'shop' ? { returnTo } : {}),
                          note: returnNote,
                        },
                        claim.ownership === 'shop' && returnTo === 'stock' && resolution !== 'credited' ? 'Back in stock' : 'Recorded',
                      )
                    }
                  >
                    {t('Save')}
                  </Button>
                </section>
              )}

              {open && claim.type === 'customer' && !claim.replacementGiven && (
                <section className='space-y-3 rounded-lg border p-4'>
                  <h3 className='flex items-center gap-2 text-sm font-semibold'>
                    <Repeat className='h-4 w-4' />
                    {t('Give the customer a replacement from stock now')}
                  </h3>
                  <p className='text-xs text-muted-foreground'>
                    {t('The customer leaves with a working unit; the faulty one becomes yours and goes back into stock when it returns.')}
                  </p>
                  {serialized ? (
                    <div className='flex flex-wrap items-center gap-2'>
                      <Button size='sm' variant='outline' onClick={() => setSwapPickerOpen(true)}>
                        {swapSerials[0] ? `${t('Unit')}: ${swapSerials[0]}` : t('Pick the unit to hand over')}
                      </Button>
                      <Button size='sm' disabled={acting || !swapSerials[0]} onClick={() => act('replacement', { serial: swapSerials[0] }, 'Replacement handed over')}>
                        {t('Hand over')}
                      </Button>
                    </div>
                  ) : (
                    <Button size='sm' disabled={acting} onClick={() => act('replacement', { quantity: claim.quantity }, 'Replacement handed over')}>
                      {t('Hand over {{n}} from stock', { n: String(claim.quantity) })}
                    </Button>
                  )}
                </section>
              )}

              {claim.status === 'returned' && (
                <section className='space-y-3 rounded-lg border p-4'>
                  <h3 className='flex items-center gap-2 text-sm font-semibold'>
                    <Check className='h-4 w-4' />
                    {claim.ownership === 'customer' ? t('Customer collected it') : t('Finish')}
                  </h3>
                  <Input value={closingNote} onChange={(e) => setClosingNote(e.target.value)} placeholder={t('Note (optional)')} />
                  <Button size='sm' disabled={acting} onClick={() => act('close', { note: closingNote }, 'Claim closed')}>
                    {t('Close claim')}
                  </Button>
                </section>
              )}

              {open && (
                <div>
                  {showCancel ? (
                    <div className='space-y-2 rounded-lg border border-destructive/40 p-3'>
                      <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder={t('Why? (optional)')} />
                      <div className='flex gap-2'>
                        <Button size='sm' variant='destructive' disabled={acting} onClick={() => act('cancel', { reason: cancelReason }, 'Claim cancelled — stock restored')}>
                          {t('Cancel claim & undo stock moves')}
                        </Button>
                        <Button size='sm' variant='ghost' onClick={() => setShowCancel(false)}>
                          {t('Keep it')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button size='sm' variant='ghost' className='gap-1.5 text-destructive hover:text-destructive' onClick={() => setShowCancel(true)}>
                      <CircleSlash className='h-3.5 w-3.5' />
                      {t('Cancel this claim')}
                    </Button>
                  )}
                </div>
              )}
            </Can>

            <section>
              <h3 className='mb-2 flex items-center gap-2 text-sm font-semibold'>
                <Undo2 className='h-4 w-4 rotate-180' />
                {t('History')}
              </h3>
              <ol className='space-y-2 border-l pl-4'>
                {[...claim.timeline].reverse().map((e, i) => (
                  <li key={i} className='relative text-sm'>
                    <span className='absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary' />
                    <span className='font-medium capitalize'>{t(e.action.replace('_', ' '))}</span>
                    {e.note && <span className='text-muted-foreground'> — {e.note}</span>}
                    <div className='text-xs text-muted-foreground'>
                      {formatAppDateTime(e.at)}
                      {e.byUserName ? ` · ${e.byUserName}` : ''}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </SheetContent>
      {claim && serialized && (
        <SerialPickDialog
          open={swapPickerOpen}
          onOpenChange={setSwapPickerOpen}
          productId={claim.productId}
          itemName={claim.productName}
          quantity={1}
          selected={swapSerials}
          onChange={setSwapSerials}
        />
      )}
    </Sheet>
  )
}
