import { useState, useEffect } from 'react';
import { useSearch } from '@tanstack/react-router';
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
  const searchParams = useSearch({ strict: false }) as any;
  const [initialCustomer, setInitialCustomer] = useState<any>(null);
  const [initialSupplier, setInitialSupplier] = useState<any>(null);

  // Determine active tab from search params or default to dashboard
  const activeTab = searchParams?.tab === 'customer-ledger' && searchParams?.customerId 
    ? 'customers' 
    : searchParams?.tab === 'supplier-ledger' && searchParams?.supplierId 
    ? 'suppliers' 
    : 'dashboard';

  const [manualTab, setManualTab] = useState<string | null>(null);

  useEffect(() => {
    console.log('Search params received:', searchParams);
    
    if (searchParams?.tab === 'customer-ledger' && searchParams?.customerId) {
      console.log('Opening customer ledger for:', searchParams.customerName);
      setManualTab(null); // Reset manual tab to allow URL params to control
      setInitialCustomer({ 
        _id: searchParams.customerId, 
        name: searchParams.customerName || 'Customer'
      });
    } else if (searchParams?.tab === 'supplier-ledger' && searchParams?.supplierId) {
      console.log('Opening supplier ledger for:', searchParams.supplierName);
      setManualTab(null); // Reset manual tab to allow URL params to control
      setInitialSupplier({ 
        _id: searchParams.supplierId, 
        name: searchParams.supplierName || 'Supplier'
      });
    } else {
      setInitialCustomer(null);
      setInitialSupplier(null);
    }
  }, [searchParams?.tab, searchParams?.customerId, searchParams?.customerName, searchParams?.supplierId, searchParams?.supplierName]);

  return (
    <div className="h-full w-full p-4 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('Accounts')}</h1>
          <p className="text-muted-foreground mt-2">
            {t('Manage expenses, customer and supplier ledgers')}
          </p>
        </div>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={manualTab || activeTab} onValueChange={setManualTab} className="space-y-6">
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
          <CustomerLedger initialCustomer={initialCustomer} />
        </TabsContent>

        {/* Supplier Ledger Tab */}
        <TabsContent value="suppliers">
          <SupplierLedger initialSupplier={initialSupplier} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
