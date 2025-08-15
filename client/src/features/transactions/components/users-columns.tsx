import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from './data-table-column-header';
import { DataTableRowActions } from './data-table-row-actions';
import { Transaction } from '../data/schema';

export const columns: ColumnDef<Transaction>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
  },
  {
    accessorKey: 'transactionDate',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Transaction Date" />,
    cell: ({ row }) => {
      const date = row.getValue('transactionDate');
      if (typeof date === 'string' || typeof date === 'number' || date instanceof Date) {
        return new Date(date).toLocaleDateString();
      }
      return '-';
    },
  },
  {
    accessorKey: 'account.name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Account" />,
    meta: {
      className: 'min-w-[150px]',
    },
  },
  {
    accessorKey: 'description',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />,
  },
  {
    accessorKey: 'transactionType',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Transaction Type" />,
    cell: ({getValue})=> getValue() === "cashReceived" ? "Cash Received" : "Expense Voucher",
  },
  {
    accessorKey: 'amount',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: DataTableRowActions,
  },
];
