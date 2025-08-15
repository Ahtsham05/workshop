import React, { useState, createContext, useContext } from 'react';
import useDialogState from '@/hooks/use-dialog-state'
import { Transaction } from '../data/schema';

export type TransactionDialogType = 'invite' | 'add' | 'edit' | 'delete';

interface TransactionsContextType {
  open: TransactionDialogType | null;
  setOpen: (value: TransactionDialogType | null) => void;
  currentRow: Transaction | null;
  setCurrentRow: React.Dispatch<React.SetStateAction<Transaction | null>>;
}

const TransactionsContext = createContext<TransactionsContextType | null>(null);

export default function TransactionsProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useDialogState<any>(null)
  const [currentRow, setCurrentRow] = useState<any>(null)

  return (
    <TransactionsContext.Provider value={{ open, setOpen, currentRow, setCurrentRow }}>
      {children}
    </TransactionsContext.Provider>
  );
}

export const useTransactions = () => {
  const context = useContext(TransactionsContext);
  if (!context) throw new Error('useTransactions must be used within TransactionsProvider');
  return context;
};
