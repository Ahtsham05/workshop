import { useState, useCallback } from 'react';
import { ExpenseList } from './expense-list';
import { ExpenseForm } from './expense-form';
import { ExpenseCategorySection } from './expense-category-section';
import { ExpenseCategoriesDialog } from './expense-categories-dialog';
import { ExpenseImportDialog } from './expense-import-dialog';
import { ExpenseVoucherDialog } from './expense-voucher-dialog';
import { Button } from '@/components/ui/button';
import { FileSpreadsheet, ListPlus, Plus, Tags } from 'lucide-react';
import { useLanguage } from '@/context/language-context';
import { usePermissions } from '@/context/permission-context';

type ViewMode = 'list' | 'create' | 'edit';

interface ExpenseManagementProps {
  onExpenseChange?: () => void;
}

export function ExpenseManagement({ onExpenseChange }: ExpenseManagementProps) {
  const { t } = useLanguage();
  const { hasExplicitPermission } = usePermissions();
  const canManageExpenses = hasExplicitPermission('manageExpenses');
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedExpense, setSelectedExpense] = useState<any>(null);
  const [voucherOpen, setVoucherOpen] = useState(false);

  const [defaultCategory, setDefaultCategory] = useState<string | undefined>();
  const [returnToCategory, setReturnToCategory] = useState<{ name: string; id: number } | null>(null);

  const handleCreateNew = (category?: string) => {
    setSelectedExpense(null);
    setDefaultCategory(category);
    setReturnToCategory(null);
    setViewMode('create');
  };

  const handleEdit = (expense: any) => {
    setSelectedExpense(expense);
    setViewMode('edit');
  };

  const handleSaveSuccess = () => {
    const categoryToReopen = defaultCategory;
    setViewMode('list');
    setSelectedExpense(null);
    setDefaultCategory(undefined);
    // The list, category totals and reports refresh through RTK Query tags — no manual
    // refresh counter (that used to fire a second, duplicate request for each of them).
    if (categoryToReopen) {
      setReturnToCategory({ name: categoryToReopen, id: Date.now() });
    }
    onExpenseChange?.();
  };

  const handleCancel = () => {
    setViewMode('list');
    setSelectedExpense(null);
    setDefaultCategory(undefined);
  };

  const handleDelete = () => {
    onExpenseChange?.();
  };

  const handleOpenCategoryHandled = useCallback(() => {
    setReturnToCategory(null);
  }, []);

  const handleCategoryUpdated = () => {
    onExpenseChange?.();
  };

  if (viewMode === 'create' || viewMode === 'edit') {
    return (
      <ExpenseForm
        expense={selectedExpense}
        defaultCategory={defaultCategory}
        onSave={handleSaveSuccess}
        onCancel={handleCancel}
        onCategoryUpdated={handleCategoryUpdated}
        isEdit={viewMode === 'edit'}
      />
    );
  }

  return (
    <div className="space-y-6 max-sm:space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight max-sm:text-xl">{t('Expense Management')}</h2>
          <p className="text-muted-foreground max-sm:text-sm">{t('Track and manage business expenses')}</p>
        </div>
        {/* Phones: Categories | Import, then Voucher | Add Expense — two per row. */}
        <div className="flex flex-wrap items-center gap-2 max-sm:grid max-sm:w-full max-sm:grid-cols-2">
          <Button variant="outline" onClick={() => setCategoriesOpen(true)}>
            <Tags className="h-4 w-4 mr-2" />
            {t('Categories')}
          </Button>
          {canManageExpenses && (
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              {t('Import')}
            </Button>
          )}
          {canManageExpenses && (
            <Button variant="outline" onClick={() => setVoucherOpen(true)} title={t('Record several expenses paid from one account in one go')}>
              <ListPlus className="h-4 w-4 mr-2" />
              {t('Expense Voucher')}
            </Button>
          )}
          <Button onClick={() => handleCreateNew()}>
            <Plus className="h-4 w-4 mr-2" />
            {t('Add Expense')}
          </Button>
        </div>
      </div>

      <ExpenseCategoriesDialog
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
        canManage={canManageExpenses}
        onChanged={handleCategoryUpdated}
      />
      {canManageExpenses && (
        <ExpenseVoucherDialog
          open={voucherOpen}
          onOpenChange={setVoucherOpen}
          onSaved={() => onExpenseChange?.()}
        />
      )}
      {canManageExpenses && (
        <ExpenseImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          onImported={handleCategoryUpdated}
        />
      )}

      <ExpenseCategorySection
        onAddExpense={handleCreateNew}
        openCategoryRequest={returnToCategory}
        onOpenCategoryHandled={handleOpenCategoryHandled}
      />

      <ExpenseList
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    </div>
  );
}
