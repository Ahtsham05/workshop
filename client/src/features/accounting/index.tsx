import { useState, useEffect } from 'react';
import { useSearch } from '@tanstack/react-router';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Receipt,
  Users,
  Building2,
  BarChart3,
  Wallet,
  CalendarClock,
} from 'lucide-react';
import { ExpenseManagement } from './components/expense-management';
import { CustomerLedger } from './components/customer-ledger';
import { SupplierLedger } from './components/supplier-ledger';
import { AccountsDashboard } from './components/accounts-dashboard';
import { PersonalLedger } from './components/personal-ledger';
import { RecurringExpenseManager } from './components/recurring-expense-manager';
import { useLanguage } from '@/context/language-context';
import { fetchAndStashPrintContact } from '@/features/invoice/utils/invoice-print-contact-bridge';
import { store } from '@/stores/store';
import { customerApi } from '@/stores/customer.api';
import Axios from '@/utils/Axios';
import summery from '@/utils/summery';
import { usePermissions } from '@/context/permission-context';
import { useMenuVisibility } from '@/hooks/use-hidden-modules';
import { isPathHiddenForBusiness } from '@/lib/business-types';

export default function AccountingPage() {
  const { t } = useLanguage();
  const { hasPermission } = usePermissions();
  const searchParams = useSearch({ strict: false }) as any;
  const [initialCustomer, setInitialCustomer] = useState<any>(null);
  const [initialSupplier, setInitialSupplier] = useState<any>(null);
  const [initialLedgerEntry, setInitialLedgerEntry] = useState<string | undefined>(undefined);
  const [expenseRefreshTrigger, setExpenseRefreshTrigger] = useState(0);

  // Customer/Supplier Ledger are reachable with just viewCustomers/viewSuppliers, not
  // the full viewAccounting — everything else on this page (Dashboard, Expenses,
  // Recurring, My Account) stays viewAccounting-only.
  // A tab switched off in Settings → Menu & Pages is hidden here too.
  const { businessType, overrides } = useMenuVisibility();
  const tabOn = (tab: string) => !isPathHiddenForBusiness(businessType, `/accounting?tab=${tab}`, overrides);
  const canDashboard = hasPermission('viewAccounting') && tabOn('dashboard');
  const canExpenses = (hasPermission('viewAccounting') || hasPermission('manageExpenses')) && tabOn('expenses');
  const canCustomers = (hasPermission('viewAccounting') || hasPermission('viewCustomers')) && tabOn('customers');
  const canSuppliers = (hasPermission('viewAccounting') || hasPermission('viewSuppliers')) && tabOn('suppliers');
  const canRecurring = (hasPermission('viewAccounting') || hasPermission('manageExpenses')) && tabOn('recurring');
  const canWallet = (hasPermission('viewAccounting') || hasPermission('managePersonalWallet')) && tabOn('wallet');
  const tabAllowed: Record<string, boolean> = {
    dashboard: canDashboard,
    expenses: canExpenses,
    customers: canCustomers,
    suppliers: canSuppliers,
    recurring: canRecurring,
    wallet: canWallet,
  };
  const defaultTab = ['dashboard', 'customers', 'suppliers', 'expenses', 'recurring', 'wallet'].find((tab) => tabAllowed[tab]) ?? 'dashboard';

  // Determine active tab from search params or default to the first tab this role can see
  const activeTab = searchParams?.tab === 'customer-ledger' && searchParams?.customerId
    ? 'customers'
    : searchParams?.tab === 'supplier-ledger' && searchParams?.supplierId
    ? 'suppliers'
    : searchParams?.tab && tabAllowed[searchParams.tab]
    ? searchParams.tab
    : defaultTab;

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
      // Links from reminders, reloads etc. may carry only the id — load the real record so the
      // header and prints show the customer's actual name (not the 'Customer' placeholder).
      store
        .dispatch(customerApi.endpoints.getCustomerById.initiate(customerId))
        .unwrap()
        .then((c: any) => {
          if (!c?.name) return;
          setInitialCustomer((prev: any) =>
            prev?._id === customerId ? { ...prev, ...c, _id: customerId } : prev,
          );
        })
        .catch(() => {});
      fetchAndStashPrintContact(customerId).catch(() => {});
    } else if (searchParams?.tab === 'supplier-ledger' && searchParams?.supplierId) {
      console.log('Opening supplier ledger for:', searchParams.supplierName);
      setManualTab(null); // Reset manual tab to allow URL params to control
      setInitialLedgerEntry(searchParams.ledgerEntry as string | undefined);
      const supplierId = searchParams.supplierId as string;
      setInitialSupplier({
        _id: supplierId,
        name: searchParams.supplierName || 'Supplier'
      });
      Axios.get(`${summery.fetchSuppliers.url}/${supplierId}`)
        .then(({ data }) => {
          if (!data?.name) return;
          setInitialSupplier((prev: any) =>
            prev?._id === supplierId ? { ...prev, ...data, _id: supplierId } : prev,
          );
        })
        .catch(() => {});
    } else {
      setInitialCustomer(null);
      setInitialSupplier(null);
      setInitialLedgerEntry(undefined);
    }
  }, [searchParams?.tab, searchParams?.customerId, searchParams?.customerName, searchParams?.supplierId, searchParams?.supplierName, searchParams?.ledgerEntry]);

  return (
    <div className="h-full w-full p-4 space-y-6 max-sm:space-y-4 max-sm:p-0">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight max-sm:text-2xl">{t('Accounts')}</h1>
          <p className="text-muted-foreground mt-2 max-sm:mt-1 max-sm:text-sm">
            {t('Manage expenses, customer and supplier ledgers')}
          </p>
        </div>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={manualTab || activeTab} onValueChange={setManualTab} className="space-y-6 max-sm:space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 lg:w-fit">
          {canDashboard && (
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">{t('Dashboard')}</span>
            </TabsTrigger>
          )}
          {canExpenses && (
            <TabsTrigger value="expenses" className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              <span className="hidden sm:inline">{t('Expenses')}</span>
            </TabsTrigger>
          )}
          {canCustomers && (
            <TabsTrigger value="customers" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">{t('Customers')}</span>
            </TabsTrigger>
          )}
          {canSuppliers && (
            <TabsTrigger value="suppliers" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">{t('Suppliers')}</span>
            </TabsTrigger>
          )}
          {canRecurring && (
            <TabsTrigger value="recurring" className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4" />
              <span className="hidden sm:inline">{t('Recurring')}</span>
            </TabsTrigger>
          )}
          {canWallet && (
            <TabsTrigger value="wallet" className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              <span className="hidden sm:inline">{t('My Personal Account')}</span>
            </TabsTrigger>
          )}
        </TabsList>

        {/* Dashboard Tab */}
        {canDashboard && (
          <TabsContent value="dashboard">
            <AccountsDashboard refreshTrigger={expenseRefreshTrigger} />
          </TabsContent>
        )}

        {/* Expenses Tab */}
        {canExpenses && (
          <TabsContent value="expenses">
            <ExpenseManagement onExpenseChange={() => setExpenseRefreshTrigger(prev => prev + 1)} />
          </TabsContent>
        )}

        {/* Customer Ledger Tab */}
        {canCustomers && (
          <TabsContent value="customers">
            <CustomerLedger initialCustomer={initialCustomer} initialLedgerEntry={initialLedgerEntry} />
          </TabsContent>
        )}

        {/* Supplier Ledger Tab */}
        {canSuppliers && (
          <TabsContent value="suppliers">
            <SupplierLedger initialSupplier={initialSupplier} initialLedgerEntry={initialLedgerEntry} />
          </TabsContent>
        )}

        {/* Recurring Expenses Tab */}
        {canRecurring && (
          <TabsContent value="recurring">
            <RecurringExpenseManager />
          </TabsContent>
        )}

        {/* Personal Wallet Tab */}
        {canWallet && (
          <TabsContent value="wallet">
            <PersonalLedger />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
