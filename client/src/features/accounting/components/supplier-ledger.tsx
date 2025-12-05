import { useState, useEffect } from 'react';
import { SupplierLedgerList } from './supplier-ledger-list';
import { SupplierLedgerDetails } from './supplier-ledger-details';
import { useLanguage } from '@/context/language-context';

interface SupplierLedgerProps {
  initialSupplier?: any;
}

export function SupplierLedger({ initialSupplier }: SupplierLedgerProps) {
  const { t } = useLanguage();
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [view, setView] = useState<'list' | 'details'>('list');

  useEffect(() => {
    console.log('SupplierLedger received initialSupplier:', initialSupplier);
    if (initialSupplier && initialSupplier._id) {
      console.log('Setting selected supplier:', initialSupplier);
      setSelectedSupplier(initialSupplier);
      setView('details');
    }
  }, [initialSupplier, initialSupplier?._id]);

  const handleSelectSupplier = (supplier: any) => {
    setSelectedSupplier(supplier);
    setView('details');
  };

  const handleBack = () => {
    setSelectedSupplier(null);
    setView('list');
  };

  if (view === 'details' && selectedSupplier) {
    return (
      <SupplierLedgerDetails
        supplier={selectedSupplier}
        onBack={handleBack}
      />
    );
  }

  return <SupplierLedgerList onSelectSupplier={handleSelectSupplier} />;
}
