import { Link } from '@tanstack/react-router'
import { PackageCheck } from 'lucide-react'
import type { MaterialIssue } from '@/stores/manufacturing.api'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { fmtQty, orderPath } from '../lib/constants'

type Fg = NonNullable<MaterialIssue['finishedGood']>

/** "Issued for" card: the finished good a material voucher's stock went into. */
export function IssueFinishedGoodCard({
  issue,
  className,
}: {
  issue: Pick<
    MaterialIssue,
    'kind' | 'finishedGood' | 'orderNumber' | 'productionOrderId'
  >
  className?: string
}) {
  const { t } = useLanguage()
  const fg = issue.finishedGood
  if (!fg) return null
  const assembly = fg.orderType === 'assembly'
  return (
    <div
      className={cn(
        'bg-muted/40 flex items-start gap-3 rounded-lg border p-3',
        className
      )}
    >
      <div className='bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-md'>
        <PackageCheck className='h-4.5 w-4.5' aria-hidden />
      </div>
      <div className='min-w-0 flex-1 space-y-0.5'>
        <div className='text-muted-foreground text-[11px] font-medium tracking-wide uppercase'>
          {issue.kind === 'return'
            ? assembly
              ? t('Returned from assembly')
              : t('Returned from finished good')
            : assembly
              ? t('Issued for assembly')
              : t('Issued for finished good')}
        </div>
        <div className='truncate text-base leading-snug font-semibold'>
          {fg.productName || '—'}
        </div>
        <FinishedGoodMeta issue={issue} fg={fg} />
      </div>
    </div>
  )
}

function FinishedGoodMeta({
  issue,
  fg,
}: {
  issue: Pick<MaterialIssue, 'orderNumber' | 'productionOrderId'>
  fg: Fg
}) {
  const { t } = useLanguage()
  const parts: React.ReactNode[] = []
  if (fg.sku) parts.push(<span key='sku'>{fg.sku}</span>)
  parts.push(
    <Link
      key='order'
      to={
        orderPath({
          id: issue.productionOrderId,
          orderType: fg.orderType === 'assembly' ? 'assembly' : 'production',
        }) as never
      }
      onClick={(e) => e.stopPropagation()}
      className='text-foreground font-mono hover:underline'
    >
      {issue.orderNumber}
    </Link>
  )
  if (fg.plannedQuantity)
    parts.push(
      <span key='qty' className='tabular-nums'>
        {t('Planned')} {fmtQty(fg.plannedQuantity)} {fg.unit}
      </span>
    )
  if (fg.batchNumber)
    parts.push(
      <span key='batch'>
        {t('Batch')} <span className='font-mono'>{fg.batchNumber}</span>
      </span>
    )
  return (
    <div className='text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs'>
      {parts.map((p, i) => (
        <span key={i} className='inline-flex items-center gap-1.5'>
          {i > 0 && <span aria-hidden>·</span>}
          {p}
        </span>
      ))}
    </div>
  )
}
