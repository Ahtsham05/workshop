import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  ClipboardList,
  Component,
  FileStack,
  Layers,
  Plus,
  ScanLine,
} from 'lucide-react'
import {
  useGetBomsQuery,
  useGetProductionOrdersQuery,
  useTraceLookupQuery,
} from '@/stores/manufacturing.api'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { orderPath, statusLabel } from '../lib/constants'
import { NAV_GROUPS } from '../lib/navigation'
import { StatusBadge } from './badges'

/**
 * Module-wide search: jump to a section, start a document, or find an order, BOM,
 * serial or batch by number. Results come from the server, so client-side filtering
 * is off and sections are matched here.
 */
export function CommandSearch({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const { hasPermission } = usePermissions()
  const [query, setQuery] = useState('')
  const q = useDebouncedValue(query.trim(), 250)
  const searching = q.length >= 2

  const { data: orders, isFetching: ordersLoading } =
    useGetProductionOrdersQuery(
      { search: q, limit: 6 },
      { skip: !open || !searching }
    )
  const { data: boms } = useGetBomsQuery(
    { search: q, limit: 5 },
    { skip: !open || !searching }
  )
  const { data: hits } = useTraceLookupQuery(q, { skip: !open || !searching })

  const go = (to: string, search?: Record<string, unknown>) => {
    onOpenChange(false)
    setQuery('')
    navigate({ to: to as never, search: search as never })
  }

  const needle = query.trim().toLowerCase()
  const sections = NAV_GROUPS.flatMap((g) =>
    g.sections
      .filter((s) => !s.permission || hasPermission(s.permission))
      .map((s) => ({ ...s, group: g.label }))
  ).filter(
    (s) =>
      !needle ||
      `${t(s.label)} ${s.label} ${s.group} ${s.keywords || ''}`
        .toLowerCase()
        .includes(needle)
  )

  const canCreateOrders = hasPermission('manageProductionOrders')
  const canCreateBoms = hasPermission('manageBoms')
  const creates = [
    canCreateOrders && {
      key: 'mo',
      label: t('New production order'),
      icon: ClipboardList,
      run: () => go('/manufacturing/production-orders', { new: true }),
    },
    canCreateOrders && {
      key: 'asm',
      label: t('New assembly order'),
      icon: Component,
      run: () => go('/manufacturing/assembly-orders', { new: true }),
    },
    canCreateBoms && {
      key: 'bom',
      label: t('New bill of materials'),
      icon: FileStack,
      run: () => go('/manufacturing/boms', { new: true }),
    },
  ].filter(Boolean) as {
    key: string
    label: string
    icon: React.ElementType
    run: () => void
  }[]
  const createMatches = creates.filter(
    (c) => !needle || c.label.toLowerCase().includes(needle)
  )
  const traceHits = (hits || []).filter((h) => h.kind !== 'order')
  const nothing =
    searching &&
    !ordersLoading &&
    !sections.length &&
    !createMatches.length &&
    !orders?.results.length &&
    !boms?.results.length &&
    !traceHits.length

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setQuery('')
      }}
    >
      <DialogContent className='top-[12vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl'>
        <DialogTitle className='sr-only'>
          {t('Search manufacturing')}
        </DialogTitle>
        <DialogDescription className='sr-only'>
          {t(
            'Find orders, bills of materials, serials and batches, or jump to a section.'
          )}
        </DialogDescription>
        <Command shouldFilter={false} className='rounded-none'>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={t(
              'Search orders, BOMs, serials, batches or sections…'
            )}
            className='h-12'
          />
          <CommandList className='max-h-[min(60vh,28rem)]'>
            {nothing && <CommandEmpty>{t('No matches.')}</CommandEmpty>}

            {searching && !!orders?.results.length && (
              <CommandGroup heading={t('Orders')}>
                {orders.results.map((o) => (
                  <CommandItem
                    key={o.id}
                    value={`order-${o.id}`}
                    onSelect={() => go(orderPath(o))}
                    className='gap-3'
                  >
                    {o.orderType === 'assembly' ? (
                      <Component className='text-muted-foreground' />
                    ) : (
                      <ClipboardList className='text-muted-foreground' />
                    )}
                    <span className='font-mono text-xs'>{o.orderNumber}</span>
                    <span className='min-w-0 flex-1 truncate'>
                      {o.productName}
                    </span>
                    <StatusBadge
                      status={o.status}
                      orderType={o.orderType}
                      className='h-5 px-1.5 text-[10px]'
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {searching && !!boms?.results.length && (
              <CommandGroup heading={t('Bills of materials')}>
                {boms.results.map((b) => (
                  <CommandItem
                    key={b.id}
                    value={`bom-${b.id}`}
                    onSelect={() => go('/manufacturing/boms', { bomId: b.id })}
                    className='gap-3'
                  >
                    <FileStack className='text-muted-foreground' />
                    <span className='font-mono text-xs'>
                      {b.bomNumber} v{b.version}
                    </span>
                    <span className='min-w-0 flex-1 truncate'>
                      {b.productName}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {searching && traceHits.length > 0 && (
              <CommandGroup heading={t('Serials & batches')}>
                {traceHits.map((h) => (
                  <CommandItem
                    key={`${h.kind}-${h.id}`}
                    value={`trace-${h.kind}-${h.id}`}
                    onSelect={() =>
                      go('/manufacturing/traceability', {
                        kind: h.kind,
                        id: h.id,
                        label: h.label,
                      })
                    }
                    className='gap-3'
                  >
                    {h.kind === 'serial' ? (
                      <ScanLine className='text-muted-foreground' />
                    ) : (
                      <Layers className='text-muted-foreground' />
                    )}
                    <span className='font-mono text-xs'>{h.label}</span>
                    <span className='min-w-0 flex-1 truncate'>
                      {h.productName}
                    </span>
                    <span className='text-muted-foreground text-xs'>
                      {h.madeHere ? t('made here') : t('purchased')}
                      {h.status && ` · ${t(statusLabel(h.status as never))}`}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {createMatches.length > 0 && (
              <CommandGroup heading={t('Create')}>
                {createMatches.map((c) => (
                  <CommandItem
                    key={c.key}
                    value={`create-${c.key}`}
                    onSelect={c.run}
                    className='gap-3'
                  >
                    <Plus className='text-muted-foreground' />
                    {c.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {sections.length > 0 && (
              <CommandGroup heading={t('Go to')}>
                {sections.map((s) => (
                  <CommandItem
                    key={s.to}
                    value={`go-${s.to}`}
                    onSelect={() => go(s.to)}
                    className='gap-3'
                  >
                    <s.icon className='text-muted-foreground' />
                    <span className='flex-1'>{t(s.label)}</span>
                    <span className='text-muted-foreground text-xs'>
                      {t(s.group)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
          <div className='text-muted-foreground flex items-center gap-4 border-t px-3 py-2 text-[11px] max-sm:hidden'>
            <span>
              <kbd className='bg-muted rounded border px-1 font-mono'>↑↓</kbd>{' '}
              {t('navigate')}
            </span>
            <span>
              <kbd className='bg-muted rounded border px-1 font-mono'>↵</kbd>{' '}
              {t('open')}
            </span>
            <span>
              <kbd className='bg-muted rounded border px-1 font-mono'>esc</kbd>{' '}
              {t('close')}
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
