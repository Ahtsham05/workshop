import { useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { ChevronDown, Lightbulb, Search, Send } from 'lucide-react'

import type { RootState } from '@/stores/store'
import { useGetTransferSuggestionsQuery, type TransferSuggestion } from '@/stores/purchaseSuggestions.api'
import { useGetMyBranchesQuery } from '@/stores/branch.api'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'

interface SuggestedTransfersPanelProps {
  /** A destination-branch group's selected suggestions, ready to seed a bulk transfer. */
  onTransferSelected: (toBranchId: string, suggestions: TransferSuggestion[]) => void
}

// Suggestions are computed on the fly, not persisted documents (see
// purchaseSuggestions.service.js#getTransferSuggestions) — this triple is the closest
// thing they have to a stable identity for selection/dedup purposes.
function suggestionKey(s: TransferSuggestion): string {
  return `${s.fromProductId}:${s.toBranchId}:${s.toProductId}`
}

const SEARCH_THRESHOLD = 6

export function SuggestedTransfersPanel({ onTransferSelected }: SuggestedTransfersPanelProps) {
  const { t } = useLanguage()
  const activeBranchId = useSelector((s: RootState) => s.auth.activeBranchId)
  const { data: suggestions = [], isLoading } = useGetTransferSuggestionsQuery()
  const { data: branches = [] } = useGetMyBranchesQuery()

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [collapsedBranches, setCollapsedBranches] = useState<Set<string>>(new Set())

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name || id

  // Only suggestions sendable from the branch the user is currently viewing —
  // acting on a suggestion sourced from another branch requires switching to it first.
  const actionable = useMemo(
    () => suggestions.filter((s) => s.fromBranchId === activeBranchId),
    [suggestions, activeBranchId]
  )
  const otherCount = suggestions.length - actionable.length

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return actionable
    return actionable.filter((s) => s.productName.toLowerCase().includes(q) || branchName(s.toBranchId).toLowerCase().includes(q))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionable, searchQuery, branches])

  // Grouped by destination branch — a bulk transfer only ever has one destination, so this
  // is also the natural unit of selection/action. With many branches all short on the same
  // handful of products, this turns what would be dozens of flat rows into a short,
  // scannable list of branch sections (each internally capped and scrollable below).
  const groups = useMemo(() => {
    const map = new Map<string, TransferSuggestion[]>()
    for (const s of filtered) {
      if (!map.has(s.toBranchId)) map.set(s.toBranchId, [])
      map.get(s.toBranchId)!.push(s)
    }
    return [...map.entries()]
      .map(([toBranchId, items]) => ({
        toBranchId,
        items,
        totalQty: items.reduce((sum, i) => sum + i.quantity, 0),
      }))
      .sort((a, b) => branchName(a.toBranchId).localeCompare(branchName(b.toBranchId)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, branches])

  const toggleOne = (s: TransferSuggestion) => {
    const key = suggestionKey(s)
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleGroup = (items: TransferSuggestion[], nextChecked: boolean) => {
    const keys = items.map(suggestionKey)
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      keys.forEach((k) => (nextChecked ? next.add(k) : next.delete(k)))
      return next
    })
  }

  const toggleBranchCollapsed = (toBranchId: string) => {
    setCollapsedBranches((prev) => {
      const next = new Set(prev)
      if (next.has(toBranchId)) next.delete(toBranchId)
      else next.add(toBranchId)
      return next
    })
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className='h-5 w-48' />
        </CardHeader>
        <CardContent>
          <Skeleton className='h-16 w-full' />
        </CardContent>
      </Card>
    )
  }

  if (suggestions.length === 0) return null

  return (
    <Card className='border-amber-200 bg-amber-50/40'>
      <CardHeader className='flex flex-row flex-wrap items-start justify-between gap-3 space-y-0'>
        <div>
          <CardTitle className='flex items-center gap-2 text-base'>
            <Lightbulb className='h-4 w-4 text-amber-600' />
            {t('Suggested transfers')}
            {actionable.length > 0 && <Badge variant='secondary' className='font-normal'>{actionable.length}</Badge>}
          </CardTitle>
          <CardDescription>
            {t('Generated automatically from stock levels and sales velocity across branches')}
          </CardDescription>
        </div>
        {actionable.length > SEARCH_THRESHOLD && (
          <div className='relative w-full max-w-[240px]'>
            <Search className='absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground' />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('Search product or branch...')}
              className='h-8 bg-white pl-8 text-sm'
            />
          </div>
        )}
      </CardHeader>
      <CardContent className='space-y-3'>
        {actionable.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('No actionable suggestions from this branch right now.')}
          </p>
        ) : groups.length === 0 ? (
          <p className='text-sm text-muted-foreground'>{t('No suggestions match your search.')}</p>
        ) : (
          groups.map((group) => {
            const groupKeys = group.items.map(suggestionKey)
            const selectedItems = group.items.filter((s) => selectedKeys.has(suggestionKey(s)))
            const allSelected = selectedItems.length === groupKeys.length
            const someSelected = selectedItems.length > 0 && !allSelected
            const isCollapsed = collapsedBranches.has(group.toBranchId)

            return (
              <div key={group.toBranchId} className='overflow-hidden rounded-lg border bg-white'>
                <div className='flex flex-wrap items-center gap-3 border-b bg-muted/40 px-3 py-2'>
                  <Checkbox
                    checked={someSelected ? 'indeterminate' : allSelected}
                    onCheckedChange={(checked) => toggleGroup(group.items, checked !== false)}
                    aria-label={t('Select all for this branch')}
                  />
                  <button
                    type='button'
                    onClick={() => toggleBranchCollapsed(group.toBranchId)}
                    className='flex flex-1 items-center gap-2 text-left'
                  >
                    <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', isCollapsed && '-rotate-90')} />
                    <span className='text-sm font-semibold'>{t('To')} {branchName(group.toBranchId)}</span>
                    <Badge variant='secondary' className='shrink-0 font-normal'>{group.items.length}</Badge>
                    <span className='shrink-0 text-xs text-muted-foreground'>{group.totalQty} {t('units total')}</span>
                  </button>
                  <Button
                    size='sm'
                    disabled={selectedItems.length === 0}
                    onClick={() => onTransferSelected(group.toBranchId, selectedItems)}
                  >
                    <Send className='mr-2 h-3.5 w-3.5' />
                    {selectedItems.length > 0
                      ? t('Transfer {{n}} selected', { n: String(selectedItems.length) })
                      : t('Select products below')}
                  </Button>
                </div>

                {!isCollapsed && (
                  <div className='max-h-[280px] divide-y overflow-y-auto'>
                    {group.items.map((s) => {
                      const key = suggestionKey(s)
                      const isSelected = selectedKeys.has(key)
                      return (
                        <label
                          key={key}
                          className={cn(
                            'flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/30',
                            isSelected && 'bg-blue-50/60 dark:bg-blue-950/20'
                          )}
                        >
                          <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(s)} className='mt-0.5' />
                          <div className='min-w-0 flex-1'>
                            <div className='flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5'>
                              <span className='truncate text-sm font-medium'>{s.productName}</span>
                              <Badge variant='outline' className='shrink-0'>{s.quantity} {t('units')}</Badge>
                            </div>
                            <p className='mt-0.5 text-xs text-muted-foreground'>{s.reason}</p>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
        {otherCount > 0 && (
          <p className='pt-1 text-xs text-muted-foreground'>
            {otherCount} {t('more suggestion(s) involve other branches as the source — switch branch to act on them.')}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
