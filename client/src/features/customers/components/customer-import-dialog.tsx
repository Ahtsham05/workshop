/**
 * Import customers from a spreadsheet — a thin configuration over the shared
 * ExcelImportDialog, which handles the file itself (header detection, column matching,
 * batching, partial success, per-row reporting).
 */

import { useCallback, useMemo, useState } from 'react'
import { useLanguage } from '@/context/language-context'
import { useContactLocation } from '@/hooks/use-contact-location'
import { locationPreview, readLocationCells, withLocationFields, withLocationSample, type ImportLocation } from '@/lib/contact-location-import'
import { Label } from '@/components/ui/label'
import { DatePicker } from '@/components/ui/date-picker'
import { getBusinessToday } from '@/lib/business-timezone'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ExcelImportDialog,
  type BuiltRow,
  type ImportBatchOutcome,
} from '@/components/excel-import-dialog'
import { parseNumeric, parseText, type CellValue } from '@/lib/excel-import'
import { usePermissions } from '@/context/permission-context'
import {
  CUSTOMER_IMPORT_FIELDS,
  CUSTOMER_SAMPLE_ROWS,
  PAYMENT_TERM_LABELS,
  parsePaymentTermsText,
  parseYesNoText,
} from '../utils/customer-excel'

export interface BulkCustomerResult {
  insertedCount?: number
  updatedCount?: number
  skippedCount?: number
  errors?: Array<{ index?: number; error?: string; name?: string }>
  /** Rows deliberately left alone (already saved) — not failures. */
  skipped?: Array<{ index?: number; name?: string; reason: string }>
  /** Rows that imported, with something worth knowing (an unusable email, say). */
  warnings?: Array<{ index?: number; name?: string; message: string }>
}

/** 'location' = for already-saved contacts, only fill in City / State / Country. */
export type DuplicateStrategy = 'skip' | 'update' | 'error' | 'location'

interface CustomerImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (
    customers: ImportCustomer[],
    options?: { duplicateStrategy?: DuplicateStrategy; openingBalanceDate?: string }
  ) => Promise<BulkCustomerResult | void>
}

interface ImportCustomer extends ImportLocation {
  name: string
  nameUrdu?: string
  phone?: string
  whatsapp?: string
  email?: string
  address?: string
  balance?: number
  customerType?: string
  creditLimit?: number
  paymentTerms?: string
  creditHold?: boolean
  creditHoldReason?: string
  taxNumber?: string
  notes?: string
}

const CUSTOMER_FIELDS = CUSTOMER_IMPORT_FIELDS
const SAMPLE_ROWS = CUSTOMER_SAMPLE_ROWS

const CUSTOMER_TYPES = ['retail', 'wholesale', 'vip', 'corporate']

export function CustomerImportDialog({ open, onOpenChange, onImport }: CustomerImportDialogProps) {
  const { t } = useLanguage()
  const location = useContactLocation()
  // Wholesale / distributor: re-importing an older list adds City / State / Country to the
  // customers already saved and changes nothing else on them — the safe default.
  const [pickedStrategy, setDuplicateStrategy] = useState<DuplicateStrategy | null>(null)
  const duplicateStrategy: DuplicateStrategy = pickedStrategy ?? (location.enabled ? 'location' : 'skip')
  const importFields = useMemo(() => withLocationFields(CUSTOMER_FIELDS, location.enabled), [location.enabled])
  const sampleRows = useMemo(
    () => withLocationSample(SAMPLE_ROWS, location.enabled, location.defaultCountry),
    [location.enabled, location.defaultCountry],
  )
  const [openingBalanceDate, setOpeningBalanceDate] = useState<string>(() => getBusinessToday())
  const { hasPermission } = usePermissions()
  const canManageCredit = hasPermission('manageCreditLimits')

  const buildRow = useCallback(
    (values: Record<string, CellValue>): BuiltRow<ImportCustomer> => {
      const name = parseText(values.name)
      if (!name) return { error: t('Customer name is empty') }

      const customer: ImportCustomer = { name }
      const warnings: string[] = []

      const phone = parseText(values.phone, { code: true })
      if (phone) customer.phone = phone
      const whatsapp = parseText(values.whatsapp, { code: true })
      // Most shops keep one number for both; filling WhatsApp in from the phone saves a
      // column and makes reminders work for imported customers straight away.
      customer.whatsapp = whatsapp || phone || undefined

      const email = parseText(values.email)
      if (email) {
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          customer.email = email
        } else {
          // Never worth losing a customer over — the row imports without the address.
          warnings.push(t('Email "{{value}}" does not look valid and was left out', { value: email }))
        }
      }

      const address = parseText(values.address)
      if (address) customer.address = address
      if (location.enabled) Object.assign(customer, readLocationCells(values))
      const taxNumber = parseText(values.taxNumber, { code: true })
      if (taxNumber) customer.taxNumber = taxNumber
      const notes = parseText(values.notes)
      if (notes) customer.notes = notes
      const nameUrdu = parseText(values.nameUrdu)
      if (nameUrdu) customer.nameUrdu = nameUrdu

      const balance = parseNumeric(values.balance)
      if (!balance.empty) {
        if (balance.ok) customer.balance = balance.value
        else return { error: t('Opening balance "{{value}}" is not a number', { value: balance.raw }) }
      }

      const creditLimit = parseNumeric(values.creditLimit)
      if (!creditLimit.empty) {
        if (creditLimit.ok && creditLimit.value >= 0) customer.creditLimit = creditLimit.value
        else warnings.push(t('Credit limit "{{value}}" was ignored', { value: creditLimit.raw }))
      }

      const terms = parsePaymentTermsText(parseText(values.paymentTerms))
      if (terms.value) customer.paymentTerms = terms.value
      else if (terms.invalid) {
        warnings.push(t('Payment terms "{{value}}" not recognised (Cash, Due on receipt, Net 15, Net 30, Net 60) — left out', { value: parseText(values.paymentTerms) }))
      }

      const hold = parseYesNoText(parseText(values.creditHold))
      if (hold === null) warnings.push(t('Credit hold "{{value}}" should be Yes or No — left out', { value: parseText(values.creditHold) }))
      else if (hold !== undefined) customer.creditHold = hold
      const holdReason = parseText(values.creditHoldReason)
      if (holdReason) customer.creditHoldReason = holdReason

      if (!canManageCredit && (customer.creditLimit !== undefined || customer.creditHold !== undefined)) {
        warnings.push(t('Credit limit / hold will be left unchanged — you are not allowed to manage credit limits'))
        delete customer.creditLimit
        delete customer.creditHold
        delete customer.creditHoldReason
      }

      const customerType = parseText(values.customerType).toLowerCase()
      if (customerType) {
        if (CUSTOMER_TYPES.includes(customerType)) customer.customerType = customerType
        else warnings.push(t('Customer type "{{value}}" is not one of retail/wholesale/vip/corporate and was left out', { value: customerType }))
      }

      return { value: customer, warning: warnings.length ? warnings.join('; ') : undefined }
    },
    [t, canManageCredit, location.enabled]
  )

  const importBatch = useCallback(
    async (items: ImportCustomer[]): Promise<ImportBatchOutcome> => {
      const result = (await onImport(items, { duplicateStrategy, openingBalanceDate })) || {}
      const notes: string[] = []
      if (result.updatedCount) {
        notes.push(
          duplicateStrategy === 'location'
            ? t('City / State / Country added to {{count}} existing customers', { count: result.updatedCount })
            : t('{{count}} existing customers were updated', { count: result.updatedCount }),
        )
      }
      return {
        insertedCount: (result.insertedCount || 0) + (result.updatedCount || 0),
        errors: result.errors,
        skipped: result.skipped?.map((skip) => ({ index: skip.index, reason: skip.reason })),
        warnings: result.warnings?.map((warning) => ({ index: warning.index, message: warning.message })),
        notes,
      }
    },
    [onImport, duplicateStrategy, openingBalanceDate, t]
  )

  const duplicateKeys = useMemo(
    () => [
      { label: t('phone number'), get: (item: ImportCustomer) => item.phone?.replace(/\D/g, '').slice(-10) || undefined },
      { label: t('email'), get: (item: ImportCustomer) => item.email || undefined },
    ],
    [t]
  )

  return (
    <ExcelImportDialog<ImportCustomer>
      open={open}
      onOpenChange={onOpenChange}
      title={t('Import Customers from Excel')}
      description={t('Upload your customer list. Columns are matched automatically — you can check and change them before importing.')}
      entityPlural={t('customers')}
      fields={importFields}
      sampleRows={sampleRows}
      templateFileName='customers-import-template.xlsx'
      templateSheetName='Customers'
      buildRow={buildRow}
      importBatch={importBatch}
      duplicateKeys={duplicateKeys}
      options={
        <div className='space-y-1.5'>
          <Label className='text-sm'>{t('If a customer is already saved')}</Label>
          <Select value={duplicateStrategy} onValueChange={(value) => setDuplicateStrategy(value as DuplicateStrategy)}>
            <SelectTrigger className='h-8 w-full sm:w-[400px]'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {location.enabled && (
                <SelectItem value='location'>{t('Add City / State / Country only (change nothing else)')}</SelectItem>
              )}
              <SelectItem value='skip'>{t('Skip them (keep what is already saved)')}</SelectItem>
              <SelectItem value='update'>{t('Update their details — contact, credit limit, terms, hold (balance is not changed)')}</SelectItem>
              <SelectItem value='error'>{t('Report them as problem rows')}</SelectItem>
            </SelectContent>
          </Select>
          <p className='text-xs text-muted-foreground'>
            {t('Customers are matched by phone number, then email, then name.')}
          </p>
          {duplicateStrategy === 'location' && (
            <p className='text-xs text-muted-foreground'>
              {t('Imported before City / State / Country existed? Import the same file again with those columns added — saved customers only get their location filled in. Names, phones, balances and credit stay as they are; new customers in the file are added.')}
            </p>
          )}
          <p className='text-xs text-muted-foreground'>
            {t('Tip: Export Excel on the Customers page gives a file in this layout — change limits there and import it back with "Update their details".')}
          </p>
          <div className='space-y-1.5 pt-2'>
            <Label className='text-sm'>{t('Opening balance date')}</Label>
            <DatePicker
              value={openingBalanceDate}
              onChange={(value) => setOpeningBalanceDate(value || getBusinessToday())}
              max={getBusinessToday()}
              className='h-8 w-full sm:w-[200px]'
            />
            <p className='text-xs text-muted-foreground'>
              {t('Opening balances are dated this day in the ledger (e.g. the 1st of the month your books start).')}
            </p>
          </div>
        </div>
      }
      renderPreview={(customer) => (
        <>
          <div className='font-medium'>
            {customer.name}
            {customer.nameUrdu && (
              <span className='font-normal text-muted-foreground'>
                {' · '}
                <span dir='auto'>{customer.nameUrdu}</span>
              </span>
            )}
          </div>
          <div className='text-muted-foreground'>
            {[customer.phone, customer.email, customer.address, locationPreview(customer)].filter(Boolean).join(' · ') || t('No contact details')}
            {customer.balance ? ` · ${t('Balance')}: ${customer.balance}` : ''}
            {customer.creditLimit !== undefined ? ` · ${t('Limit')}: ${customer.creditLimit || t('none')}` : ''}
            {customer.paymentTerms ? ` · ${t(PAYMENT_TERM_LABELS[customer.paymentTerms])}` : ''}
            {customer.creditHold ? ` · ${t('On credit hold')}` : ''}
          </div>
        </>
      )}
    />
  )
}
