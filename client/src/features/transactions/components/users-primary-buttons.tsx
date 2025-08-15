import { Button } from '@/components/ui/button';
import { useTransactions } from '../context/users-context';
import { PlusCircle } from 'lucide-react';

export default function TransactionPrimaryButtons() {
  const { setOpen } = useTransactions();
  return (
    <div className="flex gap-2">
      <Button className="space-x-1" onClick={() => setOpen('add')}>
        <span>Add Transaction</span> <PlusCircle size={18} />
      </Button>
    </div>
  );
}
