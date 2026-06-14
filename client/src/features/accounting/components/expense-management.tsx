import { useState, useCallback } from 'react';
import { ExpenseList } from './expense-list';
import { ExpenseForm } from './expense-form';
import { ExpenseCategorySection } from './expense-category-section';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useLanguage } from '@/context/language-context';

type ViewMode = 'list' | 'create' | 'edit';

interface ExpenseManagementProps {
  onExpenseChange?: () => void;
}

export function ExpenseManagement({ onExpenseChange }: ExpenseManagementProps) {
  const { t } = useLanguage();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedExpense, setSelectedExpense] = useState<any>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

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
    setRefreshTrigger(prev => prev + 1);
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
    setRefreshTrigger(prev => prev + 1);
    onExpenseChange?.();
  };

  const handleOpenCategoryHandled = useCallback(() => {
    setReturnToCategory(null);
  }, []);

  const handleCategoryUpdated = () => {
    setRefreshTrigger((prev) => prev + 1);
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('Expense Management')}</h2>
          <p className="text-muted-foreground">{t('Track and manage business expenses')}</p>
        </div>
        <Button onClick={() => handleCreateNew()}>
          <Plus className="h-4 w-4 mr-2" />
          {t('Add Expense')}
        </Button>
      </div>

      <ExpenseCategorySection
        refreshTrigger={refreshTrigger}
        onAddExpense={handleCreateNew}
        openCategoryRequest={returnToCategory}
        onOpenCategoryHandled={handleOpenCategoryHandled}
      />

      <ExpenseList
        onEdit={handleEdit}
        onDelete={handleDelete}
        refreshTrigger={refreshTrigger}
      />
    </div>
  );
}
