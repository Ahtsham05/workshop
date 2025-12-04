import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Download
} from 'lucide-react';
import { format } from 'date-fns';
import { useLanguage } from '@/context/language-context';
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

interface ExpenseListProps {
  onEdit: (expense: any) => void;
  onDelete: () => void;
  refreshTrigger?: number;
}

const expenseCategories = ['All', 'Rent', 'Utilities', 'Salaries', 'Transportation', 'Marketing', 'Supplies', 'Maintenance', 'Insurance', 'Tax', 'Other'];

export function ExpenseList({ onEdit, onDelete, refreshTrigger }: ExpenseListProps) {
  const { t } = useLanguage();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<any>(null);

  useEffect(() => {
    loadExpenses();
  }, [currentPage, selectedCategory, searchTerm, refreshTrigger]);

  const loadExpenses = async () => {
    try {
      setLoading(true);

      const params: any = {
        page: currentPage,
        limit: 10,
        sortBy: 'date:desc',
      };

      if (searchTerm) {
        params.search = searchTerm;
      }

      if (selectedCategory && selectedCategory !== 'All') {
        params.category = selectedCategory;
      }

      const response = await Axios({
        ...summery.fetchExpenses,
        params,
      });

      setExpenses(response.data?.results || []);
      setTotalPages(response.data?.totalPages || 1);
    } catch (error) {
      console.error('Error loading expenses:', error);
      toast.error(t('Failed to load expenses'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!expenseToDelete) return;

    try {
      await Axios({
        ...summery.deleteExpense,
        url: `${summery.deleteExpense.url}/${expenseToDelete.id}`,
      });

      toast.success(t('Expense deleted successfully'));
      setDeleteDialogOpen(false);
      setExpenseToDelete(null);
      onDelete();
      loadExpenses();
    } catch (error: any) {
      console.error('Error deleting expense:', error);
      toast.error(error?.response?.data?.message || t('Failed to delete expense'));
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      Rent: 'bg-blue-100 text-blue-800',
      Utilities: 'bg-green-100 text-green-800',
      Salaries: 'bg-purple-100 text-purple-800',
      Transportation: 'bg-yellow-100 text-yellow-800',
      Marketing: 'bg-pink-100 text-pink-800',
      Supplies: 'bg-indigo-100 text-indigo-800',
      Maintenance: 'bg-orange-100 text-orange-800',
      Insurance: 'bg-cyan-100 text-cyan-800',
      Tax: 'bg-red-100 text-red-800',
      Other: 'bg-gray-100 text-gray-800',
    };
    return colors[category] || 'bg-gray-100 text-gray-800';
  };

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
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div className="space-y-2">
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
            <div className="space-y-2">
              <Label>{t('Category')}</Label>
              <Select
                value={selectedCategory}
                onValueChange={(value) => {
                  setSelectedCategory(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger>
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

            {/* Clear Filters */}
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedCategory('All');
                  setCurrentPage(1);
                }}
                className="w-full"
              >
                <Filter className="h-4 w-4 mr-2" />
                {t('Clear Filters')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Expenses Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('Expense List')}</CardTitle>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              {t('Export')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Date')}</TableHead>
                  <TableHead>{t('Category')}</TableHead>
                  <TableHead>{t('Description')}</TableHead>
                  <TableHead>{t('Vendor')}</TableHead>
                  <TableHead>{t('Amount')}</TableHead>
                  <TableHead>{t('Payment Method')}</TableHead>
                  <TableHead className="text-right">{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {t('No expenses found')}
                    </TableCell>
                  </TableRow>
                ) : (
                  expenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {format(new Date(expense.date), 'MMM dd, yyyy')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getCategoryColor(expense.category)}>
                          {t(expense.category)}
                        </Badge>
                      </TableCell>
                      <TableCell>{expense.description}</TableCell>
                      <TableCell>{expense.vendor || '-'}</TableCell>
                      <TableCell className="font-semibold">
                        Rs {expense.amount.toFixed(2)}
                      </TableCell>
                      <TableCell>{t(expense.paymentMethod)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onEdit(expense)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
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
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                {t('Page')} {currentPage} {t('of')} {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  {t('Previous')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  {t('Next')}
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
