import { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { CustomerLedgerList } from './customer-ledger-list';
import { CustomerLedgerDetails } from './customer-ledger-details';
import { getStoredSelectedCustomer, storeSelectedCustomer } from '../utils/ledger-selection-storage';
// import { useLanguage } from '@/context/language-context';s

interface CustomerLedgerProps {
  initialCustomer?: any;
  initialLedgerEntry?: string;
}

export function CustomerLedger({ initialCustomer, initialLedgerEntry }: CustomerLedgerProps) {
  // const { t } = useLanguage();
  const navigate = useNavigate();
  const [selectedCustomer, setSelectedCustomer] = useState<any>(() => getStoredSelectedCustomer());
  const [view, setView] = useState<'list' | 'details'>(() => (getStoredSelectedCustomer() ? 'details' : 'list'));
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    console.log('CustomerLedger received initialCustomer:', initialCustomer);
    if (initialCustomer && initialCustomer._id) {
      console.log('Setting selected customer:', initialCustomer);
      setSelectedCustomer(initialCustomer);
      setView('details');
      storeSelectedCustomer(initialCustomer);
    }
  }, [initialCustomer, initialCustomer?._id]);

  const handleSelectCustomer = (customer: any) => {
    setSelectedCustomer(customer);
    setView('details');
    storeSelectedCustomer(customer);
    // Persist selection in the URL so it survives navigating away and back
    navigate({
      to: '/accounting',
      search: (prev: any) => ({
        ...prev,
        tab: 'customer-ledger',
        customerId: customer._id,
        customerName: customer.name,
      }),
      replace: true,
    });
  };

  const handleBack = () => {
    setSelectedCustomer(null);
    setView('list');
    storeSelectedCustomer(null);
    // Trigger refresh of customer list
    setRefreshKey(prev => prev + 1);
    navigate({
      to: '/accounting',
      search: (prev: any) => ({
        ...prev,
        tab: 'customers',
        customerId: undefined,
        customerName: undefined,
        ledgerEntry: undefined,
      }),
      replace: true,
    });
  };

  if (view === 'details' && selectedCustomer) {
    return (
      <CustomerLedgerDetails
        customer={selectedCustomer}
        onBack={handleBack}
        initialLedgerEntry={initialLedgerEntry}
      />
    );
  }

  return <CustomerLedgerList key={refreshKey} onSelectCustomer={handleSelectCustomer} />;
}
