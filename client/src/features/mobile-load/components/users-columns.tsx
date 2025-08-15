import { ColumnDef } from '@tanstack/react-table'
import { Checkbox } from '@/components/ui/checkbox'
// import { sale } from '../data/schema'  // Changed from purchase to sale
import { DataTableColumnHeader } from './data-table-column-header'
import { DataTableRowActions } from './data-table-row-actions'
import { format } from 'date-fns'  // Import date-fns for date formatting

export const columns: ColumnDef<any>[] = [
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
    accessorKey: 'saleDate',  // Changed from purchaseDate to saleDate
    header: ({ column }) => <DataTableColumnHeader column={column} title='Sale Date' />,  // Changed to Sale Date
    cell: ({ row }) => <div>{format(new Date(row.getValue('saleDate')), 'dd/MM/yyyy')}</div>,  // Updated for Sale Date
    enableHiding: true,
  },
  {
    accessorKey: 'invoiceNumber',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Invoice Number' />,
    cell: ({ row }) => <div>{row.getValue('invoiceNumber')}</div>,
    enableHiding: true,
  },
  {
    accessorKey: 'customer', // Changed from supplier to customer
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Customer Name' />  // Changed to Customer Name
    ),
    cell: ({ row }) => <div>{row.original?.customer?.name ?? 'N/A'}</div>,  // Changed from supplier to customer
  },
  {
    accessorKey: 'totalAmount',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Total Amount' />,  // Changed to Total Amount
    cell: ({ row }) => <div>{row.getValue('totalAmount')}</div>,
  },
  // {
  //   accessorKey: 'totalProfit',
  //   header: ({ column }) => <DataTableColumnHeader column={column} title='Total Profit' />,  // Added Total Profit for Sales
  //   cell: ({ row }) => <div>{row.getValue('totalProfit')}</div>,
  // },
  {
    id: 'actions',
    header: "Actions",
    cell: DataTableRowActions,  // Keep the actions column for performing actions like delete, edit etc.
  }
];
