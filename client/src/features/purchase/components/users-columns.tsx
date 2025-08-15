import { ColumnDef } from '@tanstack/react-table'
import { Checkbox } from '@/components/ui/checkbox'
import { purchase } from '../data/schema'  // Changed from Customer to Supplier
import { DataTableColumnHeader } from './data-table-column-header'
import { DataTableRowActions } from './data-table-row-actions'
import { format } from 'date-fns'  // Import date-fns for date formatting

export const columns: ColumnDef<purchase>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label='Select all'
        className='translate-y-[2px]'
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label='Select row'
        className='translate-y-[2px]'
      />
    ),
    enableSorting: false,
    enableHiding: true,
  },
  {
    accessorKey: 'purchaseDate',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Purchase Date' />,  // Changed to Purchase Date
    cell: ({ row }) => <div>{format(new Date(row.getValue('purchaseDate')), 'dd/MM/yyyy')}</div>,
    enableHiding: true,
  },
  {
    accessorKey: 'invoiceNumber',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Invoice Number' />,  // Changed to Invoice Number
    cell: ({ row }) => <div>{row.getValue('invoiceNumber')}</div>,
    enableHiding: true,
  },
  {
    accessorKey: 'supplier', // use the top-level key
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Supplier Name' />
    ),
    cell: ({ row }) => <div>{row.original?.supplier?.name ?? 'N/A'}</div>,
  },
  {
    accessorKey: 'totalAmount',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Total Amount' />,  // Changed to Total Amount
    cell: ({ row }) => <div>{row.getValue('totalAmount')}</div>,
  },
  {
    id: 'actions',
    header: "Actions",
    cell: DataTableRowActions,
  }
];
