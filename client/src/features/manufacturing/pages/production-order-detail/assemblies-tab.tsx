import { Link } from '@tanstack/react-router'
import { Factory, GitBranch, Layers } from 'lucide-react'
import { toast } from 'sonner'
import {
  useCreateSubAssembliesMutation,
  useGetOrderTreeQuery,
  useTraceOrderQuery,
  type OrderTreeNode,
  type ProductionOrder,
} from '@/stores/manufacturing.api'
import { getErrorMessage } from '@/lib/get-error-message'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { ProgressBar, StatusBadge } from '../../components/badges'
import { Panel } from '../../components/page'
import { TraceTree } from '../../components/trace-views'
import { fmtQty, orderPath } from '../../lib/constants'
import { EmptyLine } from './shared'

/** Parent chain, nested sub-assembly orders (with one-click creation) and genealogy. */
export function AssembliesTab({
  order,
  canManage,
}: {
  order: ProductionOrder
  canManage: boolean
}) {
  const { t } = useLanguage()
  const { data: tree, isLoading } = useGetOrderTreeQuery(order.id)
  const [createSubs, { isLoading: creating }] = useCreateSubAssembliesMutation()
  const open = !['completed', 'cancelled'].includes(order.status)

  const create = async (recursive: boolean) => {
    try {
      const created = await createSubs({
        orderId: order.id,
        recursive,
      }).unwrap()
      if (!created.length) {
        toast.info(
          t(
            'Nothing to create — sub-assemblies are in stock or already on order'
          )
        )
      } else {
        toast.success(
          t('{{n}} sub-assembly order(s) created').replace(
            '{{n}}',
            String(created.length)
          )
        )
      }
    } catch (err) {
      toast.error(
        getErrorMessage(err, t('Could not create sub-assembly orders'))
      )
    }
  }

  const hasTree =
    !!tree &&
    (tree.ancestors.length > 0 || (tree.order.children?.length || 0) > 0)
  const chain = tree?.ancestors || []

  return (
    <div className='space-y-4'>
      <Panel
        title={
          <span className='flex items-center gap-1.5'>
            <GitBranch className='h-4 w-4' />
            {t('Assembly structure')}
          </span>
        }
        description={t(
          'Parent orders and the sub-assembly orders that feed this one'
        )}
        action={
          canManage && open ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='outline' size='sm' disabled={creating}>
                  <Layers className='mr-1.5 h-3.5 w-3.5' />
                  {t('Create sub-assembly orders')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' className='w-64'>
                <DropdownMenuItem onClick={() => create(false)}>
                  <div>
                    <div>{t('Direct sub-assemblies')}</div>
                    <div className='text-muted-foreground text-xs'>
                      {t('One level, for components short in stock')}
                    </div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => create(true)}>
                  <div>
                    <div>{t('Full nested chain')}</div>
                    <div className='text-muted-foreground text-xs'>
                      {t('Every level down to raw materials')}
                    </div>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : undefined
        }
      >
        {isLoading ? (
          <Skeleton className='h-24 w-full' />
        ) : hasTree && tree ? (
          <div className='space-y-1'>
            {chain.map((a, i) => (
              <TreeRow
                key={a.id}
                node={{ ...a, children: [] }}
                current={order.id}
                depth={i}
              />
            ))}
            <TreeRow
              node={tree.order}
              current={order.id}
              depth={chain.length}
            />
          </div>
        ) : (
          <p className='text-muted-foreground text-sm'>
            {t('No linked parent or sub-assembly orders.')}
          </p>
        )}
      </Panel>

      <GenealogyPanel orderId={order.id} />
    </div>
  )
}

function TreeRow({
  node,
  current,
  depth,
}: {
  node: OrderTreeNode
  current: string
  depth: number
}) {
  const isCurrent = node.id === current
  const pct = node.plannedQuantity
    ? (node.completedQuantity / node.plannedQuantity) * 100
    : 0
  return (
    <>
      <div
        className={cn(
          'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2 text-sm',
          isCurrent
            ? 'bg-primary/5 ring-primary/20 ring-1'
            : 'hover:bg-muted/40'
        )}
        style={{ marginLeft: `${depth * 18}px` }}
      >
        {node.orderType === 'assembly' ? (
          <Layers className='h-4 w-4 shrink-0 text-violet-600' />
        ) : (
          <Factory className='text-primary h-4 w-4 shrink-0' />
        )}
        <div className='min-w-0 flex-1'>
          {isCurrent ? (
            <span className='font-mono text-xs font-semibold'>
              {node.orderNumber}
            </span>
          ) : (
            <Link
              to={orderPath(node) as never}
              className='font-mono text-xs font-medium hover:underline'
            >
              {node.orderNumber}
            </Link>
          )}
          <div className='text-muted-foreground truncate text-xs'>
            {node.productName} · {fmtQty(node.completedQuantity)} /{' '}
            {fmtQty(node.plannedQuantity)} {node.unit}
            {node.operatorName ? ` · ${node.operatorName}` : ''}
          </div>
        </div>
        <div className='w-24 max-sm:hidden'>
          <ProgressBar value={pct} />
        </div>
        <StatusBadge
          status={node.status}
          orderType={node.orderType}
          className='h-5 px-1.5 text-[10px]'
        />
      </div>
      {node.children?.map((c) => (
        <TreeRow key={c.id} node={c} current={current} depth={depth + 1} />
      ))}
    </>
  )
}

function GenealogyPanel({ orderId }: { orderId: string }) {
  const { t } = useLanguage()
  const { data, isLoading, error } = useTraceOrderQuery(orderId)
  return (
    <Panel
      title={t('Genealogy')}
      description={t(
        'What this order produced, the components it consumed, their batches and serials, and the supplier or sub-assembly order each came from.'
      )}
    >
      {isLoading ? (
        <Skeleton className='h-40 w-full' />
      ) : data ? (
        <TraceTree node={data} />
      ) : (
        <EmptyLine text={getErrorMessage(error, t('No trace available'))} />
      )}
    </Panel>
  )
}
