import { useEffect, useMemo } from 'react'
import { Warehouse as WarehouseIcon } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useWarehouseSettings } from '@/hooks/use-warehouse-settings'
import { useGetWarehousesQuery } from '@/stores/warehouse.api'
import type { PermissionKey } from '@/lib/permission-registry'

/** sale: invoices · receipt: purchases · any: returns, adjustments, counts, transfers. */
type Kind = 'sale' | 'receipt' | 'any'

const lastKey = (kind: Kind) => `warehouse-field:last:${kind}`
const readLast = (kind: Kind) => {
  try {
    return sessionStorage.getItem(lastKey(kind)) || ''
  } catch {
    return ''
  }
}
const writeLast = (kind: Kind, id: string) => {
  try {
    sessionStorage.setItem(lastKey(kind), id)
  } catch {
    // storage blocked — the default warehouse is used next time
  }
}

const VIEW_PERMISSIONS: PermissionKey[] = ['viewWarehouses', 'manageWarehouses', 'manageWarehouseTransfers', 'viewProducts', 'viewInventoryReports', 'viewInvoices', 'createInvoices', 'editInvoices', 'viewPurchases', 'createPurchases', 'editPurchases']

/**
 * Whether invoices (kind 'sale') / purchases (kind 'receipt') should show a warehouse
 * picker: module on, the matching "ask" option on, and the branch has more than one
 * warehouse that accepts this kind of document. When false the form must not send
 * `warehouseId` at all, so the server keeps whatever the document already had.
 */
export function useWarehousePicker(kind: Kind, { active = true }: { active?: boolean } = {}) {
  const settings = useWarehouseSettings()
  const { hasAnyPermission } = usePermissions()
  const ask = kind === 'sale' ? settings.askOnSales : kind === 'receipt' ? settings.askOnPurchases : true
  const wanted = active && settings.enabled && ask && hasAnyPermission(...VIEW_PERMISSIONS)
  // The shared list (one cache entry app-wide); archived warehouses are filtered here.
  const { data: warehouses = [] } = useGetWarehousesQuery(undefined, { skip: !wanted })
  const usable = useMemo(
    () =>
      warehouses.filter(
        (w) => w.isActive && (kind === 'sale' ? w.allowSales !== false : kind === 'receipt' ? w.allowReceipts !== false : true)
      ),
    [warehouses, kind]
  )
  const defaultId = useMemo(() => warehouses.find((w) => w.isDefault)?.id || '', [warehouses])
  // `all` (archived included) is for naming warehouses on old documents.
  return { visible: wanted && usable.length > 1, warehouses: usable, all: warehouses, defaultId }
}

interface WarehouseFieldProps {
  kind: Kind
  value: string | null | undefined
  onValueChange: (value: string) => void
  id?: string
  className?: string
  /** Overrides the default label. */
  label?: string
  /** Where a new document should start (e.g. a sales return: the invoice's warehouse). */
  preferredId?: string | null
  hint?: string
}

/** "Warehouse" picker for invoice / purchase forms. Renders nothing when not needed. */
export function WarehouseField({ kind, value, onValueChange, id = 'warehouseId', className, label, preferredId, hint }: WarehouseFieldProps) {
  const { t } = useLanguage()
  const { visible, warehouses, defaultId } = useWarehousePicker(kind)

  // A new document starts on the warehouse picked last time on this device (a cashier at the
  // shop counter keeps selling from the shop), else the default — so the choice is visible.
  useEffect(() => {
    if (!visible || value || !defaultId) return
    if (preferredId && warehouses.some((w) => w.id === preferredId)) {
      onValueChange(preferredId)
      return
    }
    const last = kind === 'any' ? '' : readLast(kind)
    onValueChange(last && warehouses.some((w) => w.id === last) ? last : defaultId)
  }, [visible, value, defaultId, onValueChange, kind, warehouses, preferredId])

  const options = useMemo(
    () =>
      warehouses.map((w) => ({
        value: w.id,
        label: w.name,
        sublabel: w.code,
        badge: w.isDefault ? t('Default') : undefined,
      })),
    [warehouses, t]
  )

  if (!visible) return null

  return (
    <div className={className}>
      <Label htmlFor={id} className='flex items-center gap-1.5'>
        <WarehouseIcon className='h-3.5 w-3.5 text-muted-foreground' />
        {label || (kind === 'sale' ? t('Deliver from warehouse') : kind === 'receipt' ? t('Receive into warehouse') : t('Warehouse'))}
      </Label>
      <SearchableSelect
        id={id}
        options={options}
        value={value || defaultId}
        onValueChange={(v) => {
          const next = v || defaultId
          if (kind !== 'any') writeLast(kind, next)
          onValueChange(next)
        }}
        placeholder={t('Choose warehouse')}
        deselectable={false}
      />
      {hint ? <p className='mt-1 text-xs text-muted-foreground'>{hint}</p> : null}
    </div>
  )
}
