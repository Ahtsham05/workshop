/**
 * Import expense categories from a spreadsheet — a thin configuration over
 * the shared ExcelImportDialog, which handles the file itself (header
 * detection, column matching, batching, partial success, per-row reporting).
 */

import { useCallback, useMemo } from 'react';
import {
  ExcelImportDialog,
  type BuiltRow,
  type ImportBatchOutcome,
} from '@/components/excel-import-dialog';
import {
  parseText,
  withCommonAliases,
  type CellValue,
  type ImportFieldSpec,
} from '@/lib/excel-import';
import { useCreateFeeCategoriesBulkMutation } from '@/stores/school.api';
import { nextCategoryColor } from './category-combobox';

interface ImportExpenseCategory {
  name: string;
  type: 'EXPENSE';
  color: string;
  description?: string;
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const CATEGORY_FIELDS: ImportFieldSpec[] = [
  withCommonAliases({
    key: 'name',
    label: 'Category Name',
    required: true,
    width: 30,
    aliases: ['Category', 'Expense Category', 'Category Name'],
  }),
  { key: 'color', label: 'Color', width: 12, aliases: ['Colour', 'Hex', 'Hex Color'] },
  withCommonAliases({ key: 'description', label: 'Description', width: 30 }),
];

const SAMPLE_ROWS = [
  { name: 'Electricity Bill', color: '#eab308', description: 'Monthly utility bill' },
  { name: 'Stationery', color: '#ec4899', description: '' },
];

export function ExpenseCategoryImportDialog({
  open,
  onOpenChange,
  existingCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingCount: number;
}) {
  const [createBulk] = useCreateFeeCategoriesBulkMutation();

  const buildRow = useCallback(
    (values: Record<string, CellValue>, { excelRow }: { excelRow: number }): BuiltRow<ImportExpenseCategory> => {
      const name = parseText(values.name);
      if (!name) return { error: 'Category name is empty' };
      const colorRaw = parseText(values.color);
      // Rows that don't specify their own color still get a distinct one instead
      // of all collapsing onto the same default swatch.
      const color = HEX_COLOR_RE.test(colorRaw) ? colorRaw : nextCategoryColor(existingCount + excelRow);
      const description = parseText(values.description);
      return { value: { name, type: 'EXPENSE', color, description: description || undefined } };
    },
    [existingCount]
  );

  const importBatch = useCallback(
    async (items: ImportExpenseCategory[]): Promise<ImportBatchOutcome> => {
      const result = await createBulk({ categories: items }).unwrap();
      return {
        insertedCount: result?.created?.length ?? 0,
        // The server skips names that already exist for this org/branch rather
        // than duplicating them — those come back listed with the rows that
        // weren't imported.
        skipped: result?.skipped?.map((s: { index?: number; name: string }) => ({
          index: s.index,
          reason: `"${s.name}" already exists`,
        })),
      };
    },
    [createBulk]
  );

  const duplicateKeys = useMemo(
    () => [{ label: 'name', get: (item: ImportExpenseCategory) => item.name }],
    []
  );

  return (
    <ExcelImportDialog<ImportExpenseCategory>
      open={open}
      onOpenChange={onOpenChange}
      title="Import Expense Categories from Excel"
      description="Upload a list of expense categories. Names that already exist are left as they are."
      entityPlural="expense categories"
      fields={CATEGORY_FIELDS}
      sampleRows={SAMPLE_ROWS}
      templateFileName="expense-categories-import-template.xlsx"
      templateSheetName="Categories"
      buildRow={buildRow}
      importBatch={importBatch}
      duplicateKeys={duplicateKeys}
      renderPreview={(category) => (
        <div className="flex items-center gap-2 font-medium">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
          {category.name}
          {category.description && (
            <span className="font-normal text-muted-foreground">· {category.description}</span>
          )}
        </div>
      )}
    />
  );
}
