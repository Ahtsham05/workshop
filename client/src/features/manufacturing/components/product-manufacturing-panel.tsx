import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Factory,
  FileStack,
  GitBranch,
  Layers,
  Plus,
  Settings2,
} from 'lucide-react'
import {
  useGetManufacturingProductOverviewQuery,
  type ManufacturingProduct,
} from '@/stores/manufacturing.api'
import { getErrorMessage } from '@/lib/get-error-message'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  PROCUREMENT_LABELS,
  fmtDate,
  fmtQty,
  orderPath,
} from '../lib/constants'
import { ProductTypeBadge, ProgressBar, StatusBadge } from './badges'
import { Panel, Stat, StatGrid } from './page'
import { ProductAttributesSheet } from './product-attributes-sheet'

/**
 * The product details page's Manufacturing tab: how the product is classified and made,
 * its BOMs, where it's used, the orders that make it, and the open orders consuming it.
 */
export function ProductManufacturingPanel({
  productId,
}: {
  productId: string
}) {
  const { t } = useLanguage()
  const { hasAnyPermission, hasPermission } = usePermissions()
  const canEdit = hasAnyPermission('manageBoms', 'editProducts')
  const { data, isLoading, error } =
    useGetManufacturingProductOverviewQuery(productId)
  const [editing, setEditing] = useState<ManufacturingProduct | null>(null)

  if (isLoading) return <Skeleton className='h-64 w-full rounded-xl' />
  if (!data) {
    return (
      <p className='text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm'>
        {getErrorMessage(
          error,
          t('Manufacturing details are not available for this product.')
        )}
      </p>
    )
  }
  const { product, boms, whereUsed, making, consuming, totals } = data
  const unit = product.unit
  const defaultBom =
    boms.find((b) => b.id === product.defaultBomId) ||
    boms.find((b) => b.isDefault)

  return (
    <div className='space-y-4'>
      <Panel
        title={t('Classification')}
        action={
          canEdit ? (
            <Button
              size='sm'
              variant='outline'
              onClick={() =>
                setEditing({
                  ...product,
                  bomCount: boms.length,
                  activeBomCount: boms.filter((b) => b.isActive).length,
                })
              }
            >
              <Settings2 className='mr-1.5 h-3.5 w-3.5' />
              {t('Manufacturing settings')}
            </Button>
          ) : undefined
        }
      >
        <dl className='grid grid-cols-2 gap-4 sm:grid-cols-4'>
          <div>
            <dt className='text-muted-foreground text-xs'>{t('Type')}</dt>
            <dd className='mt-1'>
              <ProductTypeBadge type={product.productType} />
            </dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs'>
              {t('Procurement')}
            </dt>
            <dd className='mt-1 text-sm'>
              {product.procurementType
                ? t(PROCUREMENT_LABELS[product.procurementType])
                : '—'}
            </dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs'>{t('Lead time')}</dt>
            <dd className='mt-1 text-sm'>
              {product.manufacturingLeadTimeDays != null
                ? `${product.manufacturingLeadTimeDays} ${t('day(s)')}`
                : '—'}
            </dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs'>
              {t('Default BOM')}
            </dt>
            <dd className='mt-1 font-mono text-sm'>
              {defaultBom ? (
                <Link
                  to={'/manufacturing/boms' as never}
                  search={{ bomId: defaultBom.id } as never}
                  className='hover:underline'
                >
                  {defaultBom.bomNumber} v{defaultBom.version}
                </Link>
              ) : (
                '—'
              )}
            </dd>
          </div>
        </dl>
      </Panel>

      <StatGrid className='md:grid-cols-4'>
        <Stat
          label={t('On hand')}
          value={`${fmtQty(product.stockQuantity)} ${unit}`}
        />
        <Stat
          label={t('Being made')}
          value={`${fmtQty(totals.inProduction)} ${unit}`}
          hint={t('open orders, still to finish')}
        />
        <Stat
          label={t('Needed by open orders')}
          value={`${fmtQty(totals.requiredByOpenOrders)} ${unit}`}
          tone='warning'
          active={totals.requiredByOpenOrders > product.stockQuantity}
          hint={
            totals.requiredByOpenOrders > product.stockQuantity
              ? t('more than on hand')
              : t('still to issue')
          }
        />
        <Stat
          label={t('In WIP')}
          value={`${fmtQty(totals.inWip)} ${unit}`}
          hint={t('issued to the floor')}
        />
      </StatGrid>

      <div className='grid gap-4 lg:grid-cols-2'>
        <Panel
          flush
          title={
            <span className='flex items-center gap-1.5'>
              <FileStack className='h-4 w-4' />
              {t('Bills of materials')}
            </span>
          }
          action={
            hasPermission('manageBoms') ? (
              <Button asChild size='sm' variant='outline'>
                <Link
                  to={'/manufacturing/boms' as never}
                  search={{ productId, new: true } as never}
                >
                  <Plus className='mr-1.5 h-3.5 w-3.5' />
                  {boms.length ? t('New version') : t('Create BOM')}
                </Link>
              </Button>
            ) : undefined
          }
        >
          {boms.length === 0 ? (
            <p className='text-muted-foreground p-5 text-sm'>
              {t('No BOM — this product is bought or not made here.')}
            </p>
          ) : (
            <ul className='divide-y'>
              {boms.map((b) => (
                <li
                  key={b.id}
                  className='flex flex-wrap items-center gap-2 px-5 py-2.5 text-sm max-sm:px-4'
                >
                  <Link
                    to={'/manufacturing/boms' as never}
                    search={{ bomId: b.id } as never}
                    className='font-mono text-xs font-medium hover:underline'
                  >
                    {b.bomNumber} v{b.version}
                  </Link>
                  {b.isDefault && (
                    <Badge
                      variant='secondary'
                      className='h-5 px-1.5 text-[10px]'
                    >
                      {t('Default')}
                    </Badge>
                  )}
                  {!b.isActive && (
                    <Badge variant='outline' className='h-5 px-1.5 text-[10px]'>
                      {t('Inactive')}
                    </Badge>
                  )}
                  {b.isLocked && (
                    <Badge variant='outline' className='h-5 px-1.5 text-[10px]'>
                      {t('Locked')}
                    </Badge>
                  )}
                  <span className='text-muted-foreground ml-auto text-xs'>
                    {b.componentCount} {t('components')} · {b.operationCount}{' '}
                    {t('steps')} · {fmtDate(b.updatedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          flush
          title={
            <span className='flex items-center gap-1.5'>
              <GitBranch className='h-4 w-4' />
              {t('Used in')}
            </span>
          }
          description={t('Bills of materials that consume this product')}
        >
          {whereUsed.length === 0 ? (
            <p className='text-muted-foreground p-5 text-sm'>
              {t('Not used in any BOM.')}
            </p>
          ) : (
            <ul className='divide-y'>
              {whereUsed.map((w) => (
                <li
                  key={w.id}
                  className='flex items-center gap-2 px-5 py-2.5 text-sm max-sm:px-4'
                >
                  <Link
                    to={'/manufacturing/boms' as never}
                    search={{ bomId: w.id } as never}
                    className='min-w-0 flex-1 truncate hover:underline'
                  >
                    {w.productName}
                    <span className='text-muted-foreground ml-1.5 font-mono text-xs'>
                      {w.bomNumber} v{w.version}
                    </span>
                  </Link>
                  <span className='text-muted-foreground shrink-0 text-xs tabular-nums'>
                    × {fmtQty(w.quantity)} {w.unit || unit}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        flush
        title={
          <span className='flex items-center gap-1.5'>
            <Factory className='h-4 w-4' />
            {t('Orders making this product')}
          </span>
        }
        action={
          hasPermission('manageProductionOrders') && product.defaultBomId ? (
            <Button asChild size='sm' variant='outline'>
              <Link
                to={'/manufacturing/production-orders' as never}
                search={{ new: true } as never}
              >
                <Plus className='mr-1.5 h-3.5 w-3.5' />
                {t('New production order')}
              </Link>
            </Button>
          ) : undefined
        }
      >
        {making.length === 0 ? (
          <p className='text-muted-foreground p-5 text-sm'>
            {t('No production orders for this product yet.')}
          </p>
        ) : (
          <ul className='divide-y'>
            {making.map((o) => {
              const pct = o.plannedQuantity
                ? (o.completedQuantity / o.plannedQuantity) * 100
                : 0
              return (
                <li
                  key={o.id}
                  className='flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-sm max-sm:px-4'
                >
                  {o.orderType === 'assembly' ? (
                    <Layers className='h-4 w-4 shrink-0 text-violet-600' />
                  ) : (
                    <Factory className='text-muted-foreground h-4 w-4 shrink-0' />
                  )}
                  <Link
                    to={orderPath(o) as never}
                    className='font-mono text-xs font-medium hover:underline'
                  >
                    {o.orderNumber}
                  </Link>
                  <StatusBadge
                    status={o.status}
                    orderType={o.orderType}
                    className='h-5 px-1.5 text-[10px]'
                  />
                  <span className='text-muted-foreground text-xs tabular-nums'>
                    {fmtQty(o.completedQuantity)} / {fmtQty(o.plannedQuantity)}{' '}
                    {o.unit}
                  </span>
                  <div className='w-24 max-sm:hidden'>
                    <ProgressBar value={pct} />
                  </div>
                  <span className='text-muted-foreground ml-auto text-xs'>
                    {t('Due')} {fmtDate(o.plannedCompletionDate)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <Panel
        flush
        title={t('Open orders consuming this product')}
        description={t(
          'Material still to issue, and what is already on the floor'
        )}
      >
        {consuming.length === 0 ? (
          <p className='text-muted-foreground p-5 text-sm'>
            {t('No open order needs this product.')}
          </p>
        ) : (
          <ul className='divide-y'>
            {consuming.map((o) => (
              <li
                key={o.id}
                className='flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-sm max-sm:px-4'
              >
                <Link
                  to={orderPath(o) as never}
                  className='font-mono text-xs font-medium hover:underline'
                >
                  {o.orderNumber}
                </Link>
                <StatusBadge
                  status={o.status}
                  orderType={o.orderType}
                  className='h-5 px-1.5 text-[10px]'
                />
                <span className='min-w-0 flex-1 truncate'>{o.productName}</span>
                <span className='text-muted-foreground text-xs tabular-nums'>
                  {t('needs')} {fmtQty(o.required)} · {t('issued')}{' '}
                  {fmtQty(o.issued)} · {t('in WIP')} {fmtQty(o.inWip)} {unit}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {editing && (
        <ProductAttributesSheet
          product={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
