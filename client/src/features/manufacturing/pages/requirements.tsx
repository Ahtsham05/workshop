import { Fragment, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronDown, ChevronRight, ListChecks } from 'lucide-react'
import { useGetRequirementsQuery } from '@/stores/manufacturing.api'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatusBadge } from '../components/badges'
import { EmptyState, SectionHeader } from '../components/manufacturing-shell'
import { fmtQty } from '../lib/constants'

/** Outstanding material needs of all open orders vs on-hand stock (no MRP netting yet). */
export default function RequirementsPage() {
  const { t } = useLanguage()
  const [shortOnly, setShortOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const { data, isLoading } = useGetRequirementsQuery()

  const lines = (data?.lines || []).filter(
    (l) =>
      (!shortOnly || l.shortageQuantity > 0) &&
      (!search || l.productName.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className='space-y-4'>
      <SectionHeader
        title={t('Material requirements')}
        description={t(
          'What every planned, released and running order still needs, against what is on the shelf right now.'
        )}
      />
      <div className='grid grid-cols-3 gap-3'>
        {[
          [t('Open orders'), data?.orderCount ?? 0],
          [t('Materials needed'), data?.materialCount ?? 0],
          [t('Short materials'), data?.shortageCount ?? 0],
        ].map(([label, value], i) => (
          <Card key={String(label)}>
            <CardContent className='p-4'>
              <div className='text-muted-foreground text-xs'>{label}</div>
              <div
                className={cn(
                  'text-2xl font-semibold tabular-nums',
                  i === 2 &&
                    Number(value) > 0 &&
                    'text-rose-600 dark:text-rose-400'
                )}
              >
                {value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className='space-y-3 p-4 max-sm:p-3'>
          <div className='flex flex-wrap items-center gap-3'>
            <Input
              placeholder={t('Filter materials…')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className='h-9 w-64 max-sm:w-full'
            />
            <label className='flex items-center gap-2 text-sm'>
              <input
                type='checkbox'
                checked={shortOnly}
                onChange={(e) => setShortOnly(e.target.checked)}
                className='accent-primary'
              />
              {t('Shortages only')}
            </label>
          </div>
          <div className='overflow-x-auto rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow className='bg-muted/40'>
                  <TableHead>{t('Material')}</TableHead>
                  <TableHead className='text-right'>
                    {t('Outstanding need')}
                  </TableHead>
                  <TableHead className='text-right'>{t('On hand')}</TableHead>
                  <TableHead className='text-right'>{t('Shortage')}</TableHead>
                  <TableHead className='text-right'>{t('Orders')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Skeleton className='h-20 w-full' />
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && lines.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <EmptyState
                        icon={ListChecks}
                        title={t('Nothing outstanding')}
                        description={t(
                          'Open orders have everything they need issued or in stock.'
                        )}
                      />
                    </TableCell>
                  </TableRow>
                )}
                {lines.map((line) => {
                  const key = `${line.branchId}:${line.productId}:${line.variantId || ''}`
                  const open = expanded === key
                  return (
                    <Fragment key={key}>
                      <TableRow
                        className='cursor-pointer'
                        onClick={() => setExpanded(open ? null : key)}
                      >
                        <TableCell>
                          <div className='flex items-center gap-1.5 font-medium'>
                            {open ? (
                              <ChevronDown className='h-3.5 w-3.5' />
                            ) : (
                              <ChevronRight className='h-3.5 w-3.5' />
                            )}
                            {line.productName}
                          </div>
                          {line.sku && (
                            <div className='text-muted-foreground pl-5 text-xs'>
                              {line.sku}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {fmtQty(line.requiredQuantity)}{' '}
                          <span className='text-muted-foreground text-xs'>
                            {line.unit}
                          </span>
                        </TableCell>
                        <TableCell className='text-muted-foreground text-right tabular-nums'>
                          {fmtQty(line.availableQuantity)}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {line.shortageQuantity > 0 ? (
                            <span className='rounded-md bg-rose-500/10 px-2 py-0.5 font-medium text-rose-700 dark:text-rose-300'>
                              −{fmtQty(line.shortageQuantity)}
                            </span>
                          ) : (
                            <span className='text-emerald-600 dark:text-emerald-400'>
                              {t('Covered')}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {line.orders?.length ?? 0}
                        </TableCell>
                      </TableRow>
                      {open && (
                        <TableRow className='bg-muted/30 hover:bg-muted/30'>
                          <TableCell colSpan={5} className='py-2'>
                            <div className='flex flex-wrap gap-2 pl-5'>
                              {line.orders?.map((o) => (
                                <Link
                                  key={o.orderId}
                                  to={
                                    `/manufacturing/production-orders/${o.orderId}` as never
                                  }
                                  className='bg-background hover:border-foreground/30 inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs'
                                >
                                  <span className='font-mono'>
                                    {o.orderNumber}
                                  </span>
                                  <StatusBadge
                                    status={o.status}
                                    className='h-5 px-1.5 text-[10px]'
                                  />
                                  <span className='text-muted-foreground tabular-nums'>
                                    {fmtQty(o.quantity)} {line.unit}
                                  </span>
                                </Link>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
