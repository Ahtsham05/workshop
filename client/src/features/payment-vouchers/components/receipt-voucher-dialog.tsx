import { useEffect, useMemo, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useForm, useFieldArray, SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { CalendarIcon, Info, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { AppDispatch, RootState } from '@/stores/store'
import { fetchCustomers } from '@/stores/customer.slice'
import { resolveEntityId } from '@/features/purchase-invoice/utils/catalog-helpers'
import {
  useCreateReceiptVoucherMutation,
  useUpdateReceiptVoucherMutation,
  type ReceiptVoucherRecord,
} from '@/stores/receiptVoucher.api'
import { useGetWalletsQuery } from '@/stores/mobile-shop.api'
import { TransactionCategoryPicker } from '@/features/accounting/components/transaction-category-picker'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { makeEnterChain, MOBILE_FORM_KEYBOARD_HINT, useCtrlEnterSubmit } from '@/lib/mobile-form-keyboard'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { useFormDraft } from '@/hooks/use-form-draft'
import { FormDraftNotice } from '@/components/form-draft-notice'

type CustomerLike = { id?: string; _id?: string; name: string; phone?: string; picture?: { url?: string; publicId?: string } }

/** Redux customer slice may store `{ results }` or a plain array — same shape as suppliers. */
function normalizeCustomersList(data: unknown): CustomerLike[] {
  if (!data) return []
  if (Array.isArray(data)) return data as CustomerLike[]
  if (typeof data === 'object' && data !== null) {
    const results = (data as { results?: unknown }).results
    if (Array.isArray(results)) return results as CustomerLike[]
  }
  return []
}

const lineSchema = z
  .object({
    // Id of the stored line this row edits ('' for a row that is new).
    lineId: z.string(),
    sourceType: z.enum(['customer', 'income']),
    category: z.string(),
    customerId: z.string(),
    // Untouched rows (the default 8) sit at 0 and are silently dropped on submit — only a
    // row the user actually put an amount into needs its source filled in.
    amount: z.coerce.number().min(0),
    description: z.string(),
  })
  .refine((d) => Number(d.amount) <= 0 || d.sourceType !== 'income' || !!d.category, {
    message: 'Select a category',
    path: ['category'],
  })
  .refine((d) => Number(d.amount) <= 0 || d.sourceType !== 'customer' || !!d.customerId, {
    message: 'Select a customer',
    path: ['customerId'],
  })

const voucherSchema = z.object({
  date: z.date(),
  bankAccountId: z.string().min(1, 'Select a bank account'),
  lines: z.array(lineSchema).min(1, 'Add at least one line'),
  notes: z.string(),
})

type VoucherFormValues = z.infer<typeof voucherSchema>

const emptyLine = () => ({
  lineId: '',
  sourceType: 'customer' as 'customer' | 'income',
  category: '',
  customerId: '',
  amount: 0,
  description: '',
})

const DEFAULT_ROW_COUNT = 8

const defaultFormValues = (): VoucherFormValues => ({
  date: new Date(),
  bankAccountId: '',
  lines: Array.from({ length: DEFAULT_ROW_COUNT }, () => emptyLine()),
  notes: '',
})

/** The form, pre-filled from a stored voucher — only its own lines, no spare blank rows. */
const valuesFromVoucher = (voucher: ReceiptVoucherRecord): VoucherFormValues => ({
  date: new Date(voucher.date),
  bankAccountId: voucher.bankAccountId,
  notes: voucher.notes ?? '',
  lines: voucher.lines.map((line) => ({
    lineId: line.id ?? '',
    sourceType: line.sourceType,
    category: line.category ?? '',
    customerId: line.customerId ?? '',
    amount: line.amount,
    description: line.description ?? '',
  })),
})

/** What "has anything changed?" compares. Blank rows the user added but never filled in don't
 *  count — they're dropped on save — and amounts are numbers however they were typed. */
const fingerprint = (values: VoucherFormValues) =>
  JSON.stringify({
    date: values.date instanceof Date ? values.date.getTime() : null,
    bankAccountId: values.bankAccountId,
    notes: values.notes,
    lines: values.lines
      .filter((line) => line.lineId || Number(line.amount) > 0)
      .map((line) => [
        line.lineId,
        line.sourceType,
        line.category,
        line.customerId,
        Number(line.amount) || 0,
        line.description,
      ]),
  })

interface ReceiptVoucherDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pass a stored voucher to edit it; omit for a new one. */
  voucher?: ReceiptVoucherRecord | null
  onCreated?: (voucherId: string) => void
  onUpdated?: (voucherId: string) => void
}

export function ReceiptVoucherDialog({ open, onOpenChange, voucher, onCreated, onUpdated }: ReceiptVoucherDialogProps) {
  const isEdit = !!voucher
  const formatMoney = useFormatMoney()
  const dispatch = useDispatch<AppDispatch>()
  const { data: walletsData } = useGetWalletsQuery(undefined, { skip: !open })
  const wallets = (walletsData?.results ?? []).filter((w) => w.isActive !== false)
  const customersData = useSelector((state: RootState) => state.customer.data)
  const customers = normalizeCustomersList(customersData)
  const [createVoucher, { isLoading: isCreating }] = useCreateReceiptVoucherMutation()
  const [updateVoucher, { isLoading: isUpdating }] = useUpdateReceiptVoucherMutation()
  const isLoading = isCreating || isUpdating
  const submitButtonRef = useRef<HTMLButtonElement>(null)
  const prevLineCountRef = useRef(DEFAULT_ROW_COUNT)
  const initialFingerprint = useMemo(() => (voucher ? fingerprint(valuesFromVoucher(voucher)) : ''), [voucher])

  useEffect(() => {
    if (open) dispatch(fetchCustomers({ page: 1, limit: 1000 }))
  }, [open, dispatch])

  const form = useForm<VoucherFormValues>({
    resolver: zodResolver(voucherSchema),
    defaultValues: defaultFormValues(),
    mode: 'onChange',
  })

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'lines' })

  useEffect(() => {
    if (open) {
      const values = voucher ? valuesFromVoucher(voucher) : defaultFormValues()
      form.reset(values)
      prevLineCountRef.current = values.lines.length
    }
  }, [open, voucher, form])

  const draft = useFormDraft(form, { key: 'receipt-voucher', enabled: open && !isEdit, label: 'receipt voucher' })

  const lines = form.watch('lines')
  const totalAmount = lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0)
  const hasChanges = isEdit && fingerprint(form.watch()) !== initialFingerprint

  const customerOptions = customers.map((c) => ({
    value: resolveEntityId(c),
    label: c.name,
    sublabel: c.phone,
    picture: c.picture,
  }))
  // A customer already on this voucher must stay selectable even if it isn't in the fetched list
  // (deleted since, or past the first page) — otherwise its row would read as empty.
  voucher?.lines.forEach((line) => {
    if (line.customerId && !customerOptions.some((option) => option.value === line.customerId)) {
      customerOptions.push({
        value: line.customerId,
        label: line.customerName || line.payerName,
        sublabel: undefined,
        picture: undefined,
      })
    }
  })

  const fieldIds = useMemo(() => {
    const ids = ['voucher-date', 'voucher-bank-account']
    fields.forEach((_, index) => {
      ids.push(`line-${index}-sourceType`, `line-${index}-source`, `line-${index}-description`, `line-${index}-amount`)
    })
    return ids
  }, [fields])

  const voucherEnter = useMemo(
    () =>
      makeEnterChain(fieldIds, {
        submitButtonRef,
        // Enter on the very last field (last row's Amount) adds a fresh row instead of
        // stopping — keeps continuous spreadsheet-style entry going without reaching for
        // the mouse.
        onLast: () => append(emptyLine()),
      }),
    [fieldIds, append],
  )

  // Whenever the line count grows (via "Add Line" or the auto-add-on-Enter above), jump
  // focus straight into the new row's first field.
  useEffect(() => {
    if (fields.length > prevLineCountRef.current) {
      voucherEnter.focusById(`line-${fields.length - 1}-sourceType`)
    }
    prevLineCountRef.current = fields.length
  }, [fields.length, voucherEnter])

  const onSubmit: SubmitHandler<VoucherFormValues> = async (data) => {
    if (isEdit && !hasChanges) {
      toast.info('Nothing has changed')
      return
    }
    if (isEdit) {
      // A line that already exists can't just be zeroed — that would silently delete it, and a
      // voucher's history shouldn't change by accident. Removing is the trash button.
      const emptied = data.lines.findIndex((line) => line.lineId && !(Number(line.amount) > 0))
      if (emptied >= 0) {
        form.setError(`lines.${emptied}.amount`, { type: 'manual', message: 'Enter an amount, or remove the line' })
        toast.error('Every existing line needs an amount — use the trash button to remove one')
        return
      }
    }
    const nonEmptyLines = data.lines.filter((line) => Number(line.amount) > 0)
    if (nonEmptyLines.length === 0) {
      toast.error('Add an amount to at least one line')
      return
    }
    const payload = {
      date: data.date.toISOString(),
      bankAccountId: data.bankAccountId,
      lines: nonEmptyLines.map((line) => ({
        id: line.lineId || undefined,
        sourceType: line.sourceType,
        category: line.sourceType === 'income' ? line.category : undefined,
        customerId: line.sourceType === 'customer' ? line.customerId : undefined,
        amount: line.amount,
        description: line.description || undefined,
      })),
      notes: data.notes,
    }
    try {
      if (voucher) {
        const updated = await updateVoucher({ id: voucher.id, ...payload }).unwrap()
        toast.success(`Receipt voucher ${updated.voucherNumber} updated`)
        onUpdated?.(updated.id)
      } else {
        const created = await createVoucher({
          ...payload,
          lines: payload.lines.map(({ id: _id, ...line }) => line),
        }).unwrap()
        toast.success(`Receipt voucher ${created.voucherNumber} created`)
        draft.clear()
        onCreated?.(created.id)
      }
      onOpenChange(false)
    } catch (error: any) {
      toast.error(error?.data?.message || `Failed to ${isEdit ? 'update' : 'create'} receipt voucher`)
    }
  }

  useCtrlEnterSubmit(() => form.handleSubmit(onSubmit)(), isLoading)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-[960px]'>
        <DialogHeader className='px-6 pt-6 pb-4'>
          <DialogTitle>{isEdit ? (
              <>
                Edit Receipt Voucher · <span className='whitespace-nowrap'>{voucher?.voucherNumber}</span>
              </>
            ) : (
              'New Receipt Voucher'
            )}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Change the date, account, lines or notes of this voucher'
              : 'Record one or more payments received into a bank account'}{' '}
            · {MOBILE_FORM_KEYBOARD_HINT}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className='flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 sm:overflow-hidden'>
          <FormDraftNotice draft={draft} className='shrink-0' />
          {isEdit && (
            <Alert className='shrink-0 border-amber-500/30 bg-amber-500/5'>
              <Info className='h-4 w-4' />
              <AlertDescription>
                Saving updates the bank balance, Cash Book and any linked customer ledger entry. Only the lines you change
                are re-posted. Money already spent from the account can&apos;t be taken back.
              </AlertDescription>
            </Alert>
          )}
          <div className='grid shrink-0 gap-4 sm:grid-cols-2'>
            <div className='space-y-2'>
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant='outline'
                    id='voucher-date'
                    {...voucherEnter.enterProps('voucher-date')}
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !form.watch('date') && 'text-muted-foreground',
                    )}
                  >
                    <CalendarIcon className='mr-2 h-4 w-4' />
                    {form.watch('date') ? format(form.watch('date'), 'PPP') : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className='w-auto p-0'>
                  <Calendar
                    mode='single'
                    selected={form.watch('date')}
                    onSelect={(d) => form.setValue('date', d || new Date(), { shouldDirty: true })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className='space-y-2'>
              <Label>Receive Into (Bank Account)</Label>
              <Select
                value={form.watch('bankAccountId')}
                onValueChange={(v) => form.setValue('bankAccountId', v, { shouldValidate: true, shouldDirty: true })}
              >
                <SelectTrigger className='w-full' id='voucher-bank-account' {...voucherEnter.enterProps('voucher-bank-account')}>
                  <SelectValue placeholder='Select a bank account...' />
                </SelectTrigger>
                <SelectContent>
                  {wallets.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.type} ({formatMoney(Number(w.balance || 0))})
                    </SelectItem>
                  ))}
                  {/* The voucher's own account, if it has since been deactivated and so isn't listed. */}
                  {voucher && !wallets.some((w) => w.id === voucher.bankAccountId) && (
                    <SelectItem value={voucher.bankAccountId}>{voucher.bankAccountName || 'Previous account'} (inactive)</SelectItem>
                  )}
                </SelectContent>
              </Select>
              {wallets.length === 0 && (
                <p className='text-xs text-muted-foreground'>No bank accounts yet. Add one from the Bank Accounts page.</p>
              )}
              {form.formState.errors.bankAccountId && (
                <p className='text-xs text-red-500'>{form.formState.errors.bankAccountId.message}</p>
              )}
            </div>
          </div>

          <div className='flex shrink-0 items-center justify-between'>
            <Label>Receipt Lines</Label>
            <Button type='button' size='sm' variant='outline' onClick={() => append(emptyLine())}>
              <Plus className='mr-1 h-3.5 w-3.5' />
              Add Line
            </Button>
          </div>

          <div className='min-h-[220px] flex-1 overflow-y-auto rounded-lg border sm:min-h-0'>
            <Table>
              <TableHeader className='sticky top-0 z-10 bg-background'>
                <TableRow>
                  <TableHead className='w-[130px]'>Receive From</TableHead>
                  <TableHead className='min-w-[220px]'>Source</TableHead>
                  <TableHead className='min-w-[180px]'>Description</TableHead>
                  <TableHead className='w-[130px] text-right'>Amount (Rs)</TableHead>
                  <TableHead className='w-[44px]' />
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map((field, index) => {
                  const sourceType = form.watch(`lines.${index}.sourceType`)
                  const lineError = form.formState.errors.lines?.[index]
                  const sourceEnterProps = voucherEnter.enterProps(`line-${index}-source`)
                  return (
                    <TableRow key={field.id}>
                      <TableCell className='p-1.5 align-top'>
                        <Select
                          value={form.watch(`lines.${index}.sourceType`)}
                          onValueChange={(v) =>
                            form.setValue(`lines.${index}.sourceType`, v as 'customer' | 'income', { shouldValidate: true, shouldDirty: true })
                          }
                        >
                          <SelectTrigger
                            className='w-full'
                            id={`line-${index}-sourceType`}
                            {...voucherEnter.enterProps(`line-${index}-sourceType`)}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value='customer'>Customer</SelectItem>
                            <SelectItem value='income'>Income</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>

                      <TableCell className='p-1.5 align-top'>
                        {sourceType === 'income' ? (
                          <TransactionCategoryPicker
                            transactionType='income'
                            value={form.watch(`lines.${index}.category`)}
                            onChange={(v) => form.setValue(`lines.${index}.category`, v, { shouldValidate: true, shouldDirty: true })}
                            id={`line-${index}-source`}
                            data-enter-field={`line-${index}-source`}
                            onKeyDown={sourceEnterProps.onKeyDown}
                            onKeyDownCapture={sourceEnterProps.onKeyDownCapture}
                            onSelected={() => voucherEnter.advance(`line-${index}-source`)}
                            hideTitle
                            allowManage={false}
                          />
                        ) : (
                          <SearchableSelect
                            options={customerOptions}
                            value={form.watch(`lines.${index}.customerId`)}
                            onValueChange={(v) => form.setValue(`lines.${index}.customerId`, v, { shouldValidate: true, shouldDirty: true })}
                            placeholder='Select a customer...'
                            searchPlaceholder='Search customers...'
                            emptyText='No customers found.'
                            id={`line-${index}-source`}
                            data-enter-field={`line-${index}-source`}
                            onKeyDown={sourceEnterProps.onKeyDown}
                            onKeyDownCapture={sourceEnterProps.onKeyDownCapture}
                            onSelected={() => voucherEnter.advance(`line-${index}-source`)}
                            popoverClassName='w-[320px]'
                          />
                        )}
                        {(lineError?.category || lineError?.customerId) && (
                          <p className='mt-1 text-xs text-red-500'>
                            {lineError.category?.message || lineError.customerId?.message}
                          </p>
                        )}
                      </TableCell>

                      <TableCell className='p-1.5 align-top'>
                        <Input
                          placeholder='e.g., Advance payment'
                          id={`line-${index}-description`}
                          {...voucherEnter.enterProps(`line-${index}-description`)}
                          {...form.register(`lines.${index}.description`)}
                        />
                      </TableCell>

                      <TableCell className='p-1.5 align-top'>
                        <Input
                          type='number'
                          min={0}
                          step='0.01'
                          className='text-right'
                          id={`line-${index}-amount`}
                          {...voucherEnter.enterProps(`line-${index}-amount`)}
                          {...form.register(`lines.${index}.amount`)}
                        />
                        {lineError?.amount && <p className='mt-1 text-xs text-red-500'>{lineError.amount.message}</p>}
                      </TableCell>

                      <TableCell className='p-1.5 align-top'>
                        <Button
                          type='button'
                          size='icon'
                          variant='ghost'
                          className='text-red-600 hover:text-red-700'
                          disabled={fields.length === 1}
                          onClick={() => remove(index)}
                          title='Remove line'
                        >
                          <Trash2 className='h-4 w-4' />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          <div className='flex shrink-0 items-center justify-end gap-2'>
            <span className='text-sm font-medium text-muted-foreground'>Total:</span>
            <span className='text-lg font-bold'>{formatMoney(totalAmount)}</span>
          </div>

          <div className='shrink-0 space-y-2'>
            <Label htmlFor='voucher-notes'>Notes</Label>
            <Textarea id='voucher-notes' className='resize-none' rows={2} {...form.register('notes')} />
          </div>

          <DialogFooter className='shrink-0 pb-6'>
            <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              ref={submitButtonRef}
              type='submit'
              disabled={isLoading || wallets.length === 0 || (isEdit && !hasChanges)}
            >
              {isLoading ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Voucher'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
