import { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { SupplierLedgerList } from './supplier-ledger-list';
import { SupplierLedgerDetails } from './supplier-ledger-details';
import { getStoredSelectedSupplier, storeSelectedSupplier } from '../utils/ledger-selection-storage';
// import { useLanguage } from '@/context/language-context';

interface SupplierLedgerProps {
  initialSupplier?: any;
  initialLedgerEntry?: string;
}

export function SupplierLedger({ initialSupplier, initialLedgerEntry }: SupplierLedgerProps) {
  // const { t } = useLanguage();
  const navigate = useNavigate();
  const [selectedSupplier, setSelectedSupplier] = useState<any>(() => getStoredSelectedSupplier());
  const [view, setView] = useState<'list' | 'details'>(() => (getStoredSelectedSupplier() ? 'details' : 'list'));

  useEffect(() => {
    console.log('SupplierLedger received initialSupplier:', initialSupplier);
    if (initialSupplier && initialSupplier._id) {
      console.log('Setting selected supplier:', initialSupplier);
      setSelectedSupplier(initialSupplier);
      setView('details');
      storeSelectedSupplier(initialSupplier);
    }
  }, [initialSupplier, initialSupplier?._id]);

  const handleSelectSupplier = (supplier: any) => {
    setSelectedSupplier(supplier);
    setView('details');
    storeSelectedSupplier(supplier);
    // Persist selection in the URL so it survives navigating away and back
    navigate({
      to: '/accounting',
      search: (prev: any) => ({
        ...prev,
        tab: 'supplier-ledger',
        supplierId: supplier._id,
        supplierName: supplier.name,
      }),
      replace: true,
    });
  };

  const handleBack = () => {
    setSelectedSupplier(null);
    setView('list');
    storeSelectedSupplier(null);
    navigate({
      to: '/accounting',
      search: (prev: any) => ({
        ...prev,
        tab: 'suppliers',
        supplierId: undefined,
        supplierName: undefined,
        ledgerEntry: undefined,
      }),
      replace: true,
    });
  };

  if (view === 'details' && selectedSupplier) {
    return (
      <SupplierLedgerDetails
        supplier={selectedSupplier}
        onBack={handleBack}
        initialLedgerEntry={initialLedgerEntry}
      />
    );
  }

  return <SupplierLedgerList onSelectSupplier={handleSelectSupplier} />;
}
