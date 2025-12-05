import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  // DollarSign, 
  TrendingUp, 
  TrendingDown,
  Users, 
  Building2, 
  Receipt,
  Wallet,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { useLanguage } from '@/context/language-context';
import Axios from '@/utils/Axios';
import summery from '@/utils/summery';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';

interface DashboardStats {
  totalExpenses: number;
  monthlyExpenses: number;
  totalReceivables: number;
  totalPayables: number;
  expensesByCategory: Array<{ category: string; amount: number }>;
  expenseTrends: Array<{ month: string; amount: number }>;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

export function AccountsDashboard() {
  const { t } = useLanguage();
  const [stats, setStats] = useState<DashboardStats>({
    totalExpenses: 0,
    monthlyExpenses: 0,
    totalReceivables: 0,
    totalPayables: 0,
    expensesByCategory: [],
    expenseTrends: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Get current month date range
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      // Fetch expense summary
      const expenseSummaryResponse = await Axios({
        ...summery.fetchExpenseSummary,
        params: {
          startDate: startOfMonth.toISOString(),
          endDate: endOfMonth.toISOString(),
        },
      });

      // Fetch expense trends
      const expenseTrendsResponse = await Axios({
        ...summery.fetchExpenseTrends,
        params: {
          startDate: new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString(),
          endDate: endOfMonth.toISOString(),
        },
      });

      // Fetch customers with balances
      const customersResponse = await Axios({
        ...summery.fetchCustomersWithBalances,
      });

      // Fetch suppliers with balances
      const suppliersResponse = await Axios({
        ...summery.fetchSuppliersWithBalances,
      });

      // Calculate totals
      const expensesByCategory = expenseSummaryResponse.data || [];
      const monthlyExpenses = expensesByCategory.reduce((sum: number, cat: any) => sum + cat.totalAmount, 0);

      const customers = customersResponse.data || [];
      const totalReceivables = customers.reduce((sum: number, customer: any) => sum + Math.max(0, customer.balance || 0), 0);

      const suppliers = suppliersResponse.data || [];
      const totalPayables = suppliers.reduce((sum: number, supplier: any) => sum + Math.max(0, supplier.balance || 0), 0);

      // Format expense trends
      const trends = (expenseTrendsResponse.data || []).map((item: any) => ({
        month: `${item._id.year}-${String(item._id.month).padStart(2, '0')}`,
        amount: item.totalAmount,
      }));

      setStats({
        totalExpenses: monthlyExpenses,
        monthlyExpenses,
        totalReceivables,
        totalPayables,
        expensesByCategory: expensesByCategory.map((cat: any) => ({
          category: cat._id,
          amount: cat.totalAmount,
        })),
        expenseTrends: trends,
      });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const netCashFlow = stats.totalReceivables - stats.totalPayables - stats.monthlyExpenses;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">{t('Loading dashboard...')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Monthly Expenses */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('Monthly Expenses')}</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Rs {stats.monthlyExpenses.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <TrendingUp className="h-3 w-3 text-red-500" />
              {t('Current month')}
            </p>
          </CardContent>
        </Card>

        {/* Total Receivables */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('Receivables')}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">Rs {stats.totalReceivables.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <ArrowUpRight className="h-3 w-3 text-green-500" />
              {t('From customers')}
            </p>
          </CardContent>
        </Card>

        {/* Total Payables */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('Payables')}</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">Rs {stats.totalPayables.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <ArrowDownRight className="h-3 w-3 text-red-500" />
              {t('To suppliers')}
            </p>
          </CardContent>
        </Card>

        {/* Net Cash Flow */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('Net Cash Flow')}</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              Rs {netCashFlow.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              {netCashFlow >= 0 ? (
                <><TrendingUp className="h-3 w-3 text-green-500" /> {t('Positive')}</>
              ) : (
                <><TrendingDown className="h-3 w-3 text-red-500" /> {t('Negative')}</>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Expenses by Category */}
        <Card>
          <CardHeader>
            <CardTitle>{t('Expenses by Category')}</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.expensesByCategory.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={stats.expensesByCategory}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry) => `${entry.category}: Rs${entry.amount.toFixed(0)}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="amount"
                  >
                    {stats.expensesByCategory.map((_,index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `Rs ${value.toFixed(2)}`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                {t('No expense data available')}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Expense Trends */}
        <Card>
          <CardHeader>
            <CardTitle>{t('Expense Trends')}</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.expenseTrends.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={stats.expenseTrends}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => `Rs ${value.toFixed(2)}`} />
                  <Legend />
                  <Line type="monotone" dataKey="amount" stroke="#8884d8" activeDot={{ r: 8 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                {t('No trend data available')}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
