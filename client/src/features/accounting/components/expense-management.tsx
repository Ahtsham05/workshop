import { useState } from 'react';
import { ExpenseList } from './expense-list';
import { ExpenseForm } from './expense-form';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useLanguage } from '@/context/language-context';

type ViewMode = 'list' | 'create' | 'edit';

export function ExpenseManagement() {
  const { t } = useLanguage();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedExpense, setSelectedExpense] = useState<any>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleCreateNew = () => {
    setSelectedExpense(null);
    setViewMode('create');
  };

  const handleEdit = (expense: any) => {
    setSelectedExpense(expense);
    setViewMode('edit');
  };

  const handleSaveSuccess = () => {
    setViewMode('list');
    setSelectedExpense(null);
    setRefreshTrigger(prev => prev + 1);
  };

  const handleCancel = () => {
    setViewMode('list');
    setSelectedExpense(null);
  };

  const handleDelete = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  if (viewMode === 'create' || viewMode === 'edit') {
    return (
      <ExpenseForm
        expense={selectedExpense}
        onSave={handleSaveSuccess}
        onCancel={handleCancel}
        isEdit={viewMode === 'edit'}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('Expense Management')}</h2>
          <p className="text-muted-foreground">{t('Track and manage business expenses')}</p>
        </div>
        <Button onClick={handleCreateNew}>
          <Plus className="h-4 w-4 mr-2" />
          {t('Add Expense')}
        </Button>
      </div>

      <ExpenseList
        onEdit={handleEdit}
        onDelete={handleDelete}
        refreshTrigger={refreshTrigger}
      />
    </div>
  );
}
