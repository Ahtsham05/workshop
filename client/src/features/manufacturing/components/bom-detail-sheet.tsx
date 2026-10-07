import { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  Lock,
  Pencil,
  Power,
  Star,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  useDeleteBomMutation,
  useExplodeBomQuery,
  useGetBomQuery,
  useGetBomVersionsQuery,
  useGetWhereUsedQuery,
  useSetBomActiveMutation,
  useSetDefaultBomMutation,
  type Bom,
  type BomTreeNode,
} from '@/stores/manufacturing.api'
import { getErrorMessage } from '@/lib/get-error-message'
import { cn } from '@/lib/utils'
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
import { useConfirm } from '../lib/confirm'
import { fmtDate, fmtQty } from '../lib/constants'
import { BomEditorDialog, type BomEditorMode } from './bom-editor-dialog'

export function BomStateBadges({
  bom,
}: {
  bom: Pick<Bom, 'isActive' | 'isDefault' | 'isLocked'>
}) {
  const { t } = useLanguage()
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
  const confirm = useConfirm()
  const { hasPermission } = usePermissions()
  const canManage = hasPermission('manageBoms')
  const { data: bom, isLoading } = useGetBomQuery(bomId)
  const [editor, setEditor] = useState<BomEditorMode | null>(null)
  const [setDefault] = useSetDefaultBomMutation()
  const [setActive] = useSetBomActiveMutation()
  const [deleteBom] = useDeleteBomMutation()

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
            <Skeleton className='h-10 w-64' />
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
              {canManage && (
                <div className='flex flex-wrap gap-2 pt-2'>
                  {!bom.isLocked && (
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => setEditor('edit')}
                    >
                      <Pencil className='mr-1.5 h-3.5 w-3.5' />
                      {t('Edit')}
                    </Button>
                  )}
                  <Button
                    size='sm'
                    variant={bom.isLocked ? 'default' : 'outline'}
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
                  {!bom.isLocked && (
                    <Button
                      size='sm'
                      variant='ghost'
                      className='text-destructive hover:text-destructive'
                      onClick={async () => {
                        const ok = await confirm({
                          title: t('Delete {{n}} v{{v}}?')
                            .replace('{{n}}', bom.bomNumber)
                            .replace('{{v}}', String(bom.version)),
                          description: t(
                            'This BOM version is removed permanently. This cannot be undone.'
                          ),
                          confirmText: t('Delete'),
                          destructive: true,
                        })
                        if (!ok) return
                        run(async () => {
                          await deleteBom(bom.id).unwrap()
                          onClose()
                        }, t('BOM deleted'))
                      }}
                    >
                      <Trash2 className='mr-1.5 h-3.5 w-3.5' />
                      {t('Delete')}
                    </Button>
                  )}
                </div>
              )}
              {bom.isLocked && (
                <p className='bg-muted/60 text-muted-foreground rounded-lg px-3 py-2 text-xs'>
                  {t(
                    'This version has been released to production, so its recipe is frozen. Create a new version to change it.'
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
              <TabsTrigger value='versions'>{t('Versions')}</TabsTrigger>
              <TabsTrigger value='where-used'>{t('Where used')}</TabsTrigger>
            </TabsList>
            <TabsContent value='structure' className='mt-4'>
              <StructureTab bom={bom} onSelect={onSelect} />
            </TabsContent>
            <TabsContent value='versions' className='mt-4'>
              <VersionsTab bom={bom} onSelect={onSelect} />
            </TabsContent>
            <TabsContent value='where-used' className='mt-4'>
              <WhereUsedTab productId={bom.productId} onSelect={onSelect} />
            </TabsContent>
          </Tabs>
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
}: {
  bom: Bom
  onSelect: (id: string) => void
}) {
  const { t } = useLanguage()
  const [qty, setQty] = useState(String(bom.quantity))
  const quantity = Number(qty) > 0 ? Number(qty) : bom.quantity
  const { data, isFetching } = useExplodeBomQuery({ bomId: bom.id, quantity })

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center gap-2 text-sm'>
        <span className='text-muted-foreground'>{t('Explode for')}</span>
        <Input
          type='number'
          min={0}
          step='any'
          value={qty}
          onChange={(e) => setQty(e.target.value)}
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
          />
        ))}
        {!data && <Skeleton className='m-3 h-24' />}
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
}: {
  node: BomTreeNode
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
