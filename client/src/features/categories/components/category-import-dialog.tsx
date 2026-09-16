/**
 * Import categories from a spreadsheet — a thin configuration over the shared
 * ExcelImportDialog, which handles the file itself (header detection, column matching,
 * batching, partial success, per-row reporting).
 */

import { useCallback, useMemo } from 'react'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { bulkAddCategories } from '@/stores/category.slice'
import { useLanguage } from '@/context/language-context'
import { useCategories } from '../context/categories-context'
import {
  ExcelImportDialog,
  type BuiltRow,
  type ImportBatchOutcome,
} from '@/components/excel-import-dialog'
import {
  parseText,
  withCommonAliases,
  type CellValue,
  type ImportFieldSpec,
} from '@/lib/excel-import'

interface CategoryImportDialogProps {
  setFetch: (updater: (prev: boolean) => boolean) => void
}

/** A row the server chose not to import (e.g. the name already exists). */
interface ImportWarning {
  index?: number
  message: string
}

interface ImportCategory {
  name: string
  nameUrdu?: string
}

const CATEGORY_FIELDS: ImportFieldSpec[] = [
  withCommonAliases({
    key: 'name',
    label: 'Category Name',
    required: true,
    width: 30,
    aliases: ['Category', 'Group', 'Department', 'کیٹیگری'],
  }),
  withCommonAliases({ key: 'nameUrdu', label: 'Name (Urdu)', width: 25 }),
]

const SAMPLE_ROWS = [
  { name: 'Mobile Accessories', nameUrdu: 'موبائل لوازمات' },
  { name: 'Electronics', nameUrdu: '' },
]

export function CategoryImportDialog({ setFetch }: CategoryImportDialogProps) {
  const { state, dispatch: contextDispatch } = useCategories()
  const reduxDispatch = useDispatch<AppDispatch>()
  const { t } = useLanguage()

  const buildRow = useCallback(
    (values: Record<string, CellValue>): BuiltRow<ImportCategory> => {
      const name = parseText(values.name)
      if (!name) return { error: t('Category name is empty') }
      const category: ImportCategory = { name }
      const nameUrdu = parseText(values.nameUrdu)
      if (nameUrdu) category.nameUrdu = nameUrdu
      return { value: category }
    },
    [t]
  )

  const importBatch = useCallback(
    async (items: ImportCategory[]): Promise<ImportBatchOutcome> => {
      const result = await reduxDispatch(bulkAddCategories({ categories: items })).unwrap()
      return {
        insertedCount: result?.insertedCount ?? 0,
        errors: result?.errors,
        // The server skips names that already exist rather than duplicating them — those
        // come back as warnings and are listed with the rows that weren't imported.
        skipped: result?.warnings?.map((warning: ImportWarning) => ({ index: warning.index, reason: warning.message })),
      }
    },
    [reduxDispatch]
  )

  const duplicateKeys = useMemo(
    () => [{ label: t('name'), get: (item: ImportCategory) => item.name }],
    [t]
  )

  return (
    <ExcelImportDialog<ImportCategory>
      open={state.importOpen}
      onOpenChange={(next) => contextDispatch({ type: 'SET_IMPORT_OPEN', payload: next })}
      title={t('Import Categories from Excel')}
      description={t('Upload a list of categories. Names that already exist are left as they are.')}
      entityPlural={t('categories')}
      fields={CATEGORY_FIELDS}
      sampleRows={SAMPLE_ROWS}
      templateFileName='categories-import-template.xlsx'
      templateSheetName='Categories'
      buildRow={buildRow}
      importBatch={importBatch}
      duplicateKeys={duplicateKeys}
      onImported={() => setFetch((prev) => !prev)}
      renderPreview={(category) => (
        <div className='font-medium'>
          {category.name}
          {category.nameUrdu && (
            <span className='font-normal text-muted-foreground'>
              {' · '}
              <span dir='rtl'>{category.nameUrdu}</span>
            </span>
          )}
        </div>
      )}
    />
  )
}
