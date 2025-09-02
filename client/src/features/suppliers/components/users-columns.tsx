import { ColumnDef } from '@tanstack/react-table'
import { Checkbox } from '@/components/ui/checkbox'
import LongText from '@/components/long-text'
import { Supplier } from '../data/schema'  // Changed from Customer to Supplier
import { DataTableColumnHeader } from './data-table-column-header'
import { DataTableRowActions } from './data-table-row-actions'
import { useLanguage } from '@/context/language-context'

export function useSupplierColumns() {
  const { t, language } = useLanguage();
  const isUrdu = language === 'ur';
  
  // Define all column objects separately so we can reorder them
  const selectColumn: ColumnDef<Supplier> = {
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
  };

  const nameColumn: ColumnDef<Supplier> = {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title={t('supplier_name')} />,
    cell: ({ row }) => <LongText className='max-w-36'>{row.getValue('name')}</LongText>,
    enableHiding: true,
  };

  const emailColumn: ColumnDef<Supplier> = {
    accessorKey: 'email',
    header: ({ column }) => <DataTableColumnHeader column={column} title={t('email')} />,
    cell: ({ row }) => <LongText className='max-w-36'>{row.getValue('email')}</LongText>,
    enableHiding: true,
  };

  const phoneColumn: ColumnDef<Supplier> = {
    accessorKey: 'phone',
    header: ({ column }) => <DataTableColumnHeader column={column} title={t('phone')} />,
    cell: ({ row }) => <div>{row.getValue('phone')}</div>,
  };

  const whatsappColumn: ColumnDef<Supplier> = {
    accessorKey: 'whatsapp',
    header: ({ column }) => <DataTableColumnHeader column={column} title={t('whatsapp')} />,
    cell: ({ row }) => <div>{row.getValue('whatsapp')}</div>,
  };

  const addressColumn: ColumnDef<Supplier> = {
    accessorKey: 'address',
    header: ({ column }) => <DataTableColumnHeader column={column} title={t('address')} />,
    cell: ({ row }) => <div>{row.getValue('address')}</div>,
  };

  const actionsColumn: ColumnDef<Supplier> = {
    id: 'actions',
    header: t('actions'),
    cell: DataTableRowActions,
  };
  
  // Define columns in different orders based on language
  let columns: ColumnDef<Supplier>[];
  
  if (isUrdu) {
    // For Urdu: actions, address, whatsapp, phone, email, name, select (right to left)
    // columns = [
    //   selectColumn,
    //   actionsColumn,
    //   addressColumn,
    //   whatsappColumn, 
    //   phoneColumn,
    //   emailColumn,
    //   nameColumn
    // ];
    columns = [
      selectColumn,
      nameColumn,
      emailColumn,
      phoneColumn,
      whatsappColumn,
      addressColumn,
      actionsColumn
    ];
  } else {
    // For English: select, name, email, phone, whatsapp, address, actions (left to right)
    columns = [
      selectColumn,
      nameColumn,
      emailColumn,
      phoneColumn,
      whatsappColumn,
      addressColumn,
      actionsColumn
    ];
  }
  
  return columns;
}
