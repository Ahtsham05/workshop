import { useState, useEffect } from 'react';
import { useSearch } from '@tanstack/react-router';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Receipt, 
  Users, 
  Building2, 
  BarChart3,
  Wallet
} from 'lucide-react';
import { ExpenseManagement } from './components/expense-management';
import { CustomerLedger } from './components/customer-ledger';
import { SupplierLedger } from './components/supplier-ledger';
import { AccountsDashboard } from './components/accounts-dashboard';
import { PersonalLedger } from './components/personal-ledger';
import { useLanguage } from '@/context/language-context';
import { fetchAndStashPrintContact } from '@/features/invoice/utils/invoice-print-contact-bridge';

export default function AccountingPage() {
  const { t } = useLanguage();
  const searchParams = useSearch({ strict: false }) as any;
  const [initialCustomer, setInitialCustomer] = useState<any>(null);
  const [initialSupplier, setInitialSupplier] = useState<any>(null);
  const [initialLedgerEntry, setInitialLedgerEntry] = useState<string | undefined>(undefined);
  const [expenseRefreshTrigger, setExpenseRefreshTrigger] = useState(0);

  // Determine active tab from search params or default to dashboard
  const activeTab = searchParams?.tab === 'customer-ledger' && searchParams?.customerId 
    ? 'customers' 
    : searchParams?.tab === 'supplier-ledger' && searchParams?.supplierId 
    ? 'suppliers'
    : searchParams?.tab && ['dashboard', 'expenses', 'customers', 'suppliers', 'wallet'].includes(searchParams.tab)
    ? searchParams.tab
    : 'dashboard';

  const [manualTab, setManualTab] = useState<string | null>(null);

  useEffect(() => {
    console.log('Search params received:', searchParams);
    
    if (searchParams?.tab === 'customer-ledger' && searchParams?.customerId) {
      console.log('Opening customer ledger for:', searchParams.customerName);
      setManualTab(null); // Reset manual tab to allow URL params to control
      const customerId = searchParams.customerId as string;
      setInitialLedgerEntry(searchParams.ledgerEntry as string | undefined);
      setInitialCustomer({
        _id: customerId,
        name: searchParams.customerName || 'Customer',
      });
      fetchAndStashPrintContact(customerId)
        .then((c) => {
          setInitialCustomer({
            _id: customerId,
            name: searchParams.customerName || 'Customer',
            phone: c.phone,
            whatsapp: c.whatsapp,
          });
        })
        .catch(() => {});
    } else if (searchParams?.tab === 'supplier-ledger' && searchParams?.supplierId) {
      console.log('Opening supplier ledger for:', searchParams.supplierName);
      setManualTab(null); // Reset manual tab to allow URL params to control
      setInitialLedgerEntry(searchParams.ledgerEntry as string | undefined);
      setInitialSupplier({ 
        _id: searchParams.supplierId, 
        name: searchParams.supplierName || 'Supplier'
      });
    } else {
      setInitialCustomer(null);
      setInitialSupplier(null);
      setInitialLedgerEntry(undefined);
    }
  }, [searchParams?.tab, searchParams?.customerId, searchParams?.customerName, searchParams?.supplierId, searchParams?.supplierName, searchParams?.ledgerEntry]);

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
        <TabsList className="grid w-full grid-cols-5 lg:w-[750px]">
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
          <TabsTrigger value="wallet" className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            <span className="hidden sm:inline">{t('My Wallet')}</span>
          </TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard">
          <AccountsDashboard refreshTrigger={expenseRefreshTrigger} />
        </TabsContent>

        {/* Expenses Tab */}
        <TabsContent value="expenses">
          <ExpenseManagement onExpenseChange={() => setExpenseRefreshTrigger(prev => prev + 1)} />
        </TabsContent>

        {/* Customer Ledger Tab */}
        <TabsContent value="customers">
          <CustomerLedger initialCustomer={initialCustomer} initialLedgerEntry={initialLedgerEntry} />
        </TabsContent>

        {/* Supplier Ledger Tab */}
        <TabsContent value="suppliers">
          <SupplierLedger initialSupplier={initialSupplier} initialLedgerEntry={initialLedgerEntry} />
        </TabsContent>

        {/* Personal Wallet Tab */}
        <TabsContent value="wallet">
          <PersonalLedger />
        </TabsContent>
      </Tabs>
    </div>
  );
}
