import { useState, useEffect } from 'react';
import { CustomerLedgerList } from './customer-ledger-list';
import { CustomerLedgerDetails } from './customer-ledger-details';
// import { useLanguage } from '@/context/language-context';s

interface CustomerLedgerProps {
  initialCustomer?: any;
}

export function CustomerLedger({ initialCustomer }: CustomerLedgerProps) {
  // const { t } = useLanguage();
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [view, setView] = useState<'list' | 'details'>('list');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    console.log('CustomerLedger received initialCustomer:', initialCustomer);
    if (initialCustomer && initialCustomer._id) {
      console.log('Setting selected customer:', initialCustomer);
      setSelectedCustomer(initialCustomer);
      setView('details');
    }
  }, [initialCustomer, initialCustomer?._id]);

  const handleSelectCustomer = (customer: any) => {
    setSelectedCustomer(customer);
    setView('details');
  };

  const handleBack = () => {
    setSelectedCustomer(null);
    setView('list');
    // Trigger refresh of customer list
    setRefreshKey(prev => prev + 1);
  };

  if (view === 'details' && selectedCustomer) {
    return (
      <CustomerLedgerDetails
        customer={selectedCustomer}
        onBack={handleBack}
      />
    );
  }

  return <CustomerLedgerList key={refreshKey} onSelectCustomer={handleSelectCustomer} />;
}
