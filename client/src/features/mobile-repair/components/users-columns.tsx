import { ColumnDef } from '@tanstack/react-table'
import { Checkbox } from '@/components/ui/checkbox'
import LongText from '@/components/long-text'
import { MobileRepair } from '../data/schema'
import { DataTableColumnHeader } from './data-table-column-header'
import { DataTableRowActions } from './data-table-row-actions'

export const columns: ColumnDef<MobileRepair>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        className="translate-y-[2px]"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        className="translate-y-[2px]"
      />
    ),
    enableSorting: false,
    enableHiding: true,
  },
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => <LongText className="max-w-36">{row.getValue('name')}</LongText>,
    enableHiding: true,
  },
  {
    accessorKey: 'phone',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Phone" />,
    cell: ({ row }) => <div>{row.getValue('phone')}</div>,
  },
  {
    accessorKey: 'mobileModel',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Mobile Model" />,
    cell: ({ row }) => <div>{row.getValue('mobileModel')}</div>,
  },
  {
    accessorKey: 'mobileFault',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Mobile Fault" />,
    cell: ({ row }) => <LongText className="max-w-36">{row.getValue('mobileFault')}</LongText>,
    enableHiding: true,
  },
  {
    accessorKey: 'totalAmount',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Total Amount" />,
    cell: ({ row }) => <div>Rs.{row.getValue('totalAmount') ?? 0}</div>,
  },
  {
    accessorKey: 'advance',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Advance" />,
    cell: ({ row }) => <div>Rs.{row.getValue('advance') ?? 0}</div>,
  },
  {
    accessorKey: 'balance',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Balance" />,
    cell: ({ row }) => {
      const totalAmount = Number(row.getValue('totalAmount')) || 0; // Ensure it's a number
      const advance = Number(row.getValue('advance')) || 0; // Ensure it's a number
      const balance = totalAmount - advance;
      return <div>Rs.{balance}</div>;
    },
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: DataTableRowActions,
  },
]
