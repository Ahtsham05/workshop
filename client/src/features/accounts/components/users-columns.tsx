import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from './data-table-column-header';
import { DataTableRowActions } from './data-table-row-actions';
import { Account } from '../data/schema';  // Import your Account type

export const columns: ColumnDef<Account>[] = [
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
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Account Name" />,
  },
  {
    accessorKey: 'type',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
    cell:({getValue})=> getValue() === "receivable" ? "Receivable" : "Payable",
  },
  {
    accessorKey: 'transactionType',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Transaction Type" />,
    cell:({getValue})=> getValue() === "cashReceived" ? "Cash Received" : getValue() === "generalLedger" ? "General Ledger" : "Expense Voucher",
  },
    {
    accessorKey: 'balance',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Balance" />,
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: DataTableRowActions,
  },
];
