/**
 * Import suppliers from a spreadsheet — a thin configuration over the shared
 * ExcelImportDialog, which handles the file itself (header detection, column matching,
 * batching, partial success, per-row reporting).
 */

import { useCallback, useMemo, useState } from 'react'
import { useLanguage } from '@/context/language-context'
import { Label } from '@/components/ui/label'
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
import {
  parseNumeric,
  parseText,
  withCommonAliases,
  type CellValue,
  type ImportFieldSpec,
} from '@/lib/excel-import'

export interface BulkSupplierResult {
  insertedCount?: number
  updatedCount?: number
  skippedCount?: number
  errors?: Array<{ index?: number; error?: string; name?: string }>
  /** Rows deliberately left alone (already saved) — not failures. */
  skipped?: Array<{ index?: number; name?: string; reason: string }>
  /** Rows that imported, with something worth knowing (an unusable email, say). */
  warnings?: Array<{ index?: number; name?: string; message: string }>
}

export type DuplicateStrategy = 'skip' | 'update' | 'error'

interface SupplierImportDialogProps {
  open: boolean
  onClose: () => void
  onImport: (
    suppliers: ImportSupplier[],
    options?: { duplicateStrategy?: DuplicateStrategy }
  ) => Promise<BulkSupplierResult | void>
}

interface ImportSupplier {
  name: string
  nameUrdu?: string
  phone?: string
  whatsapp?: string
  email?: string
  address?: string
  balance?: number
  taxNumber?: string
}

const SUPPLIER_FIELDS: ImportFieldSpec[] = [
  withCommonAliases({
    key: 'name',
    label: 'Supplier Name',
    required: true,
    width: 28,
    aliases: ['Supplier', 'Vendor', 'Vendor Name', 'Company', 'Company Name', 'Party', 'سپلائر'],
  }),
  withCommonAliases({ key: 'nameUrdu', label: 'Name (Urdu)', width: 24 }),
  withCommonAliases({ key: 'phone', label: 'Phone', type: 'code', width: 18 }),
  withCommonAliases({ key: 'whatsapp', label: 'WhatsApp', type: 'code', width: 18 }),
  withCommonAliases({ key: 'email', label: 'Email', width: 28 }),
  withCommonAliases({ key: 'address', label: 'Address', width: 36 }),
  withCommonAliases({
    key: 'balance',
    label: 'Opening Balance',
    type: 'number',
    width: 16,
    aliases: ['Old Balance', 'Previous Balance', 'Payable', 'Due'],
  }),
  { key: 'taxNumber', label: 'Tax Number', type: 'code', width: 18, aliases: ['NTN', 'GST No', 'Tax ID', 'Sales Tax No'] },
]

const SAMPLE_ROWS = [
  {
    name: 'ABC Company',
    nameUrdu: '',
    phone: '+923001234567',
    whatsapp: '+923001234567',
    email: 'abc@example.com',
    address: '123 Main St, City',
    balance: 0,
    taxNumber: '',
  },
  {
    name: 'XYZ Suppliers',
    nameUrdu: '',
    phone: '03009876543',
    whatsapp: '',
    email: '',
    address: '456 Market Rd',
    balance: 25000,
    taxNumber: '',
  },
]

export default function SupplierImportDialog({ open, onClose, onImport }: SupplierImportDialogProps) {
  const { t } = useLanguage()
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>('skip')

  const buildRow = useCallback(
    (values: Record<string, CellValue>): BuiltRow<ImportSupplier> => {
      const name = parseText(values.name)
      if (!name) return { error: t('Supplier name is empty') }

      const supplier: ImportSupplier = { name }
      const warnings: string[] = []

      const phone = parseText(values.phone, { code: true })
      if (phone) supplier.phone = phone
      const whatsapp = parseText(values.whatsapp, { code: true })
      supplier.whatsapp = whatsapp || phone || undefined

      const email = parseText(values.email)
      if (email) {
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) supplier.email = email
        else warnings.push(t('Email "{{value}}" does not look valid and was left out', { value: email }))
      }

      const address = parseText(values.address)
      if (address) supplier.address = address
      const nameUrdu = parseText(values.nameUrdu)
      if (nameUrdu) supplier.nameUrdu = nameUrdu
      const taxNumber = parseText(values.taxNumber, { code: true })
      if (taxNumber) supplier.taxNumber = taxNumber

      const balance = parseNumeric(values.balance)
      if (!balance.empty) {
        if (balance.ok) supplier.balance = balance.value
        else return { error: t('Opening balance "{{value}}" is not a number', { value: balance.raw }) }
      }

      return { value: supplier, warning: warnings.length ? warnings.join('; ') : undefined }
    },
    [t]
  )

  const importBatch = useCallback(
    async (items: ImportSupplier[]): Promise<ImportBatchOutcome> => {
      const result = (await onImport(items, { duplicateStrategy })) || {}
      const notes: string[] = []
      if (result.updatedCount) {
        notes.push(t('{{count}} existing suppliers were updated', { count: result.updatedCount }))
      }
      return {
        insertedCount: (result.insertedCount || 0) + (result.updatedCount || 0),
        errors: result.errors,
        skipped: result.skipped?.map((skip) => ({ index: skip.index, reason: skip.reason })),
        warnings: result.warnings?.map((warning) => ({ index: warning.index, message: warning.message })),
        notes,
      }
    },
    [onImport, duplicateStrategy, t]
  )

  const duplicateKeys = useMemo(
    () => [
      { label: t('phone number'), get: (item: ImportSupplier) => item.phone?.replace(/\D/g, '').slice(-10) || undefined },
      { label: t('email'), get: (item: ImportSupplier) => item.email || undefined },
    ],
    [t]
  )

  return (
    <ExcelImportDialog<ImportSupplier>
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title={t('Import Suppliers from Excel')}
      description={t('Upload your supplier list. Columns are matched automatically — you can check and change them before importing.')}
      entityPlural={t('suppliers')}
      fields={SUPPLIER_FIELDS}
      sampleRows={SAMPLE_ROWS}
      templateFileName='suppliers-import-template.xlsx'
      templateSheetName='Suppliers'
      buildRow={buildRow}
      importBatch={importBatch}
      duplicateKeys={duplicateKeys}
      options={
        <div className='space-y-1.5'>
          <Label className='text-sm'>{t('If a supplier is already saved')}</Label>
          <Select value={duplicateStrategy} onValueChange={(value) => setDuplicateStrategy(value as DuplicateStrategy)}>
            <SelectTrigger className='h-8 w-full sm:w-[320px]'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='skip'>{t('Skip them (keep what is already saved)')}</SelectItem>
              <SelectItem value='update'>{t('Update their contact details (balance is not changed)')}</SelectItem>
              <SelectItem value='error'>{t('Report them as problem rows')}</SelectItem>
            </SelectContent>
          </Select>
          <p className='text-xs text-muted-foreground'>
            {t('Suppliers are matched by phone number, then email, then name.')}
          </p>
        </div>
      }
      renderPreview={(supplier) => (
        <>
          <div className='font-medium'>{supplier.name}</div>
          <div className='text-muted-foreground'>
            {[supplier.phone, supplier.email, supplier.address].filter(Boolean).join(' · ') || t('No contact details')}
            {supplier.balance ? ` · ${t('Balance')}: ${supplier.balance}` : ''}
          </div>
        </>
      )}
    />
  )
}
