import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ChevronDown,
  ChevronRight,
  Factory,
  Layers,
  PackageCheck,
  ScanLine,
  Truck,
  Boxes,
} from 'lucide-react'
import type {
  TraceComponent,
  TraceNode,
  TraceProduced,
  TraceSource,
  WhereUsedNode,
} from '@/stores/manufacturing.api'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Badge } from '@/components/ui/badge'
import { fmtDate, fmtQty, orderPath } from '../lib/constants'
import { StatusBadge } from './badges'

/*
 * Genealogy views. The forward tree reads top-down from what was made to what it was
 * made of; the reverse tree reads from a lot of material up to the finished products
 * that contain it. Both are pure renderings of the server's trace — no client logic.
 */

const Rail = ({
  children,
  depth,
}: {
  children: React.ReactNode
  depth: number
}) => (
  <div
    className={cn('relative', depth > 0 && 'border-border ml-4 border-l pl-4')}
  >
    {children}
  </div>
)

function Collapsible({
  header,
  children,
  defaultOpen = true,
}: {
  header: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        type='button'
        onClick={() => setOpen(!open)}
        className='flex w-full items-start gap-1.5 text-left'
      >
        {open ? (
          <ChevronDown className='text-muted-foreground mt-1 h-3.5 w-3.5 shrink-0' />
        ) : (
          <ChevronRight className='text-muted-foreground mt-1 h-3.5 w-3.5 shrink-0' />
        )}
        <div className='min-w-0 flex-1'>{header}</div>
      </button>
      {open && <div className='mt-2 space-y-2'>{children}</div>}
    </div>
  )
}

function OrderChip({ order }: { order: TraceNode['order'] }) {
  const { t } = useLanguage()
  return (
    <div className='flex flex-wrap items-center gap-2'>
      <span
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-md',
          order.orderType === 'assembly'
            ? 'bg-violet-500/10 text-violet-600'
            : 'bg-primary/10 text-primary'
        )}
      >
        {order.orderType === 'assembly' ? (
          <Layers className='h-3.5 w-3.5' />
        ) : (
          <Factory className='h-3.5 w-3.5' />
        )}
      </span>
      <Link
        to={orderPath(order) as never}
        className='font-mono text-xs font-medium hover:underline'
        onClick={(e) => e.stopPropagation()}
      >
        {order.orderNumber}
      </Link>
      <span className='font-medium'>{order.productName}</span>
      <span className='text-muted-foreground text-xs'>
        {order.orderType === 'assembly'
          ? t('Assembly order')
          : t('Production order')}
        {order.operatorName ? ` · ${order.operatorName}` : ''}
      </span>
      <StatusBadge
        status={order.status}
        orderType={order.orderType}
        className='h-5 px-1.5 text-[10px]'
      />
    </div>
  )
}

function ProducedList({ produced }: { produced: TraceProduced[] }) {
  const { t } = useLanguage()
  if (!produced.length) return null
  return (
    <div className='flex flex-wrap gap-1.5 pl-8'>
      {produced.map((r) => (
        <span
          key={r.receiptId}
          className='inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-300'
        >
          <PackageCheck className='h-3 w-3' />
          {fmtQty(r.quantity)} {r.unit}
          {r.batch && (
            <span className='font-mono'>
              · {t('batch')} {r.batch.batchNumber}
            </span>
          )}
          {r.serials.length > 0 && (
            <span
              className='font-mono'
              title={r.serials.map((s) => s.number).join(', ')}
            >
              ·{' '}
              {r.serials
                .slice(0, 3)
                .map((s) => s.number)
                .join(', ')}
              {r.serials.length > 3 ? ` +${r.serials.length - 3}` : ''}
            </span>
          )}
        </span>
      ))}
    </div>
  )
}

function SourceView({ source, depth }: { source: TraceSource; depth: number }) {
  const { t } = useLanguage()
  const serials = source.serials?.length ? (
    <span
      className='text-muted-foreground font-mono text-[11px]'
      title={source.serials.map((s) => s.number).join(', ')}
    >
      {source.serials
        .slice(0, 4)
        .map((s) => s.number)
        .join(', ')}
      {source.serials.length > 4 ? ` +${source.serials.length - 4}` : ''}
    </span>
  ) : null
  if (source.kind === 'production' && source.order) {
    return (
      <div className='space-y-1'>
        {(serials || source.linked) && (
          <div className='flex items-center gap-2 text-xs'>
            {serials}
            {source.linked && (
              <Badge
                variant='outline'
                className='h-5 px-1.5 text-[10px] font-normal'
              >
                {t('linked sub-assembly order')}
              </Badge>
            )}
          </div>
        )}
        <TraceTree node={source.order} depth={depth + 1} />
      </div>
    )
  }
  return (
    <div className='flex flex-wrap items-center gap-2 text-xs'>
      <Truck className='h-3.5 w-3.5 text-amber-600' />
      {source.supplier ? (
        <span className='font-medium'>{source.supplier.name}</span>
      ) : (
        <span className='text-muted-foreground'>
          {t('Supplier not recorded')}
        </span>
      )}
      {source.purchase && (
        <span className='text-muted-foreground'>
          · {t('purchase')}{' '}
          <span className='font-mono'>{source.purchase.number}</span> ·{' '}
          {fmtDate(source.purchase.date)}
        </span>
      )}
      {source.kind === 'untracked' && (
        <span className='text-muted-foreground'>
          · {t('default supplier — item is not batch/serial tracked')}
        </span>
      )}
      {serials}
    </div>
  )
}

function ComponentView({
  component,
  depth,
}: {
  component: TraceComponent
  depth: number
}) {
  const { t } = useLanguage()
  return (
    <div className='bg-muted/30 rounded-lg border p-2.5'>
      <Collapsible
        defaultOpen={depth < 3}
        header={
          <div className='flex flex-wrap items-center gap-2 text-sm'>
            <Boxes className='text-muted-foreground h-3.5 w-3.5' />
            <span className='font-medium'>{component.productName}</span>
            <span className='text-muted-foreground tabular-nums'>
              {fmtQty(component.quantity)} {component.unit}
            </span>
            {component.batch && (
              <Badge
                variant='outline'
                className='h-5 gap-1 px-1.5 font-mono text-[10px]'
              >
                <Layers className='h-3 w-3' />
                {component.batch.batchNumber}
                {component.batch.expiryDate
                  ? ` · ${t('exp')} ${fmtDate(component.batch.expiryDate)}`
                  : ''}
              </Badge>
            )}
            {component.sources.some((s) => s.serials?.length) && (
              <ScanLine className='text-muted-foreground h-3.5 w-3.5' />
            )}
          </div>
        }
      >
        <div className='space-y-2 pl-5'>
          {component.sources.map((source, i) => (
            <SourceView key={i} source={source} depth={depth} />
          ))}
        </div>
      </Collapsible>
    </div>
  )
}

/** Forward genealogy: order → what it produced → components → batches/serials → supplier or the order that made them. */
export function TraceTree({
  node,
  depth = 0,
}: {
  node: TraceNode
  depth?: number
}) {
  const { t } = useLanguage()
  return (
    <Rail depth={depth}>
      <Collapsible
        header={<OrderChip order={node.order} />}
        defaultOpen={depth < 4}
      >
        <ProducedList produced={node.produced} />
        {node.truncated && (
          <p className='text-muted-foreground pl-8 text-xs'>
            {t('Trace truncated (depth limit or repeated order).')}
          </p>
        )}
        {!node.truncated && node.components.length === 0 && (
          <p className='text-muted-foreground pl-8 text-xs'>
            {t('No materials issued to this order yet.')}
          </p>
        )}
        <div className='space-y-2 pl-8'>
          {node.components.map((c) => (
            <ComponentView
              key={`${c.productId}:${c.batch?.id || ''}`}
              component={c}
              depth={depth}
            />
          ))}
        </div>
      </Collapsible>
    </Rail>
  )
}

/** Reverse genealogy: where a lot went — each consuming order, what it produced, and onward. */
export function WhereUsedTree({
  nodes,
  depth = 0,
}: {
  nodes: WhereUsedNode[]
  depth?: number
}) {
  const { t } = useLanguage()
  if (!nodes.length && depth === 0) {
    return (
      <p className='text-muted-foreground py-6 text-center text-sm'>
        {t('Not used in any production or assembly yet.')}
      </p>
    )
  }
  return (
    <div className='space-y-2'>
      {nodes.map((n) => (
        <Rail key={n.order.id} depth={depth}>
          <Collapsible
            defaultOpen={depth < 4}
            header={
              <div className='space-y-1'>
                <OrderChip order={n.order} />
                <div className='text-muted-foreground pl-8 text-xs'>
                  {t('used')}{' '}
                  <b className='text-foreground tabular-nums'>
                    {fmtQty(n.quantityUsed)}
                  </b>{' '}
                  {n.unit}
                </div>
              </div>
            }
          >
            <ProducedList produced={n.produced} />
            {n.usedIn.length > 0 ? (
              <WhereUsedTree nodes={n.usedIn} depth={depth + 1} />
            ) : (
              !n.truncated &&
              n.produced.length > 0 && (
                <p className='pl-8 text-xs font-medium text-emerald-700 dark:text-emerald-400'>
                  {t('→ Finished products (not consumed further)')}
                </p>
              )
            )}
          </Collapsible>
        </Rail>
      ))}
    </div>
  )
}
