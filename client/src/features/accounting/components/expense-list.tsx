import { DEFAULT_PAGE_SIZE_OPTIONS, formatPageSize } from '@/lib/page-size'
import { usePersistedPageSize } from '@/hooks/use-persisted-page-size'
import { useState } from 'react';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useDeleteExpenseMutation, useGetExpensesQuery, type ExpenseRecord } from '@/stores/expense.api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import * as XLSX from 'xlsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  Filter,
  Edit,
  Trash2,
  Calendar,
  Download,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { useLanguage } from '@/context/language-context';
import { usePermissions } from '@/context/permission-context';
import { toast } from 'sonner';
import Axios from '@/utils/Axios';
import summery from '@/utils/summery';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useGetExpenseCategoriesQuery, type ExpenseNature } from '@/stores/expenseCategory.api';
import { ExpenseNatureBadge } from './expense-nature';
import { ExpenseCategoryChip } from './expense-category-icon';
import { EXPENSE_IMPORT_FIELDS } from './expense-import-dialog';
import { CreatedByCell, useCanViewCreatedBy } from '@/components/created-by-cell';
import { useFormatMoney } from '@/lib/format-money';
import { formatAppDate } from '@/lib/date-format'

interface ExpenseListProps {
  onEdit: (expense: any) => void;
  onDelete: () => void;
  /** @deprecated The list refreshes itself through RTK Query tags; kept for old callers. */
  refreshTrigger?: number;
}

export function ExpenseList({ onEdit, onDelete }: ExpenseListProps) {
  const formatMoney = useFormatMoney();
  const { t } = useLanguage();
  const { hasExplicitPermission } = usePermissions();
  const canManageExpenses = hasExplicitPermission('manageExpenses');
  const canViewCreatedBy = useCanViewCreatedBy();
  const { data: categoryData = [] } = useGetExpenseCategoriesQuery({
    transactionType: 'business_expense',
  });
  const categories = Array.isArray(categoryData) ? categoryData : [];
  const expenseCategories = ['All', ...categories.map((c) => c.name)];
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedNature, setSelectedNature] = useState<'all' | ExpenseNature>('all');
  const [exporting, setExporting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = usePersistedPageSize('expenses', 10);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<any>(null);

  // One request once typing pauses — not one per keystroke (each new search string also
  // costs a CORS preflight, so this halves the traffic twice over).
  const debouncedSearch = useDebouncedValue(searchTerm.trim(), 350);
  const { data, isLoading, isFetching, isError } = useGetExpensesQuery(
    {
      page: currentPage,
      limit: pageSize,
      sortBy: 'date:desc',
      search: debouncedSearch || undefined,
      category: selectedCategory !== 'All' ? selectedCategory : undefined,
      expenseNature: selectedNature !== 'all' ? selectedNature : undefined,
    },
    // Coming back from Add/Edit within 30s reuses the cached page; saves invalidate it anyway.
    { refetchOnMountOrArgChange: 30 },
  );
  const expenses: ExpenseRecord[] = data?.results ?? [];
  const totalPages = data?.totalPages || 1;
  const totalResults = data?.totalResults || 0;
  const loading = isLoading;
  const [deleteExpense] = useDeleteExpenseMutation();

  // Every row matching the filters (not just this page), in the same column layout the
  // Import dialog reads — so an exported file can be edited and imported straight back.
  const exportToExcel = async () => {
    try {
      setExporting(true);
      const params: Record<string, string | number> = { page: 1, limit: 5000, sortBy: 'date:desc' };
      if (searchTerm) params.search = searchTerm;
      if (selectedCategory && selectedCategory !== 'All') params.category = selectedCategory;
      if (selectedNature !== 'all') params.expenseNature = selectedNature;
      const response = await Axios({ ...summery.fetchExpenses, params });
      const rows: Array<{
        expenseNumber?: string; date: string; category: string; expenseNature?: ExpenseNature; description?: string
        amount?: number; paymentMethod?: string; walletType?: string; vendor?: string; reference?: string
        notes?: string; isPaid?: boolean
      }> = response.data?.results || [];
      if (rows.length === 0) {
        toast.error(t('No data available to export'));
        return;
      }
      const label = (key: string) => EXPENSE_IMPORT_FIELDS.find((f) => f.key === key)?.label || key;
      const data = rows.map((expense) => ({
        'Expense No': expense.expenseNumber || '',
        [label('date')]: formatAppDate(new Date(expense.date)),
        [label('category')]: expense.category,
        [label('expenseNature')]: expense.expenseNature === 'direct' ? 'Direct' : 'Indirect',
        [label('description')]: expense.description,
        [label('amount')]: Number(expense.amount || 0),
        [label('paymentMethod')]: expense.paymentMethod === 'Wallet' && expense.walletType ? expense.walletType : expense.paymentMethod,
        [label('vendor')]: expense.vendor || '',
        [label('reference')]: expense.reference || '',
        [label('notes')]: expense.notes || '',
        Status: expense.isPaid === false ? 'Unpaid' : 'Paid',
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Expenses');
      XLSX.writeFile(wb, `expenses-${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success(t('Data exported successfully'));
    } catch (error) {
      console.error('Export error:', error);
      toast.error(t('Failed to export data'));
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    if (!expenseToDelete) return;

    try {
      await deleteExpense(expenseToDelete.id).unwrap();

      toast.success(t('Expense deleted successfully'));
      setDeleteDialogOpen(false);
      setExpenseToDelete(null);
      onDelete();
    } catch (error: any) {
      console.error('Error deleting expense:', error);
      toast.error(error?.data?.message || error?.response?.data?.message || t('Failed to delete expense'));
    }
  };

  // Each category's own colour (set in Expense Categories) — not a fixed table that only
  // knew the old default names and left every other category grey.
  const colorByCategory = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.color]));
  const categoryColor = (name: string) => colorByCategory.get(String(name || '').trim().toLowerCase());

  if (loading && expenses.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">{t('Loading expenses...')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="max-sm:py-4">
        <CardContent className="pt-6 max-sm:px-3 max-sm:pt-0">
          {/* Phones: search full width, category | per page side by side, clear below. */}
          <div className="flex flex-col md:flex-row items-end gap-3 max-sm:grid max-sm:grid-cols-2 max-sm:gap-2">
            {/* Search */}
            <div className="flex-1 w-full space-y-2 max-sm:col-span-2">
              <Label>{t('Search')}</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('Search expenses...')}
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Category Filter */}
            <div className="w-full md:w-48 space-y-2">
              <Label>{t('Category')}</Label>
              <Select
                value={selectedCategory}
                onValueChange={(value) => {
                  setSelectedCategory(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {expenseCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {t(cat)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Direct / Indirect */}
            <div className="w-full md:w-40 space-y-2">
              <Label>{t('Type')}</Label>
              <Select
                value={selectedNature}
                onValueChange={(value) => {
                  setSelectedNature(value as 'all' | ExpenseNature);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('All')}</SelectItem>
                  <SelectItem value="direct">{t('Direct')}</SelectItem>
                  <SelectItem value="indirect">{t('Indirect')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Records per page */}
            <div className="w-full md:w-40 space-y-2">
              <Label className="max-sm:truncate">{t('Records per page')}</Label>
              <Select value={pageSize.toString()} onValueChange={(value) => { setPageSize(Number(value)); setCurrentPage(1); }}>
                <SelectTrigger className='w-full'>
                  <SelectValue>{formatPageSize(pageSize)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {DEFAULT_PAGE_SIZE_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>{formatPageSize(n)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Clear Filters Button */}
            <Button
              variant="outline"
              onClick={() => {
                setSearchTerm('');
                setSelectedCategory('All');
                setSelectedNature('all');
                setCurrentPage(1);
              }}
              className="w-full md:w-auto max-sm:col-span-2"
            >
              <Filter className="h-4 w-4 mr-2" />
              {t('Clear Filters')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Expenses Table */}
      <Card className="max-sm:gap-4 max-sm:py-4">
        <CardHeader className="max-sm:px-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle>{t('Expense List')}</CardTitle>
            <Button variant="outline" size="sm" onClick={exportToExcel} disabled={exporting}>
              <Download className="h-4 w-4 mr-2 max-sm:mr-1.5" />
              <span className="max-sm:hidden">{t('Export to Excel')}</span>
              <span className="sm:hidden">{t('Excel')}</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className={`max-sm:px-3 transition-opacity ${isFetching && !isLoading ? 'opacity-60' : ''}`} aria-busy={isFetching}>
          {isError && (
            <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {t('Failed to load expenses')}
            </p>
          )}
          {/* Phones: one compact card per expense — the 9-column table needs ~1000px. */}
          <div className="divide-y rounded-lg border sm:hidden">
            {expenses.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">{t('No expenses found')}</div>
            ) : (
              expenses.map((expense) => (
                <div key={expense.id} className="space-y-1.5 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <ExpenseCategoryChip name={expense.category} color={categoryColor(expense.category)} />
                        <ExpenseNatureBadge nature={expense.expenseNature} compact />
                      </div>
                      {expense.description ? (
                        <p className="text-sm font-medium leading-snug break-words">{expense.description}</p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold tabular-nums">{formatMoney(expense.amount)}</p>
                      {expense.isPaid === false ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
                          <Clock className="h-3 w-3" />
                          {t('Pending')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700">
                          <CheckCircle2 className="h-3 w-3" />
                          {t('Paid')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Calendar className="h-3 w-3" />
                        {formatAppDate(new Date(expense.date))}
                      </span>
                      {expense.expenseNumber ? <span className="font-mono">· {expense.expenseNumber}</span> : null}
                      {expense.vendor ? <span className="break-all">· {expense.vendor}</span> : null}
                      {expense.paymentMethod ? <span>· {t(expense.paymentMethod)}</span> : null}
                    </div>
                    {canManageExpenses && (
                      <div className="-mr-2 flex shrink-0 items-center">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => onEdit(expense)} aria-label={t('Edit')}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          aria-label={t('Delete')}
                          onClick={() => {
                            setExpenseToDelete(expense);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {canViewCreatedBy && expense.createdBy ? (
                    <div className="text-xs text-muted-foreground">
                      <CreatedByCell createdBy={expense.createdBy} />
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
          <div className="overflow-x-auto max-sm:hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Expense No')}</TableHead>
                  <TableHead>{t('Date')}</TableHead>
                  <TableHead>{t('Category')}</TableHead>
                  <TableHead>{t('Type')}</TableHead>
                  <TableHead>{t('Description')}</TableHead>
                  <TableHead>{t('Vendor')}</TableHead>
                  <TableHead>{t('Amount')}</TableHead>
                  <TableHead>{t('Payment Method')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  {canViewCreatedBy && <TableHead>{t('created_by') || 'Created By'}</TableHead>}
                  <TableHead className="text-right">{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canViewCreatedBy ? 11 : 10} className="text-center py-8 text-muted-foreground">
                      {t('No expenses found')}
                    </TableCell>
                  </TableRow>
                ) : (
                  expenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {expense.expenseNumber || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {formatAppDate(new Date(expense.date))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <ExpenseCategoryChip name={expense.category} color={categoryColor(expense.category)} />
                      </TableCell>
                      <TableCell>
                        <ExpenseNatureBadge nature={expense.expenseNature} compact />
                      </TableCell>
                      <TableCell>{expense.description}</TableCell>
                      <TableCell>{expense.vendor || '-'}</TableCell>
                      <TableCell className="font-semibold">
                        {formatMoney(expense.amount)}
                      </TableCell>
                      <TableCell>{t(expense.paymentMethod)}</TableCell>
                      <TableCell>
                        {expense.isPaid === false ? (
                          <Badge className="bg-amber-100 text-amber-800 flex items-center gap-1 w-fit">
                            <Clock className="h-3 w-3" />
                            {t('Pending')}
                          </Badge>
                        ) : (
                          <Badge className="bg-green-100 text-green-800 flex items-center gap-1 w-fit">
                            <CheckCircle2 className="h-3 w-3" />
                            {t('Paid')}
                          </Badge>
                        )}
                      </TableCell>
                      {canViewCreatedBy && (
                        <TableCell>
                          <CreatedByCell createdBy={expense.createdBy} />
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {canManageExpenses && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onEdit(expense)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          )}
                          {canManageExpenses && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setExpenseToDelete(expense);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 max-sm:flex-col max-sm:items-stretch max-sm:gap-2">
              <div className="text-sm text-gray-600 max-sm:text-center">
                {t('Showing')} {(currentPage - 1) * pageSize + 1} {t('to')} {Math.min(currentPage * pageSize, totalResults)} {t('of')} {totalResults} {t('expenses')}
              </div>
              <div className="flex gap-2 max-sm:w-full max-sm:flex-wrap max-sm:justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                >
                  {t('First')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  {t('Previous')}
                </Button>
                <div className="flex items-center gap-2 px-3">
                  <span className="text-sm text-gray-600">
                    {t('Page')} {currentPage} {t('of')} {totalPages}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  {t('Next')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                >
                  {t('Last')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Delete Expense')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('Are you sure you want to delete this expense? This action cannot be undone.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">
              {t('Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
