import { DotsHorizontalIcon } from '@radix-ui/react-icons'
import { Row } from '@tanstack/react-table'
import { useNavigate } from '@tanstack/react-router'
import { IconEdit, IconTrash } from '@tabler/icons-react'
import { ClipboardEdit, Flag, Gauge } from 'lucide-react'
import toast from 'react-hot-toast'
import { useDispatch } from 'react-redux'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FlagPickerPopover } from '@/components/flag-badge'
import { StockThresholdPopover } from './stock-threshold-popover'
import { AppDispatch } from '@/stores/store'
import { updateProduct, updateProductFlag } from '@/stores/product.slice'
import { useUsers } from '../context/users-context'
import { Product } from '../data/schema'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'

interface DataTableRowActionsProps {
  row: Row<Product>
  /** Store-wide Low/Critical Stock defaults (from the Low Stock Alert settings) — passed
   *  down so the threshold popover can show them as a placeholder/hint. */
  lowStockThreshold: number
  criticalStockThreshold?: number | null
  /** Re-fetches the list after a threshold change so the badge and stat cards update
   *  immediately — same callback ActiveToggleCell uses after an Active-status flip. */
  onThresholdChanged?: () => void
}

export function DataTableRowActions({ row, lowStockThreshold, criticalStockThreshold, onThresholdChanged }: DataTableRowActionsProps) {
  const { setOpen, setCurrentRow } = useUsers()
  const { t } = useLanguage()
  const { hasPermission } = usePermissions()
  const navigate = useNavigate()
  const dispatch = useDispatch<AppDispatch>()

  const canEdit = hasPermission('editProducts' as any)
  const canDelete = hasPermission('deleteProducts' as any)

  // Don't show actions menu if user has no permissions
  if (!canEdit && !canDelete) {
    return null
  }

  const productId = row.original._id || row.original.id || ''

  return (
    <div className='flex items-center justify-end gap-0.5'>
      {canEdit && (
        <FlagPickerPopover
          flag={row.original.flag}
          onSave={async (data) => {
            try {
              await dispatch(updateProductFlag({ id: productId, ...data })).unwrap()
              toast.success(row.original.flag ? 'Flag updated' : 'Product flagged for review')
            } catch {
              toast.error('Failed to update flag')
            }
          }}
          onClear={async () => {
            try {
              await dispatch(updateProductFlag({ id: productId, clear: true })).unwrap()
              toast.success('Flag cleared')
            } catch {
              toast.error('Failed to clear flag')
            }
          }}
          trigger={
            <Button variant='ghost' className='flex h-8 w-8 p-0'>
              <Flag
                className='h-4 w-4'
                style={row.original.flag ? { color: row.original.flag.color, fill: row.original.flag.color } : undefined}
              />
              <span className='sr-only'>Flag for review</span>
            </Button>
          }
        />
      )}
      {canEdit && (
        <StockThresholdPopover
          lowStockThreshold={row.original.lowStockThreshold}
          criticalStockThreshold={row.original.criticalStockThreshold}
          defaultLowStockThreshold={lowStockThreshold}
          defaultCriticalStockThreshold={criticalStockThreshold}
          onSave={async ({ lowStockThreshold: low, criticalStockThreshold: critical }) => {
            try {
              await dispatch(
                updateProduct({ _id: productId, lowStockThreshold: low, criticalStockThreshold: critical })
              ).unwrap()
              toast.success('Stock alert levels updated')
              onThresholdChanged?.()
            } catch {
              toast.error('Failed to update stock alert levels')
            }
          }}
          trigger={
            <Button variant='ghost' className='flex h-8 w-8 p-0'>
              <Gauge
                className={cn(
                  'h-4 w-4',
                  (row.original.lowStockThreshold != null || row.original.criticalStockThreshold != null) &&
                    'text-primary'
                )}
              />
              <span className='sr-only'>Set stock alert levels</span>
            </Button>
          }
        />
      )}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            className='data-[state=open]:bg-muted flex h-8 w-8 p-0'
          >
            <DotsHorizontalIcon className='h-4 w-4' />
            <span className='sr-only'>Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-[160px]'>
          {canEdit && (
            <DropdownMenuItem
              onClick={() => {
                setCurrentRow(row.original)
                setOpen('edit')
              }}
            >
              {t('edit')}
              <DropdownMenuShortcut>
                <IconEdit size={16} />
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          )}
          {canEdit && (
            <DropdownMenuItem
              onClick={() => {
                navigate({
                  to: '/stock-adjustments',
                  search: { productId, productName: row.original.name },
                })
              }}
            >
              {t('Adjust Stock')}
              <DropdownMenuShortcut>
                <ClipboardEdit size={16} />
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          )}
          {canEdit && canDelete && <DropdownMenuSeparator />}
          {canDelete && (
            <DropdownMenuItem
              onClick={() => {
                setCurrentRow(row.original)
                setOpen('delete')
              }}
              className='text-red-500!'
            >
              {t('delete')}
              <DropdownMenuShortcut>
                <IconTrash size={16} />
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
