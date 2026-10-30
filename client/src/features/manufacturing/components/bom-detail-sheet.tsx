import { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  Lock,
  Pencil,
  Power,
  Printer,
  RotateCcw,
  Star,
  Trash2,
} from 'lucide-react'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import { useGetBranchQuery } from '@/stores/branch.api'
import {
  useExplodeBomQuery,
  useGetBomQuery,
  useGetBomVersionsQuery,
  useGetWhereUsedQuery,
  useRestoreBomMutation,
  useSetBomActiveMutation,
  useSetDefaultBomMutation,
  type Bom,
  type BomExplosion,
  type BomTrackingInfo,
  type BomTreeNode,
  type ProductBatchTracking,
} from '@/stores/manufacturing.api'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import type { RootState } from '@/stores/store'
import { getErrorMessage } from '@/lib/get-error-message'
import { formatTotalsByUnit } from '@/lib/units'
import { cn } from '@/lib/utils'
import { resolveBranchCompanyName } from '@/utils/branch-company-name'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { openPrintWindowForFormat } from '@/features/invoice/utils/print-utils'
import { buildBomPrintDoc } from '../lib/bom-print'
import { fmtDate, fmtQty } from '../lib/constants'
import { generateReportHTML } from '../lib/report-print'
import { BatchBadge } from './badges'
import { BomEditorDialog, type BomEditorMode } from './bom-editor-dialog'
import { DeleteBomDialog } from './delete-bom-dialog'

export function BomStateBadges({
  bom,
}: {
  bom: Pick<Bom, 'isActive' | 'isDefault' | 'isLocked' | 'deletedAt'>
}) {
  const { t } = useLanguage()
  if (bom.deletedAt) {
    return (
      <span className='inline-flex flex-wrap gap-1'>
        <Badge
          variant='outline'
          className='gap-1 border-rose-500/30 bg-rose-500/5 text-rose-600 dark:text-rose-400'
        >
          <Trash2 className='h-3 w-3' />
          {t('Deleted')}
        </Badge>
      </span>
    )
  }
  return (
    <span className='inline-flex flex-wrap gap-1'>
      {bom.isDefault && (
        <Badge
          variant='outline'
          className='border-primary/30 bg-primary/10 text-primary gap-1'
        >
          <Star className='h-3 w-3' />
          {t('Default')}
        </Badge>
      )}
      {!bom.isActive && (
        <Badge variant='outline' className='text-muted-foreground'>
          {t('Inactive')}
        </Badge>
      )}
      {bom.isLocked && (
        <Badge variant='outline' className='text-muted-foreground gap-1'>
          <Lock className='h-3 w-3' />
          {t('Locked')}
        </Badge>
      )}
    </span>
  )
}

export function BomDetailSheet({
  bomId,
  onClose,
  onSelect,
}: {
  bomId: string
  onClose: () => void
  onSelect: (id: string) => void
}) {
  const { t } = useLanguage()
  const { hasPermission } = usePermissions()
  const canManage = hasPermission('manageBoms')
  const { data: bom, isLoading } = useGetBomQuery(bomId)
  const [editor, setEditor] = useState<BomEditorMode | null>(null)
  const [setDefault] = useSetDefaultBomMutation()
  const [setActive] = useSetBomActiveMutation()
  const [restoreBom] = useRestoreBomMutation()
  const [deleting, setDeleting] = useState(false)
  // "Explode for" quantity per BOM — the Structure tab and the print share it.
  const [explodeFor, setExplodeFor] = useState<Record<string, string>>({})
  const qtyText = bom ? (explodeFor[bom.id] ?? String(bom.quantity)) : ''
  const quantity = Number(qtyText) > 0 ? Number(qtyText) : (bom?.quantity ?? 1)
  const { data: explosion, isFetching: exploding } = useExplodeBomQuery(
    { bomId, quantity },
    { skip: !bom }
  )
  const activeBranchId = useSelector((s: RootState) => s.auth.activeBranchId)
  const user = useSelector((s: RootState) => s.auth.data?.user)
  const { data: branch } = useGetBranchQuery(activeBranchId!, {
    skip: !activeBranchId,
  })
  const { data: org } = useGetMyOrganizationQuery(undefined)

  const print = () => {
    if (!bom || !explosion) return
    try {
      openPrintWindowForFormat(
        generateReportHTML(
          buildBomPrintDoc(bom, explosion, quantity, t),
          {
            companyName:
              resolveBranchCompanyName(org?.name, branch?.name) || org?.name,
            companyAddress: [branch?.location?.address, branch?.location?.city]
              .filter(Boolean)
              .join(', '),
            companyPhone: branch?.phone,
            companyLogo: org?.logo?.url,
            branchName: branch?.name,
            preparedBy: user?.name,
          },
          t
        ),
        'a4'
      )
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t('Could not open the print window')
      )
    }
  }

  const run = async (fn: () => Promise<unknown>, success: string) => {
    try {
      await fn()
      toast.success(success)
    } catch (err) {
      toast.error(getErrorMessage(err, t('Action failed')))
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side='right'
        className='w-full gap-0 overflow-y-auto p-0 sm:max-w-2xl'
      >
        <SheetHeader className='border-b px-6 py-5'>
          {isLoading || !bom ? (
            <>
              <SheetTitle className='sr-only'>
                {t('Bill of materials')}
              </SheetTitle>
              <Skeleton className='h-10 w-64' />
            </>
          ) : (
            <>
              <div className='flex flex-wrap items-center gap-2'>
                <span className='bg-muted rounded-md px-2 py-0.5 font-mono text-xs'>
                  {bom.bomNumber}
                </span>
                <span className='rounded-md border px-2 py-0.5 text-xs'>
                  v{bom.version}
                </span>
                <BomStateBadges bom={bom} />
              </div>
              <SheetTitle className='text-xl'>
                {bom.name || bom.productName}
              </SheetTitle>
              <SheetDescription>
                {t('Builds')} {fmtQty(bom.quantity)} {bom.unit} {t('of')}{' '}
                <span className='text-foreground font-medium'>
                  {bom.productName}
                </span>
                {bom.effectiveFrom &&
                  ` · ${t('from')} ${fmtDate(bom.effectiveFrom)}`}
                {bom.effectiveTo && ` ${t('to')} ${fmtDate(bom.effectiveTo)}`}
              </SheetDescription>
              {(bom.tracking?.[bom.productId]?.trackBatch ||
                bom.tracking?.[bom.productId]?.trackExpiry) && (
                <div className='flex flex-wrap items-center gap-1.5 text-xs'>
                  <TrackingTag info={bom.tracking?.[bom.productId]} />
                  <span className='text-muted-foreground'>
                    {t('Each production order makes its own batch')}
                    {bom.productShelfLifeDays
                      ? ` · ${t('shelf life')} ${bom.productShelfLifeDays} ${t('days')}`
                      : ''}
                  </span>
                </div>
              )}
              {bom.deletedAt && (
                <div className='flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs'>
                  <span>
                    {t('Deleted on')} {fmtDate(bom.deletedAt)}.{' '}
                    {t(
                      'Kept on record for the production orders made with it; not offered for new orders.'
                    )}
                  </span>
                  {canManage && (
                    <Button
                      size='sm'
                      variant='outline'
                      className='h-7'
                      onClick={() =>
                        run(
                          () => restoreBom(bom.id).unwrap(),
                          t('Restored — activate it to use it again')
                        )
                      }
                    >
                      <RotateCcw className='mr-1.5 h-3.5 w-3.5' />
                      {t('Restore')}
                    </Button>
                  )}
                </div>
              )}
              <div className='flex flex-wrap gap-2 pt-2'>
                <Button
                  size='sm'
                  variant='outline'
                  onClick={print}
                  disabled={!explosion || exploding}
                  title={t('Print or save as PDF')}
                >
                  <Printer className='mr-1.5 h-3.5 w-3.5' />
                  {t('Print')}
                </Button>
                {canManage && !bom.deletedAt && (
                  <>
                    <Button
                      size='sm'
                      variant={bom.isLocked ? 'default' : 'outline'}
                      onClick={() => setEditor('edit')}
                    >
                      <Pencil className='mr-1.5 h-3.5 w-3.5' />
                      {t('Edit')}
                    </Button>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => setEditor('version')}
                    >
                      <GitBranch className='mr-1.5 h-3.5 w-3.5' />
                      {t('New version')}
                    </Button>
                    {!bom.isDefault && bom.isActive && (
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() =>
                          run(
                            () => setDefault(bom.id).unwrap(),
                            t('Set as default')
                          )
                        }
                      >
                        <Star className='mr-1.5 h-3.5 w-3.5' />
                        {t('Make default')}
                      </Button>
                    )}
                    <Button
                      size='sm'
                      variant='ghost'
                      onClick={() =>
                        run(
                          () =>
                            setActive({
                              bomId: bom.id,
                              isActive: !bom.isActive,
                            }).unwrap(),
                          bom.isActive ? t('Deactivated') : t('Activated')
                        )
                      }
                    >
                      <Power className='mr-1.5 h-3.5 w-3.5' />
                      {bom.isActive ? t('Deactivate') : t('Activate')}
                    </Button>
                    <Button
                      size='sm'
                      variant='ghost'
                      className='text-destructive hover:text-destructive'
                      onClick={() => setDeleting(true)}
                    >
                      <Trash2 className='mr-1.5 h-3.5 w-3.5' />
                      {t('Delete')}
                    </Button>
                  </>
                )}
              </div>
              {bom.isLocked && !bom.deletedAt && (
                <p className='bg-muted/60 text-muted-foreground rounded-lg px-3 py-2 text-xs'>
                  {t(
                    'Released to production, so this recipe stays as the orders used it. Changing components or quantity in Edit saves a new version.'
                  )}
                </p>
              )}
            </>
          )}
        </SheetHeader>

        {bom && (
          <Tabs defaultValue='structure' className='px-6 py-4'>
            <TabsList>
              <TabsTrigger value='structure'>{t('Structure')}</TabsTrigger>
              <TabsTrigger value='routing'>
                {t('Routing')}
                {(bom.operations?.length ?? 0) > 0 && (
                  <span className='text-muted-foreground ml-1.5 text-[10px]'>
                    {bom.operations!.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value='versions'>{t('Versions')}</TabsTrigger>
              <TabsTrigger value='where-used'>{t('Where used')}</TabsTrigger>
            </TabsList>
            <TabsContent value='structure' className='mt-4'>
              <StructureTab
                bom={bom}
                onSelect={onSelect}
                qty={qtyText}
                onQtyChange={(v) =>
                  setExplodeFor((prev) => ({ ...prev, [bom.id]: v }))
                }
                quantity={quantity}
                data={explosion}
                isFetching={exploding}
              />
            </TabsContent>
            <TabsContent value='routing' className='mt-4'>
              <RoutingTab bom={bom} />
            </TabsContent>
            <TabsContent value='versions' className='mt-4'>
              <VersionsTab bom={bom} onSelect={onSelect} />
            </TabsContent>
            <TabsContent value='where-used' className='mt-4'>
              <WhereUsedTab productId={bom.productId} onSelect={onSelect} />
            </TabsContent>
          </Tabs>
        )}

        {bom && (
          <DeleteBomDialog
            bom={bom}
            open={deleting}
            onOpenChange={setDeleting}
            onDeleted={onClose}
          />
        )}
        {editor && bom && (
          <BomEditorDialog
            mode={editor}
            bom={bom}
            onClose={() => setEditor(null)}
            onSaved={(saved) => onSelect(saved.id)}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

function StructureTab({
  bom,
  onSelect,
  qty,
  onQtyChange,
  quantity,
  data,
  isFetching,
}: {
  bom: Bom & BomTrackingInfo
  onSelect: (id: string) => void
  qty: string
  onQtyChange: (value: string) => void
  quantity: number
  data?: BomExplosion
  isFetching: boolean
}) {
  const { t } = useLanguage()
  const tracking = bom.tracking

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center gap-2 text-sm'>
        <span className='text-muted-foreground'>{t('Explode for')}</span>
        <Input
          type='number'
          min={0}
          step='any'
          value={qty}
          onChange={(e) => onQtyChange(e.target.value)}
          className='h-8 w-24'
        />
        <span className='text-muted-foreground'>{bom.unit}</span>
        {isFetching && (
          <span className='text-muted-foreground text-xs'>
            {t('Calculating…')}
          </span>
        )}
      </div>
      <div className='overflow-hidden rounded-xl border'>
        <div className='bg-muted/40 text-muted-foreground grid grid-cols-[minmax(0,1fr)_6rem_5rem] gap-2 border-b px-3 py-2 text-xs font-medium'>
          <span>{t('Component')}</span>
          <span className='text-right'>{t('Required')}</span>
          <span className='text-right'>{t('Scrap')}</span>
        </div>
        {data?.tree.children.map((node, i) => (
          <TreeRow
            key={`${node.productId}-${i}`}
            node={node}
            depth={0}
            onSelect={onSelect}
            tracking={tracking}
          />
        ))}
        {!data && <Skeleton className='m-3 h-24' />}
        {data && data.tree.children.length > 0 && (
          <div className='bg-muted/40 grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-t px-3 py-2 text-sm font-semibold'>
            <span>
              {t('Total')}{' '}
              <span className='text-muted-foreground text-xs font-normal'>
                ({t('for')} {fmtQty(quantity)} {bom.unit})
              </span>
            </span>
            <span className='text-right tabular-nums'>
              {formatTotalsByUnit(
                data.tree.children.map((n) => ({
                  quantity: n.requiredQuantity,
                  unit: n.unit,
                }))
              )}
            </span>
          </div>
        )}
      </div>
      <p className='text-muted-foreground text-xs'>
        {t(
          'Required quantities include each line’s scrap allowance. Sub-assemblies show their own BOM underneath.'
        )}
      </p>
    </div>
  )
}

function TreeRow({
  node,
  depth,
  onSelect,
  tracking,
}: {
  node: BomTreeNode
  tracking?: BomTrackingInfo['tracking']
  depth: number
  onSelect: (id: string) => void
}) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(depth < 1)
  const hasChildren = node.children.length > 0
  return (
    <>
      <div
        className={cn(
          'grid grid-cols-[minmax(0,1fr)_6rem_5rem] items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0',
          depth > 0 && 'bg-muted/20'
        )}
      >
        <div
          className='flex min-w-0 items-center gap-1.5'
          style={{ paddingLeft: depth * 18 }}
        >
          {hasChildren ? (
            <button
              type='button'
              onClick={() => setOpen(!open)}
              className='hover:bg-muted flex h-5 w-5 items-center justify-center rounded'
              aria-label={t('Toggle')}
            >
              {open ? (
                <ChevronDown className='h-3.5 w-3.5' />
              ) : (
                <ChevronRight className='h-3.5 w-3.5' />
              )}
            </button>
          ) : (
            <span className='text-muted-foreground/50 inline-block h-5 w-5 text-center'>
              ·
            </span>
          )}
          <span className='truncate'>{node.productName}</span>
          <TrackingTag info={tracking?.[node.productId]} />
          {node.isOptional && (
            <Badge
              variant='outline'
              className='h-5 px-1.5 text-[10px] font-normal'
            >
              {t('Optional')}
            </Badge>
          )}
          {node.alternatives.length > 0 && (
            <Badge
              variant='outline'
              className='h-5 px-1.5 text-[10px] font-normal'
              title={node.alternatives.map((a) => a.productName).join(', ')}
            >
              +{node.alternatives.length} {t('alt')}
            </Badge>
          )}
          {node.childBom && (
            <button
              type='button'
              onClick={() => onSelect(node.childBom!.id)}
              className='text-primary shrink-0 font-mono text-[10px] hover:underline'
            >
              {node.childBom.bomNumber} v{node.childBom.version}
            </button>
          )}
        </div>
        <span className='text-right tabular-nums'>
          {fmtQty(node.requiredQuantity)}{' '}
          <span className='text-muted-foreground text-xs'>{node.unit}</span>
        </span>
        <span className='text-muted-foreground text-right text-xs tabular-nums'>
          {node.scrapPercent ? `${node.scrapPercent}%` : '—'}
        </span>
      </div>
      {open &&
        node.children.map((child, i) => (
          <TreeRow
            key={`${child.productId}-${i}`}
            node={child}
            depth={depth + 1}
            onSelect={onSelect}
            tracking={tracking}
          />
        ))}
    </>
  )
}

function VersionsTab({
  bom,
  onSelect,
}: {
  bom: Bom
  onSelect: (id: string) => void
}) {
  const { t } = useLanguage()
  const { data: versions } = useGetBomVersionsQuery(bom.id)
  return (
    <ol className='relative space-y-2 border-l pl-5'>
      {versions?.map((v) => (
        <li key={v.id} className='relative'>
          <span
            className={cn(
              'border-background absolute top-3 -left-[1.6rem] h-2.5 w-2.5 rounded-full border-2',
              v.isDefault ? 'bg-primary' : 'bg-muted-foreground/40'
            )}
          />
          <button
            type='button'
            onClick={() => onSelect(v.id)}
            className={cn(
              'hover:bg-muted/50 w-full rounded-lg border px-3 py-2 text-left transition-colors',
              v.id === bom.id && 'border-primary/40 bg-primary/5'
            )}
          >
            <div className='flex flex-wrap items-center gap-2'>
              <span className='font-medium'>v{v.version}</span>
              <BomStateBadges bom={v} />
              <span className='text-muted-foreground ml-auto text-xs'>
                {fmtDate(v.createdAt)}
              </span>
            </div>
            <div className='text-muted-foreground text-xs'>
              {v.components.length} {t('components')} · {fmtQty(v.quantity)}{' '}
              {v.unit}
              {v.notes ? ` · ${v.notes}` : ''}
            </div>
          </button>
        </li>
      ))}
    </ol>
  )
}

function WhereUsedTab({
  productId,
  onSelect,
}: {
  productId: string
  onSelect: (id: string) => void
}) {
  const { t } = useLanguage()
  const { data } = useGetWhereUsedQuery(productId)
  if (data && data.length === 0) {
    return (
      <p className='text-muted-foreground py-6 text-center text-sm'>
        {t('This product is not used inside any other BOM.')}
      </p>
    )
  }
  return (
    <ul className='divide-y rounded-xl border'>
      {data?.map((entry) => (
        <li key={entry.id}>
          <button
            type='button'
            onClick={() => onSelect(entry.id)}
            className='hover:bg-muted/50 flex w-full items-center gap-3 px-3 py-2 text-left text-sm'
          >
            <span className='text-muted-foreground font-mono text-xs'>
              {entry.bomNumber} v{entry.version}
            </span>
            <span className='min-w-0 flex-1 truncate font-medium'>
              {entry.productName}
            </span>
            <span className='text-muted-foreground tabular-nums'>
              ×{fmtQty(entry.quantity)} {entry.unit}
            </span>
            {!entry.isActive && (
              <Badge variant='outline' className='text-muted-foreground'>
                {t('Inactive')}
              </Badge>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}

/** The steps orders made from this version will follow on the floor. */
function RoutingTab({ bom }: { bom: Bom }) {
  const { t } = useLanguage()
  const ops = bom.operations || []
  if (!ops.length) {
    return (
      <p className='text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm'>
        {t(
          'No routing on this version. Edit the BOM (or create a new version) to add steps like Cutting, Welding and Assembly.'
        )}
      </p>
    )
  }
  return (
    <ol className='divide-y rounded-xl border'>
      {ops.map((op, i) => (
        <li
          key={op._id || i}
          className='flex items-start gap-3 px-4 py-3 text-sm'
        >
          <span className='bg-muted text-muted-foreground mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-medium tabular-nums'>
            {i + 1}
          </span>
          <div className='min-w-0 flex-1'>
            <div className='font-medium'>{op.name}</div>
            <div className='text-muted-foreground text-xs'>
              {[
                op.workCenter,
                op.setupMinutes
                  ? `${fmtQty(op.setupMinutes)} ${t('min setup')}`
                  : null,
                op.runMinutesPerUnit
                  ? `${fmtQty(op.runMinutesPerUnit)} ${t('min / unit')}`
                  : null,
                op.costPerHour
                  ? `${fmtQty(op.costPerHour)} ${t('/ hour')}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ') || t('No timings')}
            </div>
            {op.instructions && (
              <p className='text-muted-foreground mt-1 text-xs whitespace-pre-wrap'>
                {op.instructions}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

/** "Batch" / "Batch · Exp" tag for a batch- or expiry-tracked product line. */
function TrackingTag({ info }: { info?: ProductBatchTracking }) {
  const { t } = useLanguage()
  if (!info || (!info.trackBatch && !info.trackExpiry)) return null
  return (
    <BatchBadge
      size='sm'
      mono={false}
      batchNumber={
        info.trackExpiry ? `${t('Batch')} · ${t('Exp')}` : t('Batch')
      }
      title={t('Issued and received by batch')}
      className='shrink-0'
    />
  )
}
