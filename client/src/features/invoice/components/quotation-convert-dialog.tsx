import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { FileCheck, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useLanguage } from '@/context/language-context'
import { useConvertQuotationMutation } from '@/stores/invoice.api'

type QuotationInvoice = {
  _id?: string
  id?: string
  invoiceNumber?: string
  customerId?: string | { _id?: string; id?: string; name?: string }
  customerName?: string
  walkInCustomerName?: string
  total?: number
  items?: Array<{ name: string; quantity: number }>
}

interface QuotationConvertDialogProps {
  invoice: QuotationInvoice | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConverted?: (invoice: unknown) => void
}

const resolveCustomerLabel = (invoice: QuotationInvoice) => {
  if (invoice.walkInCustomerName?.trim()) return invoice.walkInCustomerName.trim()
  if (invoice.customerName?.trim()) return invoice.customerName.trim()
  if (typeof invoice.customerId === 'object' && invoice.customerId?.name) return invoice.customerId.name
  return 'Walk-In Customer'
}

const isWalkInCustomer = (invoice: QuotationInvoice) => {
  const customerId =
    typeof invoice.customerId === 'object'
      ? invoice.customerId?._id || invoice.customerId?.id
      : invoice.customerId
  return !customerId || customerId === 'walk-in'
}

export function QuotationConvertDialog({
  invoice,
  open,
  onOpenChange,
  onConverted,
}: QuotationConvertDialogProps) {
  const { t } = useLanguage()
  const [targetType, setTargetType] = useState<'cash' | 'credit'>('cash')
  const [paidAmount, setPaidAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [convertQuotation, { isLoading }] = useConvertQuotationMutation()

  useEffect(() => {
    if (!open || !invoice) return
    const total = Number(invoice.total || 0)
    setTargetType(isWalkInCustomer(invoice) ? 'cash' : 'cash')
    setPaidAmount(total.toFixed(2))
    const defaultDue = new Date()
    defaultDue.setDate(defaultDue.getDate() + 30)
    setDueDate(format(defaultDue, 'yyyy-MM-dd'))
    setNotes('')
  }, [open, invoice])

  useEffect(() => {
    if (!invoice) return
    const total = Number(invoice.total || 0)
    if (targetType === 'cash') {
      setPaidAmount(total.toFixed(2))
    } else {
      setPaidAmount('0')
    }
  }, [targetType, invoice])

  const handleConvert = async () => {
    if (!invoice) return
    const invoiceId = invoice._id || invoice.id
    if (!invoiceId) {
      toast.error('Quotation id is missing')
      return
    }

    const total = Number(invoice.total || 0)
    const parsedPaid = Number(paidAmount || 0)
    if (Number.isNaN(parsedPaid) || parsedPaid < 0) {
      toast.error(t('invalid_paid_amount') || 'Invalid paid amount')
      return
    }
    if (parsedPaid > total) {
      toast.error(t('paid_amount_exceeds_total') || 'Paid amount cannot exceed total')
      return
    }

    try {
      const result = await convertQuotation({
        id: invoiceId,
        targetType,
        paidAmount: parsedPaid,
        dueDate: targetType === 'credit' && dueDate ? dueDate : undefined,
        notes: notes.trim() || undefined,
      }).unwrap()
      toast.success(t('quotation_converted_success') || 'Quotation converted to invoice')
      onOpenChange(false)
      onConverted?.(result)
    } catch (error: any) {
      toast.error(error?.data?.message || t('quotation_convert_failed') || 'Failed to convert quotation')
    }
  }

  if (!invoice) return null

  const total = Number(invoice.total || 0)
  const itemCount = invoice.items?.length || 0
  const walkIn = isWalkInCustomer(invoice)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-lg'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <FileCheck className='h-5 w-5 text-emerald-600' />
            {t('convert_quotation_to_invoice') || 'Convert Quotation to Invoice'}
          </DialogTitle>
          <DialogDescription>
            {t('convert_quotation_description') ||
              'Finalize this quotation as a real sale. Stock will be deducted and accounts updated.'}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4 rounded-lg border bg-muted/20 p-4'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <div>
              <p className='text-sm text-muted-foreground'>{t('quotation_number') || 'Quotation No'}</p>
              <p className='font-semibold'>{invoice.invoiceNumber}</p>
            </div>
            <Badge variant='secondary'>{itemCount} {t('items') || 'items'}</Badge>
          </div>
          <div>
            <p className='text-sm text-muted-foreground'>{t('customer')}</p>
            <p className='font-medium'>{resolveCustomerLabel(invoice)}</p>
          </div>
          <div>
            <p className='text-sm text-muted-foreground'>{t('total')}</p>
            <p className='text-xl font-bold text-emerald-700'>Rs {total.toLocaleString('en-PK', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>

        <div className='space-y-4'>
          <div className='space-y-2'>
            <Label>{t('invoice_type')}</Label>
            <Select
              value={targetType}
              onValueChange={(value: 'cash' | 'credit') => setTargetType(value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='cash'>{t('cash')}</SelectItem>
                <SelectItem value='credit' disabled={walkIn}>
                  {t('credit')}
                </SelectItem>
              </SelectContent>
            </Select>
            {walkIn && (
              <p className='text-xs text-muted-foreground'>
                {t('credit_requires_customer') || 'Credit invoices require a registered customer.'}
              </p>
            )}
          </div>

          {targetType === 'credit' && (
            <div className='space-y-2'>
              <Label htmlFor='quotation-due-date'>{t('due_date') || 'Due Date'}</Label>
              <Input
                id='quotation-due-date'
                type='date'
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>
          )}

          <div className='space-y-2'>
            <Label htmlFor='quotation-paid-amount'>
              {targetType === 'cash' ? t('paid_amount') || 'Paid Amount' : t('advance_paid') || 'Advance Paid'}
            </Label>
            <Input
              id='quotation-paid-amount'
              type='number'
              min='0'
              step='0.01'
              value={paidAmount}
              onChange={(event) => setPaidAmount(event.target.value)}
            />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='quotation-convert-notes'>{t('notes') || 'Notes'} ({t('optional') || 'Optional'})</Label>
            <Input
              id='quotation-convert-notes'
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={t('conversion_notes_placeholder') || 'Add a note for this conversion'}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)} disabled={isLoading}>
            {t('cancel')}
          </Button>
          <Button onClick={handleConvert} disabled={isLoading} className='bg-emerald-600 hover:bg-emerald-700'>
            {isLoading ? (
              <>
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                {t('converting') || 'Converting...'}
              </>
            ) : (
              t('convert_to_invoice') || 'Convert to Invoice'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
