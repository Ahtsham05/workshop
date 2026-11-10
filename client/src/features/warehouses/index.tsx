import { useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { AlertTriangle, ArrowLeftRight, ArrowRight, Boxes, Layers, Loader2, Package, Plus, Settings2, Split, Warehouse as WarehouseIcon, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useWarehouseSettings } from '@/hooks/use-warehouse-settings'
import { useFormatMoney } from '@/lib/format-money'
import { getErrorMessage } from '@/lib/get-error-message'
import { cn } from '@/lib/utils'
import {
  useDeleteWarehouseMutation,
  useGetWarehouseOverviewQuery,
  useGetWarehousesQuery,
  useSetDefaultWarehouseMutation,
  useUpdateWarehouseSettingsMutation,
  type Warehouse,
  type WarehouseCard as CardData,
  type WarehouseTransfer,
} from '@/stores/warehouse.api'
import { MovesTab } from './components/moves-tab'
import { ReplenishmentTab } from './components/replenishment-tab'
import { ReportsTab } from './components/reports-tab'
import { StockTab } from './components/stock-tab'
import { TransferDialog, type TransferPreset } from './components/transfer-dialog'
import { TransferSheet } from './components/transfer-sheet'
import { TransfersTab } from './components/transfers-tab'
import { WarehouseCard } from './components/warehouse-card'
import { WarehouseFormDialog } from './components/warehouse-form-dialog'
import { TRANSFER_STATUS_META, WAREHOUSE_PERMS, compactMoney, fmtDate, fmtQty, SHARED_STOCK_REFRESH_S } from './lib/labels'

type Tab = 'overview' | 'stock' | 'replenishment' | 'transfers' | 'moves' | 'reports'

/**
 * Warehouses hub: every warehouse of the branch, stock by warehouse, internal transfers and
 * the movement history. Hidden (menu + pickers) until Settings → Warehouses turns it on.
 */
export default function Warehouses() {
  const { t } = useLanguage()
  const settings = useWarehouseSettings()
  const search = useSearch({ strict: false }) as { tab?: Tab }
  const navigate = useNavigate()
  const tab: Tab = search.tab ?? 'overview'
  const setTab = (next: string) => navigate({ to: '/warehouses', search: next === 'overview' ? {} : { tab: next as Tab }, replace: true })

  if (settings.loaded && !settings.enabled) return <TurnOn />

  return (
    <div className='space-y-6 p-4 md:p-6 max-sm:space-y-4 max-sm:p-0'>
      <Header />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className='max-sm:flex max-sm:w-full max-sm:justify-start max-sm:overflow-x-auto'>
          <TabsTrigger value='overview'>{t('Overview')}</TabsTrigger>
          <TabsTrigger value='stock'>
            <span className='sm:hidden'>{t('Stock')}</span>
            <span className='hidden sm:inline'>{t('Stock by warehouse')}</span>
          </TabsTrigger>
          <TabsTrigger value='replenishment'>
            <span className='sm:hidden'>{t('Refill')}</span>
            <span className='hidden sm:inline'>{t('Replenishment')}</span>
          </TabsTrigger>
          <TabsTrigger value='transfers'>{t('Transfers')}</TabsTrigger>
          <TabsTrigger value='moves'>{t('Moves')}</TabsTrigger>
          <TabsTrigger value='reports'>{t('Reports')}</TabsTrigger>
        </TabsList>
        <TabsContent value='overview' className='mt-4'>
          <Overview />
        </TabsContent>
        <TabsContent value='stock' className='mt-4'>
          <StockTab />
        </TabsContent>
        <TabsContent value='replenishment' className='mt-4'>
          <ReplenishmentTab onTransfersCreated={() => setTab('transfers')} />
        </TabsContent>
        <TabsContent value='transfers' className='mt-4'>
          <TransfersTab />
        </TabsContent>
        <TabsContent value='reports' className='mt-4'>
          <ReportsTab />
        </TabsContent>
        <TabsContent value='moves' className='mt-4'>
          <MovesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Header() {
  const { t } = useLanguage()
  const { hasAnyPermission } = usePermissions()
  const canManage = hasAnyPermission(...WAREHOUSE_PERMS.manage)
  const canTransfer = hasAnyPermission(...WAREHOUSE_PERMS.transfer)
  const canSettings = hasAnyPermission(...WAREHOUSE_PERMS.settings)
  const [creating, setCreating] = useState(false)
  const [moving, setMoving] = useState(false)
  return (
    <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between max-sm:px-1'>
      <div className='flex items-center gap-3'>
        <span className='flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary'>
          <WarehouseIcon className='h-5 w-5' />
        </span>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>{t('Warehouses')}</h1>
          <p className='text-sm text-muted-foreground'>{t('Where your stock is kept — warehouses, bins and the moves between them')}</p>
        </div>
      </div>
      <div className='flex flex-wrap gap-2'>
        {canSettings ? (
          <Button variant='ghost' size='icon' asChild title={t('Warehouse settings')}>
            <Link to='/settings/warehouses'>
              <Settings2 className='h-4 w-4' />
            </Link>
          </Button>
        ) : null}
        {canTransfer ? (
          <Button variant='outline' onClick={() => setMoving(true)}>
            <ArrowLeftRight className='mr-2 h-4 w-4' />
            {t('Move stock')}
          </Button>
        ) : null}
        {canManage ? (
          <Button onClick={() => setCreating(true)}>
            <Plus className='mr-2 h-4 w-4' />
            {t('New warehouse')}
          </Button>
        ) : null}
      </div>
      <WarehouseFormDialog open={creating} onOpenChange={setCreating} />
      <TransferDialog open={moving} onOpenChange={setMoving} />
    </div>
  )
}

function Overview() {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { hasAnyPermission } = usePermissions()
  const canManage = hasAnyPermission(...WAREHOUSE_PERMS.manage)
  const canTransfer = hasAnyPermission(...WAREHOUSE_PERMS.transfer)
  const { data, isLoading } = useGetWarehouseOverviewQuery(undefined, { refetchOnMountOrArgChange: SHARED_STOCK_REFRESH_S })
  const { data: full = [] } = useGetWarehousesQuery(undefined, { skip: !canManage })
  const [editing, setEditing] = useState<Warehouse | null>(null)
  const [deleting, setDeleting] = useState<CardData | null>(null)
  const [preset, setPreset] = useState<TransferPreset | null>(null)
  const [openTransfer, setOpenTransfer] = useState<string | null>(null)
  const [editingTransfer, setEditingTransfer] = useState<WarehouseTransfer | null>(null)
  const [makeDefault] = useSetDefaultWarehouseMutation()
  const [remove] = useDeleteWarehouseMutation()

  if (isLoading || !data) {
    return (
      <div className='py-16 text-center'>
        <Loader2 className='mx-auto h-6 w-6 animate-spin text-muted-foreground' />
      </div>
    )
  }

  const { totals } = data
  const active = data.warehouses.filter((w) => w.isActive)
  const archived = data.warehouses.filter((w) => !w.isActive)
  const positiveQty = active.reduce((s, w) => s + Math.max(0, w.quantity), 0) || 1

  return (
    <div className='space-y-6'>
      <div className='grid grid-cols-2 gap-3 lg:grid-cols-5'>
        <Kpi icon={WarehouseIcon} tone='blue' label={t('Warehouses')} value={String(totals.warehouses)} />
        <Kpi icon={Package} tone='emerald' label={t('Products in stock')} value={totals.products.toLocaleString()} />
        <Kpi icon={Boxes} tone='violet' label={t('Total units')} value={fmtQty(totals.quantity)} />
        {totals.value !== undefined ? <Kpi icon={Wallet} tone='amber' label={t('Stock value')} value={compactMoney(formatMoney, totals.value)} title={formatMoney(totals.value)} /> : null}
        <Kpi icon={Split} tone='teal' label={t('In 2+ warehouses')} value={totals.split.toLocaleString()} />
      </div>

      {totals.negative > 0 ? (
        <div className='flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm'>
          <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0 text-destructive' />
          <p>
            <b>{totals.negative}</b> {t('products show a negative quantity in some warehouse — usually a sale from a warehouse before stock was moved there. Move stock in, or check the Stock tab with the “Negative” filter.')}
          </p>
        </div>
      ) : null}

      <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3'>
        {active.map((w) => (
          <WarehouseCard
            key={w.id}
            warehouse={w}
            share={(Math.max(0, w.quantity) / positiveQty) * 100}
            canManage={canManage}
            canTransfer={canTransfer}
            onEdit={() => setEditing(full.find((f) => f.id === w.id) || null)}
            onMakeDefault={async () => {
              try {
                await makeDefault(w.id).unwrap()
                toast.success(t('{{name}} is now the default warehouse').replace('{{name}}', w.name))
              } catch (err) {
                toast.error(getErrorMessage(err, t('Could not change the default')))
              }
            }}
            onDelete={() => setDeleting(w)}
            onMove={() => setPreset({ fromWarehouseId: w.id })}
          />
        ))}
        {canManage && active.length < 2 ? <AddHint /> : null}
      </div>

      {archived.length ? (
        <div className='space-y-2'>
          <p className='text-sm font-medium text-muted-foreground'>{t('Archived')}</p>
          <div className='flex flex-wrap gap-2'>
            {archived.map((w) => (
              <Button key={w.id} variant='outline' size='sm' onClick={() => setEditing(full.find((f) => f.id === w.id) || null)}>
                {w.name}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      <Card className='gap-0 p-0'>
        <div className='flex items-center justify-between border-b px-4 py-3'>
          <p className='font-semibold'>{t('Recent transfers')}</p>
          {totals.draftTransfers ? (
            <Badge variant='outline' className={TRANSFER_STATUS_META.draft.className}>
              {totals.draftTransfers} {t('drafts waiting')}
            </Badge>
          ) : null}
        </div>
        {data.recentTransfers.length === 0 ? (
          <p className='p-6 text-center text-sm text-muted-foreground'>{t('No transfers yet — use “Move stock” to send goods from one warehouse to another.')}</p>
        ) : (
          <ul className='divide-y'>
            {data.recentTransfers.map((tr) => (
              <li key={tr.id}>
                <button type='button' onClick={() => setOpenTransfer(tr.id)} className='flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted/40'>
                  <span className='w-32 shrink-0 font-mono text-xs font-medium'>{tr.number}</span>
                  <span className='flex min-w-0 flex-1 items-center gap-1.5'>
                    <span className='truncate'>{tr.from?.name}</span>
                    <ArrowRight className='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
                    <span className='truncate'>{tr.to?.name}</span>
                  </span>
                  <span className='hidden text-muted-foreground sm:inline'>{fmtDate(tr.date)}</span>
                  <span className='w-20 text-right tabular-nums'>{fmtQty(tr.totalQuantity)}</span>
                  <Badge variant='outline' className={cn('w-20 justify-center', TRANSFER_STATUS_META[tr.status].className)}>
                    {t(TRANSFER_STATUS_META[tr.status].label)}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <WarehouseFormDialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)} warehouse={editing} />
      <TransferDialog
        open={Boolean(preset) || Boolean(editingTransfer)}
        onOpenChange={(o) => {
          if (!o) {
            setPreset(null)
            setEditingTransfer(null)
          }
        }}
        preset={preset || undefined}
        transfer={editingTransfer}
        onSaved={(tr) => setOpenTransfer(tr.id)}
      />
      <TransferSheet
        transferId={openTransfer}
        onOpenChange={(o) => !o && setOpenTransfer(null)}
        onEdit={(tr) => {
          setOpenTransfer(null)
          setEditingTransfer(tr)
        }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('Delete {{name}}?').replace('{{name}}', deleting?.name || '')}
        desc={t('Only an empty warehouse can be removed. One with history is archived instead, so old documents still show where stock went.')}
        destructive
        confirmText={t('Delete')}
        handleConfirm={async () => {
          if (!deleting) return
          try {
            const res = await remove(deleting.id).unwrap()
            toast.success(res.archived ? t('Warehouse archived') : t('Warehouse deleted'))
          } catch (err) {
            toast.error(getErrorMessage(err, t('Could not delete the warehouse')))
          }
          setDeleting(null)
        }}
      />
    </div>
  )
}

function AddHint() {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type='button'
        onClick={() => setOpen(true)}
        className='flex min-h-[260px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center text-muted-foreground transition hover:border-primary hover:text-primary'
      >
        <Plus className='h-8 w-8' />
        <p className='font-medium'>{t('Add another warehouse')}</p>
        <p className='max-w-xs text-xs'>{t('A back store, a godown, the shop floor, a returns area — as many as you need.')}</p>
      </button>
      <WarehouseFormDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

const TONES: Record<string, string> = {
  blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  teal: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
}

export function Kpi({ icon: Icon, label, value, tone, title }: { icon: typeof Package; label: string; value: string; tone: string; title?: string }) {
  return (
    <Card className='flex-row items-center gap-3 p-4' title={title}>
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', TONES[tone])}>
        <Icon className='h-5 w-5' />
      </span>
      <div className='min-w-0'>
        <p className='truncate text-lg font-bold tabular-nums'>{value}</p>
        <p className='truncate text-xs text-muted-foreground'>{label}</p>
      </div>
    </Card>
  )
}

/** Shown while the module is off. */
function TurnOn() {
  const { t } = useLanguage()
  const { hasAnyPermission } = usePermissions()
  const canSettings = hasAnyPermission(...WAREHOUSE_PERMS.settings)
  const [save, { isLoading }] = useUpdateWarehouseSettingsMutation()
  const points = [
    { icon: WarehouseIcon, title: t('Unlimited warehouses'), text: t('Godowns, store rooms, the shop floor, returns and damaged areas — per branch.') },
    { icon: Layers, title: t('Bins & shelves'), text: t('Zone → rack → shelf → bin, so staff know exactly where an item sits.') },
    { icon: ArrowLeftRight, title: t('Internal transfers'), text: t('Draft, post and print transfer slips; cancel to send stock back.') },
    { icon: Package, title: t('Sell & receive per warehouse'), text: t('Invoices deliver from, and purchases receive into, the warehouse you pick.') },
  ]
  return (
    <div className='mx-auto max-w-3xl space-y-6 p-4 md:p-10'>
      <div className='space-y-2 text-center'>
        <span className='mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary'>
          <WarehouseIcon className='h-7 w-7' />
        </span>
        <h1 className='text-2xl font-bold tracking-tight'>{t('Multi-warehouse inventory')}</h1>
        <p className='text-muted-foreground'>{t('Keep stock in as many warehouses as you need and always know what is where. It is switched off, so nobody sees it until you turn it on.')}</p>
      </div>
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
        {points.map((p) => (
          <Card key={p.title} className='flex-row gap-3 p-4'>
            <p.icon className='mt-0.5 h-5 w-5 shrink-0 text-primary' />
            <div>
              <p className='font-medium'>{p.title}</p>
              <p className='text-sm text-muted-foreground'>{p.text}</p>
            </div>
          </Card>
        ))}
      </div>
      <p className='text-center text-sm text-muted-foreground'>
        {t('Turning it on creates a “Main Warehouse” in each branch holding all current stock — nothing moves and nothing else changes. You can turn it off again at any time.')}
      </p>
      <div className='flex justify-center'>
        {canSettings ? (
          <Button
            size='lg'
            disabled={isLoading}
            onClick={async () => {
              try {
                await save({ enabled: true }).unwrap()
                toast.success(t('Warehouses turned on'))
              } catch (err) {
                toast.error(getErrorMessage(err, t('Could not turn warehouses on')))
              }
            }}
          >
            {isLoading && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {t('Turn on warehouses')}
          </Button>
        ) : (
          <p className='text-sm'>{t('Ask an administrator to turn on warehouses in Settings → Warehouses.')}</p>
        )}
      </div>
    </div>
  )
}
