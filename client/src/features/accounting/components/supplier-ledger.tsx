import { useState } from 'react';
import { SupplierLedgerList } from './supplier-ledger-list';
import { SupplierLedgerDetails } from './supplier-ledger-details';
import { useLanguage } from '@/context/language-context';

export function SupplierLedger() {
  const { t } = useLanguage();
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [view, setView] = useState<'list' | 'details'>('list');

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
