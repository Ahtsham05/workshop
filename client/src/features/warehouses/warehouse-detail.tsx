import { useState } from 'react'
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { AlertTriangle, ArrowLeft, ArrowLeftRight, Boxes, Loader2, MapPin, Package, Pencil, Phone, Star, User, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useWarehouseSettings } from '@/hooks/use-warehouse-settings'
import { useFormatMoney } from '@/lib/format-money'
import { getErrorMessage } from '@/lib/get-error-message'
import { cn } from '@/lib/utils'
import { useGetWarehouseOverviewQuery, useGetWarehouseQuery, useSetDefaultWarehouseMutation } from '@/stores/warehouse.api'
import { Kpi } from './index'
import { LocationsPanel } from './components/locations-panel'
import { MovesTab } from './components/moves-tab'
import { ReorderRulesPanel } from './components/reorder-rules-panel'
import { StockTab } from './components/stock-tab'
import { TransferDialog } from './components/transfer-dialog'
import { TransfersTab } from './components/transfers-tab'
import { WarehouseFormDialog } from './components/warehouse-form-dialog'
import { WAREHOUSE_PERMS, WAREHOUSE_TYPE_LABELS, colorOf, compactMoney, fmtQty } from './lib/labels'

type Tab = 'stock' | 'locations' | 'rules' | 'transfers' | 'moves'

export default function WarehouseDetail() {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const settings = useWarehouseSettings()
  const { warehouseId } = useParams({ strict: false }) as { warehouseId: string }
  const search = useSearch({ strict: false }) as { tab?: Tab }
  const navigate = useNavigate()
  const tab: Tab = search.tab ?? 'stock'
  const setTab = (next: string) =>
    navigate({ to: '/warehouses/$warehouseId', params: { warehouseId }, search: next === 'stock' ? {} : { tab: next as Tab }, replace: true })
  const { hasAnyPermission } = usePermissions()
  const canManage = hasAnyPermission(...WAREHOUSE_PERMS.manage)
  const canTransfer = hasAnyPermission(...WAREHOUSE_PERMS.transfer)

  const { data: wh, isLoading, error } = useGetWarehouseQuery(warehouseId)
  const { data: overview } = useGetWarehouseOverviewQuery()
  const card = overview?.warehouses.find((w) => w.id === warehouseId)
  const [editing, setEditing] = useState(false)
  const [moving, setMoving] = useState(false)
  const [makeDefault, { isLoading: defaulting }] = useSetDefaultWarehouseMutation()

  if (isLoading) {
    return (
      <div className='py-20 text-center'>
        <Loader2 className='mx-auto h-6 w-6 animate-spin text-muted-foreground' />
      </div>
    )
  }
  if (!wh || error) {
    return (
      <div className='space-y-3 p-10 text-center'>
        <p className='text-muted-foreground'>{t('Warehouse not found in this branch.')}</p>
        <Button asChild variant='outline'>
          <Link to='/warehouses'>{t('Back to warehouses')}</Link>
        </Button>
      </div>
    )
  }

  const c = colorOf(wh.color)
  const manager = typeof wh.managerId === 'object' && wh.managerId ? wh.managerId.name : ''

  return (
    <div className='space-y-6 p-4 md:p-6 max-sm:space-y-4 max-sm:p-0'>
      <div className='space-y-3 max-sm:px-1'>
        <Link to='/warehouses' className='inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground'>
          <ArrowLeft className='h-4 w-4' />
          {t('All warehouses')}
        </Link>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div className='flex items-center gap-3'>
            <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-mono text-sm font-bold', c.soft, c.text)}>{wh.code.slice(0, 4)}</span>
            <div className='min-w-0'>
              <div className='flex flex-wrap items-center gap-2'>
                <h1 className='text-2xl font-bold tracking-tight'>{wh.name}</h1>
                {wh.isDefault ? (
                  <Badge variant='outline' className='gap-1 border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'>
                    <Star className='h-3 w-3 fill-current' />
                    {t('Default')}
                  </Badge>
                ) : null}
                {!wh.isActive ? <Badge variant='secondary'>{t('Archived')}</Badge> : null}
              </div>
              <p className='flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground'>
                <span>{t(WAREHOUSE_TYPE_LABELS[wh.type])}</span>
                {wh.city || wh.address ? (
                  <span className='inline-flex items-center gap-1'>
                    <MapPin className='h-3.5 w-3.5' />
                    {[wh.address, wh.city].filter(Boolean).join(', ')}
                  </span>
                ) : null}
                {wh.phone ? (
                  <span className='inline-flex items-center gap-1'>
                    <Phone className='h-3.5 w-3.5' />
                    {wh.phone}
                  </span>
                ) : null}
                {manager ? (
                  <span className='inline-flex items-center gap-1'>
                    <User className='h-3.5 w-3.5' />
                    {manager}
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          <div className='flex flex-wrap gap-2'>
            {canManage && !wh.isDefault && wh.isActive ? (
              <Button
                variant='outline'
                disabled={defaulting}
                onClick={async () => {
                  try {
                    await makeDefault(wh.id).unwrap()
                    toast.success(t('{{name}} is now the default warehouse').replace('{{name}}', wh.name))
                  } catch (err) {
                    toast.error(getErrorMessage(err, t('Could not change the default')))
                  }
                }}
              >
                <Star className='mr-2 h-4 w-4' />
                {t('Make default')}
              </Button>
            ) : null}
            {canManage ? (
              <Button variant='outline' onClick={() => setEditing(true)}>
                <Pencil className='mr-2 h-4 w-4' />
                {t('Edit')}
              </Button>
            ) : null}
            {canTransfer && wh.isActive ? (
              <Button onClick={() => setMoving(true)}>
                <ArrowLeftRight className='mr-2 h-4 w-4' />
                {t('Move stock')}
              </Button>
            ) : null}
          </div>
        </div>
        {wh.isDefault ? (
          <p className='rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground'>
            {t('Default warehouse: sales, purchases, returns, adjustments and branch transfers that do not name a warehouse take stock from / put stock here.')}
          </p>
        ) : null}
      </div>

      {card ? (
        <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
          <Kpi icon={Package} tone='emerald' label={t('Products in stock')} value={card.products.toLocaleString()} />
          <Kpi icon={Boxes} tone='violet' label={t('Total units')} value={fmtQty(card.quantity)} />
          {card.value !== undefined ? <Kpi icon={Wallet} tone='amber' label={t('Stock value')} value={compactMoney(formatMoney, card.value)} title={formatMoney(card.value)} /> : null}
          <Kpi icon={AlertTriangle} tone='teal' label={t('Low / negative')} value={`${card.low} / ${card.negative}`} />
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className='max-sm:flex max-sm:w-full max-sm:justify-start max-sm:overflow-x-auto'>
          <TabsTrigger value='stock'>{t('Stock')}</TabsTrigger>
          {settings.useLocations ? <TabsTrigger value='locations'>{t('Bins')}</TabsTrigger> : null}
          <TabsTrigger value='rules'>{t('Reorder rules')}</TabsTrigger>
          <TabsTrigger value='transfers'>{t('Transfers')}</TabsTrigger>
          <TabsTrigger value='moves'>{t('Moves')}</TabsTrigger>
        </TabsList>
        <TabsContent value='stock' className='mt-4'>
          <StockTab warehouseId={wh.id} />
        </TabsContent>
        {settings.useLocations ? (
          <TabsContent value='locations' className='mt-4'>
            <LocationsPanel warehouseId={wh.id} />
          </TabsContent>
        ) : null}
        <TabsContent value='rules' className='mt-4'>
          <ReorderRulesPanel warehouseId={wh.id} isDefault={wh.isDefault} />
        </TabsContent>
        <TabsContent value='transfers' className='mt-4'>
          <TransfersTab warehouseId={wh.id} preset={{ fromWarehouseId: wh.id }} />
        </TabsContent>
        <TabsContent value='moves' className='mt-4'>
          <MovesTab warehouseId={wh.id} />
        </TabsContent>
      </Tabs>

      <WarehouseFormDialog open={editing} onOpenChange={setEditing} warehouse={wh} />
      <TransferDialog open={moving} onOpenChange={setMoving} preset={{ fromWarehouseId: wh.id }} />
    </div>
  )
}
