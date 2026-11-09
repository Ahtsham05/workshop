import { Link } from '@tanstack/react-router'
import { AlertTriangle, ArrowLeftRight, Boxes, MapPin, MoreVertical, Pencil, Star, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useLanguage } from '@/context/language-context'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import type { WarehouseCard as Card_ } from '@/stores/warehouse.api'
import { WAREHOUSE_TYPE_LABELS, colorOf, compactMoney, fmtDate, fmtQty } from '../lib/labels'

interface Props {
  warehouse: Card_
  share: number
  canManage: boolean
  canTransfer: boolean
  onEdit: () => void
  onMakeDefault: () => void
  onDelete: () => void
  onMove: () => void
}

export function WarehouseCard({ warehouse: w, share, canManage, canTransfer, onEdit, onMakeDefault, onDelete, onMove }: Props) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const c = colorOf(w.color)

  return (
    <Card className={cn('relative gap-0 overflow-hidden p-0 transition hover:shadow-md', !w.isActive && 'opacity-60')}>
      <div className={cn('h-1.5 bg-gradient-to-r', c.bar)} />
      <div className='space-y-4 p-4'>
        <div className='flex items-start justify-between gap-2'>
          <Link to='/warehouses/$warehouseId' params={{ warehouseId: w.id }} className='min-w-0 flex-1'>
            <div className='flex items-center gap-2'>
              <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold', c.soft, c.text)}>
                {w.code.slice(0, 4)}
              </span>
              <div className='min-w-0'>
                <p className='truncate font-semibold hover:underline'>{w.name}</p>
                <p className='truncate text-xs text-muted-foreground'>{t(WAREHOUSE_TYPE_LABELS[w.type])}</p>
              </div>
            </div>
          </Link>
          <div className='flex shrink-0 items-center gap-1'>
            {w.isDefault ? (
              <Badge variant='outline' className='gap-1 border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'>
                <Star className='h-3 w-3 fill-current' />
                {t('Default')}
              </Badge>
            ) : null}
            {!w.isActive ? <Badge variant='secondary'>{t('Archived')}</Badge> : null}
            {canManage ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant='ghost' size='icon' className='h-8 w-8'>
                    <MoreVertical className='h-4 w-4' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end'>
                  <DropdownMenuItem onClick={onEdit}>
                    <Pencil className='mr-2 h-4 w-4' />
                    {t('Edit')}
                  </DropdownMenuItem>
                  {!w.isDefault && w.isActive ? (
                    <DropdownMenuItem onClick={onMakeDefault}>
                      <Star className='mr-2 h-4 w-4' />
                      {t('Make default')}
                    </DropdownMenuItem>
                  ) : null}
                  {!w.isDefault ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={onDelete} className='text-destructive focus:text-destructive'>
                        <Trash2 className='mr-2 h-4 w-4' />
                        {t('Delete / archive')}
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>

        <div className='grid grid-cols-3 gap-2 text-center'>
          <Stat label={t('Products')} value={w.products.toLocaleString()} />
          <Stat label={t('Units')} value={fmtQty(w.quantity)} />
          <Stat label={t('Value')} value={w.value === undefined ? '—' : compactMoney(formatMoney, w.value)} title={w.value === undefined ? undefined : formatMoney(w.value)} />
        </div>

        <div className='space-y-1'>
          <div className='flex justify-between text-xs text-muted-foreground'>
            <span>{t('Share of branch stock')}</span>
            <span className='tabular-nums'>{share.toFixed(share < 10 ? 1 : 0)}%</span>
          </div>
          <div className='h-1.5 overflow-hidden rounded-full bg-muted'>
            <div className={cn('h-full rounded-full', c.dot)} style={{ width: `${Math.min(100, Math.max(0, share))}%` }} />
          </div>
        </div>

        <div className='flex flex-wrap items-center gap-1.5 text-xs'>
          <span className='inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground'>
            <Boxes className='h-3 w-3' />
            {w.locations} {t('bins')}
          </span>
          {w.city || w.address ? (
            <span className='inline-flex max-w-[160px] items-center gap-1 truncate rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground'>
              <MapPin className='h-3 w-3 shrink-0' />
              <span className='truncate'>{w.city || w.address}</span>
            </span>
          ) : null}
          {w.low > 0 ? (
            <span className='inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-300'>
              {w.low} {t('low')}
            </span>
          ) : null}
          {w.negative > 0 ? (
            <span className='inline-flex items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 text-destructive'>
              <AlertTriangle className='h-3 w-3' />
              {w.negative} {t('negative')}
            </span>
          ) : null}
          {!w.allowSales ? <span className='rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground'>{t('No sales')}</span> : null}
        </div>

        <div className='flex items-center justify-between gap-2 border-t pt-3'>
          <span className='text-xs text-muted-foreground'>
            {w.lastMoveAt ? `${t('Last move')} ${fmtDate(w.lastMoveAt)}` : t('No moves yet')}
          </span>
          <div className='flex gap-1'>
            {canTransfer && w.isActive ? (
              <Button variant='outline' size='sm' className='h-8' onClick={onMove}>
                <ArrowLeftRight className='mr-1.5 h-3.5 w-3.5' />
                {t('Move')}
              </Button>
            ) : null}
            <Button asChild size='sm' className='h-8'>
              <Link to='/warehouses/$warehouseId' params={{ warehouseId: w.id }}>
                {t('Open')}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}

function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className='rounded-lg bg-muted/40 px-2 py-2' title={title}>
      <p className='truncate text-sm font-semibold tabular-nums'>{value}</p>
      <p className='text-[11px] text-muted-foreground'>{label}</p>
    </div>
  )
}
