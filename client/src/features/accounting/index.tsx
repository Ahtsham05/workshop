import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Receipt, 
  Users, 
  Building2, 
  BarChart3
} from 'lucide-react';
import { ExpenseManagement } from './components/expense-management';
import { CustomerLedger } from './components/customer-ledger';
import { SupplierLedger } from './components/supplier-ledger';
import { AccountsDashboard } from './components/accounts-dashboard';
import { useLanguage } from '@/context/language-context';

export default function AccountingPage() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="h-full w-full p-4 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('Accounting')}</h1>
          <p className="text-muted-foreground mt-2">
            {t('Manage expenses, customer and supplier ledgers')}
          </p>
        </div>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
          <TabsTrigger value="dashboard" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">{t('Dashboard')}</span>
          </TabsTrigger>
          <TabsTrigger value="expenses" className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            <span className="hidden sm:inline">{t('Expenses')}</span>
          </TabsTrigger>
          <TabsTrigger value="customers" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">{t('Customers')}</span>
          </TabsTrigger>
          <TabsTrigger value="suppliers" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">{t('Suppliers')}</span>
          </TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard">
          <AccountsDashboard />
        </TabsContent>

        {/* Expenses Tab */}
        <TabsContent value="expenses">
          <ExpenseManagement />
        </TabsContent>

        {/* Customer Ledger Tab */}
        <TabsContent value="customers">
          <CustomerLedger />
        </TabsContent>

        {/* Supplier Ledger Tab */}
        <TabsContent value="suppliers">
          <SupplierLedger />
        </TabsContent>
      </Tabs>
    </div>
  );
}
