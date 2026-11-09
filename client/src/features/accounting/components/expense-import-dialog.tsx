/**
 * Import expenses from Excel/CSV — a configuration over the shared ExcelImportDialog
 * (header detection, column matching, batching, partial success, per-row reporting),
 * the same engine the Customer and Supplier imports use.
 *
 * Every row is saved by the server through the same path as the Add Expense form, so a
 * paid row moves Cash in Hand / the bank account and posts to the Chart of Accounts
 * exactly like a manual entry. "Record as unpaid" loads history without moving money.
 */

import { useCallback, useMemo, useState } from 'react'
import { useDispatch } from 'react-redux'
import { Checkbox } from '@/components/ui/checkbox'
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
import { parseDate, parseNumeric, parseText, type CellValue, type ImportFieldSpec } from '@/lib/excel-import'
import { useLanguage } from '@/context/language-context'
import { useFormatMoney } from '@/lib/format-money'
import type { AppDispatch } from '@/stores/store'
import { expenseCategoryApi } from '@/stores/expenseCategory.api'
import { invalidateAfterImport, useImportExpensesBatchMutation, type BulkExpenseImportResult } from '@/stores/expense.api'
import { ExpenseNatureBadge } from './expense-nature'

export interface ImportExpense {
  date?: string
  category: string
  expenseNature?: string
  description?: string
  amount: number
  paymentMethod?: string
  vendor?: string
  reference?: string
  notes?: string
}

type DuplicateStrategy = 'skip' | 'error' | 'allow'
type PaymentStatus = 'paid' | 'unpaid'

export const EXPENSE_IMPORT_FIELDS: ImportFieldSpec[] = [
  { key: 'date', label: 'Date', type: 'date', width: 14, aliases: ['Expense Date', 'Bill Date', 'Voucher Date', 'Txn Date', 'Tareekh', 'تاریخ'] },
  {
    key: 'category',
    label: 'Category',
    required: true,
    width: 24,
    aliases: ['Expense Category', 'Expense Head', 'Head', 'Account Head', 'Ledger', 'Kharcha', 'مد', 'کیٹیگری'],
  },
  {
    key: 'expenseNature',
    label: 'Type (Direct/Indirect)',
    width: 20,
    aliases: ['Type', 'Expense Type', 'Nature', 'Direct/Indirect', 'Direct or Indirect', 'Classification', 'Group'],
  },
  { key: 'description', label: 'Description', width: 32, aliases: ['Details', 'Particulars', 'Narration', 'Detail', 'تفصیل'] },
  { key: 'amount', label: 'Amount', type: 'number', required: true, width: 14, aliases: ['Amount Paid', 'Expense Amount', 'Total', 'Rs', 'PKR', 'Debit', 'Raqam', 'رقم'] },
  {
    key: 'paymentMethod',
    label: 'Paid From',
    width: 18,
    aliases: ['Payment Method', 'Paid Via', 'Paid By', 'Payment Mode', 'Mode', 'Account Paid From', 'Bank', 'Cash/Bank'],
  },
  { key: 'vendor', label: 'Vendor', width: 20, aliases: ['Paid To', 'Payee', 'Supplier', 'Party'] },
  { key: 'reference', label: 'Reference', type: 'code', width: 16, aliases: ['Ref', 'Ref No', 'Bill No', 'Receipt No', 'Invoice No', 'Voucher No'] },
  { key: 'notes', label: 'Notes', width: 24, aliases: ['Remarks', 'Note', 'Comment', 'Comments'] },
]

export const EXPENSE_SAMPLE_ROWS = [
  { date: '2026-11-01', category: 'Rent', expenseNature: 'Indirect', description: 'Shop rent November', amount: 45000, paymentMethod: 'Cash', vendor: 'Landlord', reference: 'RENT-11', notes: '' },
  { date: '2026-11-03', category: 'Freight & Carriage Inward', expenseNature: 'Direct', description: 'Truck charges for stock from Lahore', amount: 6500, paymentMethod: 'Cash', vendor: 'Daewoo Cargo', reference: 'GRN-221', notes: '' },
  { date: '2026-11-05', category: 'Utilities', expenseNature: 'Indirect', description: 'Electricity bill', amount: 18250, paymentMethod: 'Meezan Bank', vendor: 'LESCO', reference: 'LESCO-1125', notes: 'Paid online' },
]

const NATURE_WORDS = /^(direct|indirect|in-direct|operating|admin|administrative|overhead|office|selling|general|trading|manufacturing|production|factory|cost of sales|cogs)/i

const toYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function ExpenseImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported?: () => void
}) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const dispatch = useDispatch<AppDispatch>()
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>('skip')
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('paid')
  const [createMissingCategories, setCreateMissingCategories] = useState(true)
  const [importBatchMutation] = useImportExpensesBatchMutation()

  const buildRow = useCallback(
    (values: Record<string, CellValue>): BuiltRow<ImportExpense> => {
      const category = parseText(values.category)
      if (!category) return { error: t('Category is empty') }

      const amount = parseNumeric(values.amount)
      if (amount.empty) return { error: t('Amount is empty') }
      if (!amount.ok) return { error: t('Amount "{{value}}" is not a number', { value: amount.raw }) }
      if (amount.value <= 0) return { error: t('Amount must be more than 0') }

      const item: ImportExpense = { category, amount: Math.round(amount.value * 100) / 100 }
      const warnings: string[] = []

      const date = parseDate(values.date)
      if (!date.empty) {
        if (!date.ok || !date.value) return { error: t('Date "{{value}}" is not a valid date', { value: String(values.date) }) }
        if (date.value.getTime() > Date.now() + 86400000) warnings.push(t('Date is in the future'))
        // Calendar day only — the server stamps it on that business day.
        item.date = toYmd(date.value)
      }

      const nature = parseText(values.expenseNature)
      if (nature) {
        if (NATURE_WORDS.test(nature)) item.expenseNature = nature
        else warnings.push(t('Type "{{value}}" should be Direct or Indirect — left out', { value: nature }))
      }

      const description = parseText(values.description)
      if (description) item.description = description
      const paidFrom = parseText(values.paymentMethod)
      if (paidFrom) item.paymentMethod = paidFrom
      const vendor = parseText(values.vendor)
      if (vendor) item.vendor = vendor
      const reference = parseText(values.reference, { code: true })
      if (reference) item.reference = reference
      const notes = parseText(values.notes)
      if (notes) item.notes = notes

      return { value: item, warning: warnings.length ? warnings.join('; ') : undefined }
    },
    [t],
  )

  const importBatch = useCallback(
    async (items: ImportExpense[]): Promise<ImportBatchOutcome> => {
      const result: BulkExpenseImportResult = await importBatchMutation({
        expenses: items,
        duplicateStrategy,
        paymentStatus,
        createMissingCategories,
      }).unwrap()
      const notes: string[] = []
      if (result.insertedCount) {
        notes.push(
          t('Imported {{total}} — Direct {{direct}}, Indirect {{indirect}}', {
            total: formatMoney(result.totalAmount || 0),
            direct: formatMoney(result.directAmount || 0),
            indirect: formatMoney(result.indirectAmount || 0),
          }),
        )
      }
      if (result.createdCategories?.length) {
        notes.push(t('New categories created: {{names}}', { names: result.createdCategories.join(', ') }))
      }
      if (paymentStatus === 'unpaid' && result.insertedCount) {
        notes.push(t('Saved as unpaid — pay them from the expense list when the money goes out'))
      }
      return {
        insertedCount: result.insertedCount || 0,
        errors: result.errors,
        skipped: result.skipped?.map((s) => ({ index: s.index, reason: s.reason })),
        warnings: result.warnings?.map((w) => ({ index: w.index, message: w.message })),
        notes,
      }
    },
    [importBatchMutation, duplicateStrategy, paymentStatus, createMissingCategories, formatMoney, t],
  )

  const handleImported = useCallback(() => {
    // Once per import (not per batch): new categories, the list, reports, cash and banks.
    dispatch(expenseCategoryApi.util.invalidateTags([{ type: 'ExpenseCategory', id: 'business_expense' }]))
    void invalidateAfterImport(dispatch)
    onImported?.()
  }, [dispatch, onImported])

  const duplicateKeys = useMemo(
    () => [
      { label: t('reference'), get: (item: ImportExpense) => item.reference?.trim().toLowerCase() || undefined },
    ],
    [t],
  )

  return (
    <ExcelImportDialog<ImportExpense>
      open={open}
      onOpenChange={onOpenChange}
      title={t('Import Expenses from Excel')}
      description={t('Upload your expense sheet. Columns are matched automatically — you can check and change them before importing.')}
      entityPlural={t('expenses')}
      fields={EXPENSE_IMPORT_FIELDS}
      sampleRows={EXPENSE_SAMPLE_ROWS}
      templateFileName='expenses-import-template.xlsx'
      templateSheetName='Expenses'
      buildRow={buildRow}
      importBatch={importBatch}
      // Each row posts cash book + journal entries server-side, so keep requests small.
      batchSize={100}
      duplicateKeys={duplicateKeys}
      onImported={handleImported}
      options={
        <div className='grid gap-3 sm:grid-cols-2'>
          <div className='space-y-1.5'>
            <Label className='text-sm'>{t('Payment')}</Label>
            <Select value={paymentStatus} onValueChange={(v) => setPaymentStatus(v as PaymentStatus)}>
              <SelectTrigger className='h-8 w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='paid'>{t('Paid — take the money out of Cash / bank (like Add Expense)')}</SelectItem>
                <SelectItem value='unpaid'>{t('Unpaid — record only, pay them later')}</SelectItem>
              </SelectContent>
            </Select>
            <p className='text-muted-foreground text-xs'>
              {paymentStatus === 'paid'
                ? t('"Paid From" can be Cash or the exact name of one of your bank/wallet accounts. Empty means Cash.')
                : t('Use this for old expenses already reflected in your opening cash and bank balances.')}
            </p>
          </div>
          <div className='space-y-1.5'>
            <Label className='text-sm'>{t('If the same expense is already saved')}</Label>
            <Select value={duplicateStrategy} onValueChange={(v) => setDuplicateStrategy(v as DuplicateStrategy)}>
              <SelectTrigger className='h-8 w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='skip'>{t('Skip it (safe to re-import the same file)')}</SelectItem>
                <SelectItem value='error'>{t('Report it as a problem row')}</SelectItem>
                <SelectItem value='allow'>{t('Import it again anyway')}</SelectItem>
              </SelectContent>
            </Select>
            <p className='text-muted-foreground text-xs'>
              {t('Matched by Reference; rows without one by date + category + amount + description.')}
            </p>
          </div>
          <label className='flex cursor-pointer items-start gap-2 text-sm sm:col-span-2'>
            <Checkbox
              checked={createMissingCategories}
              onCheckedChange={(v) => setCreateMissingCategories(v === true)}
              className='mt-0.5'
            />
            <span>
              {t('Create categories that do not exist yet')}
              <span className='text-muted-foreground block text-xs'>
                {t('New ones take their type from the "Type (Direct/Indirect)" column — Indirect when empty. Existing categories keep their own type.')}
              </span>
            </span>
          </label>
        </div>
      }
      renderPreview={(item) => {
        const nature = item.expenseNature && /^direct|^trading|^manufactur|^production|^factory|^cost of sales|^cogs/i.test(item.expenseNature)
          ? 'direct'
          : item.expenseNature
            ? 'indirect'
            : null
        return (
          <>
            <div className='flex flex-wrap items-center gap-1.5 font-medium'>
              <span>{item.category}</span>
              {nature && <ExpenseNatureBadge nature={nature} compact />}
              <span className='ml-auto tabular-nums'>{formatMoney(item.amount)}</span>
            </div>
            <div className='text-muted-foreground'>
              {[item.date, item.description, item.paymentMethod || t('Cash'), item.vendor, item.reference].filter(Boolean).join(' · ')}
            </div>
          </>
        )
      }}
    />
  )
}
