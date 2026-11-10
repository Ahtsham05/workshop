/**
 * Import expense CATEGORIES from Excel/CSV — a list of names, optionally with Type
 * (Direct/Indirect), Account Code, Colour, Note and Status. A thin configuration over the
 * shared ExcelImportDialog (header detection, column matching, batching, per-row report).
 *
 * The Expenses import also accepts category-only rows (blank / 0 amount); this one is for
 * setting up or maintaining the category list itself, including updating existing ones.
 */

import { useCallback, useMemo, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ExcelImportDialog, type BuiltRow, type ImportBatchOutcome } from '@/components/excel-import-dialog'
import { parseText, type CellValue, type ImportFieldSpec } from '@/lib/excel-import'
import { useLanguage } from '@/context/language-context'
import { useImportExpenseCategoriesMutation } from '@/stores/expenseCategory.api'
import { ExpenseCategoryIcon } from './expense-category-icon'
import { ExpenseNatureBadge } from './expense-nature'

interface ImportCategory {
  name: string
  expenseNature?: string
  accountCode?: string
  color?: string
  description?: string
  isActive?: string
}

type DuplicateStrategy = 'skip' | 'update' | 'error'

export const EXPENSE_CATEGORY_IMPORT_FIELDS: ImportFieldSpec[] = [
  {
    key: 'name',
    label: 'Category Name',
    required: true,
    width: 28,
    aliases: ['Category', 'Name', 'Expense Category', 'Expense Head', 'Head', 'Account Head', 'Ledger', 'Ledger Name', 'Expense', 'Kharcha', 'مد', 'کیٹیگری'],
  },
  {
    key: 'expenseNature',
    label: 'Type (Direct/Indirect)',
    width: 20,
    aliases: ['Type', 'Expense Type', 'Nature', 'Direct/Indirect', 'Direct or Indirect', 'Classification', 'Group'],
  },
  { key: 'accountCode', label: 'Account Code', type: 'code', width: 14, aliases: ['Account', 'Code', 'GL Code', 'Ledger Code', 'Posting Account'] },
  { key: 'color', label: 'Colour', width: 12, aliases: ['Color', 'Hex', 'Hex Colour', 'Hex Color'] },
  { key: 'description', label: 'Note', width: 32, aliases: ['Description', 'Notes', 'Remarks', 'Details'] },
  { key: 'isActive', label: 'Status', width: 12, aliases: ['Active', 'Active?', 'Enabled', 'State'] },
]

export const EXPENSE_CATEGORY_SAMPLE_ROWS = [
  { name: 'Rent', expenseNature: 'Indirect', accountCode: '', color: '#3b82f6', description: 'Shop / office rent', isActive: 'Active' },
  { name: 'Freight & Carriage Inward', expenseNature: 'Direct', accountCode: '', color: '#d97706', description: 'Bringing stock in', isActive: 'Active' },
  { name: 'Utilities', expenseNature: 'Indirect', accountCode: '', color: '#f59e0b', description: '', isActive: 'Active' },
]

const NATURE_WORDS = /^(direct|indirect|in-direct|operating|admin|administrative|overhead|office|selling|general|trading|manufacturing|production|factory|cost of sales|cogs)/i
const DIRECT_WORDS = /^(direct|trading|manufactur|production|factory|cost of sales|cogs)/i
const HEX = /^#[0-9a-f]{6}$/i

export function ExpenseCategoryListImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported?: () => void
}) {
  const { t } = useLanguage()
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>('skip')
  const [importCategories] = useImportExpenseCategoriesMutation()

  const buildRow = useCallback(
    (values: Record<string, CellValue>): BuiltRow<ImportCategory> => {
      const name = parseText(values.name).replace(/\s+/g, ' ')
      if (!name) return { error: t('Category name is empty') }
      if (name.length > 80) return { error: t('Category name is longer than 80 characters') }
      const item: ImportCategory = { name }
      const warnings: string[] = []

      const nature = parseText(values.expenseNature)
      if (nature) {
        if (NATURE_WORDS.test(nature)) item.expenseNature = nature
        else warnings.push(t('Type "{{value}}" should be Direct or Indirect — left out', { value: nature }))
      }
      const code = parseText(values.accountCode, { code: true })
      if (code) item.accountCode = code
      const color = parseText(values.color)
      if (color) {
        const hex = color.startsWith('#') ? color : `#${color}`
        if (HEX.test(hex)) item.color = hex
        else warnings.push(t('Colour "{{value}}" is not a #RRGGBB colour — one will be picked', { value: color }))
      }
      const description = parseText(values.description)
      if (description) item.description = description
      const status = parseText(values.isActive)
      if (status) item.isActive = status

      return { value: item, warning: warnings.length ? warnings.join('; ') : undefined }
    },
    [t],
  )

  const importBatch = useCallback(
    async (items: ImportCategory[]): Promise<ImportBatchOutcome> => {
      const result = await importCategories({ categories: items, duplicateStrategy }).unwrap()
      const notes: string[] = []
      if (result.updatedCount) notes.push(t('{{count}} existing categories were updated', { count: result.updatedCount }))
      if (result.reclassifiedExpenses) {
        notes.push(t('{{count}} saved expenses moved with their category’s new type', { count: result.reclassifiedExpenses }))
      }
      return {
        insertedCount: (result.insertedCount || 0) + (result.updatedCount || 0),
        errors: result.errors,
        skipped: result.skipped?.map((s) => ({ index: s.index, reason: s.reason })),
        warnings: result.warnings?.map((w) => ({ index: w.index, message: w.message })),
        notes,
      }
    },
    [importCategories, duplicateStrategy, t],
  )

  const duplicateKeys = useMemo(
    () => [{ label: t('name'), get: (item: ImportCategory) => item.name.trim().toLowerCase() || undefined }],
    [t],
  )

  return (
    <ExcelImportDialog<ImportCategory>
      open={open}
      onOpenChange={onOpenChange}
      title={t('Import Expense Categories')}
      description={t('Upload a list of category names — just a Name column is enough. Type, Account Code, Colour, Note and Status are optional.')}
      entityPlural={t('categories')}
      fields={EXPENSE_CATEGORY_IMPORT_FIELDS}
      sampleRows={EXPENSE_CATEGORY_SAMPLE_ROWS}
      templateFileName='expense-categories-template.xlsx'
      templateSheetName='Categories'
      buildRow={buildRow}
      importBatch={importBatch}
      batchSize={200}
      duplicateKeys={duplicateKeys}
      onImported={onImported}
      options={
        <div className='space-y-1.5'>
          <Label className='text-sm'>{t('If a category is already saved')}</Label>
          <Select value={duplicateStrategy} onValueChange={(v) => setDuplicateStrategy(v as DuplicateStrategy)}>
            <SelectTrigger className='h-8 w-full sm:w-[360px]'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='skip'>{t('Skip it (keep what is saved)')}</SelectItem>
              <SelectItem value='update'>{t('Update it — type, account, colour, note, status')}</SelectItem>
              <SelectItem value='error'>{t('Report it as a problem row')}</SelectItem>
            </SelectContent>
          </Select>
          <p className='text-muted-foreground text-xs'>
            {duplicateStrategy === 'update'
              ? t('Matched by name. Changing a category’s type also moves its saved expenses, as when you edit it by hand. Empty cells leave that detail unchanged.')
              : t('Matched by name, ignoring capitals and extra spaces. Empty Type means Indirect.')}
          </p>
          <p className='text-muted-foreground text-xs'>
            {t('Tip: Export in the Categories window gives a file in this layout — edit it and import it back with "Update".')}
          </p>
        </div>
      }
      renderPreview={(item) => (
        <div className='flex items-center gap-2'>
          <ExpenseCategoryIcon name={item.name} color={item.color} size='sm' className='h-6 w-6' />
          <span className='font-medium'>{item.name}</span>
          <ExpenseNatureBadge nature={item.expenseNature && DIRECT_WORDS.test(item.expenseNature) ? 'direct' : 'indirect'} compact />
          {item.accountCode && <span className='text-muted-foreground text-xs'>{t('Account')} {item.accountCode}</span>}
          {item.isActive && /^(inactive|no|n|false|0|off|disabled?|retired)$/i.test(item.isActive) && (
            <span className='text-muted-foreground text-xs'>{t('Inactive')}</span>
          )}
        </div>
      )}
    />
  )
}
