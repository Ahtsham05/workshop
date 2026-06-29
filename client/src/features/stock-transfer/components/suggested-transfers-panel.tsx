import { useMemo } from 'react'
import { useSelector } from 'react-redux'
import { Lightbulb } from 'lucide-react'

import type { RootState } from '@/stores/store'
import { useGetTransferSuggestionsQuery } from '@/stores/purchaseSuggestions.api'
import { useGetMyBranchesQuery } from '@/stores/branch.api'
import { useLanguage } from '@/context/language-context'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { TransferPrefill } from './create-transfer-dialog'

interface SuggestedTransfersPanelProps {
  onUseSuggestion: (prefill: TransferPrefill) => void
}

export function SuggestedTransfersPanel({ onUseSuggestion }: SuggestedTransfersPanelProps) {
  const { t } = useLanguage()
  const activeBranchId = useSelector((s: RootState) => s.auth.activeBranchId)
  const { data: suggestions = [], isLoading } = useGetTransferSuggestionsQuery()
  const { data: branches = [] } = useGetMyBranchesQuery()

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name || id

  // Only suggestions sendable from the branch the user is currently viewing —
  // acting on a suggestion sourced from another branch requires switching to it first.
  const actionable = useMemo(
    () => suggestions.filter((s) => s.fromBranchId === activeBranchId),
    [suggestions, activeBranchId]
  )
  const otherCount = suggestions.length - actionable.length

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
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-base'>
          <Lightbulb className='h-4 w-4 text-amber-600' />
          {t('Suggested transfers')}
        </CardTitle>
        <CardDescription>
          {t('Generated automatically from stock levels and sales velocity across branches')}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-2'>
        {actionable.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('No actionable suggestions from this branch right now.')}
          </p>
        ) : (
          actionable.map((s, i) => (
            <div
              key={`${s.fromProductId}-${s.toProductId}-${i}`}
              className='flex items-center justify-between gap-3 rounded-md border bg-white p-3'
            >
              <div className='min-w-0'>
                <p className='text-sm font-medium'>{s.productName}</p>
                <p className='text-xs text-muted-foreground'>
                  {t('To')} {branchName(s.toBranchId)} · {s.quantity} {t('units')}
                </p>
                <p className='mt-1 text-xs text-muted-foreground'>{s.reason}</p>
              </div>
              <Button
                size='sm'
                onClick={() =>
                  onUseSuggestion({
                    fromProductId: s.fromProductId,
                    fromProductName: s.productName,
                    toBranchId: s.toBranchId,
                    quantity: s.quantity,
                    reason: s.reason,
                  })
                }
              >
                {t('Review')}
              </Button>
            </div>
          ))
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
