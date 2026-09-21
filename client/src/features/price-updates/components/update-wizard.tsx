import { useCallback, useState } from 'react'

import { DEFAULT_RULE, type ListType, type PricingRule } from '@/lib/price-update-rules'

import { loadListType, loadRule, saveListType, saveRule } from '../lib/preferences'
import { ResultStep } from './result-step'
import { ReviewStep, type AppliedResult } from './review-step'
import { SourceStep, type AnalyzedSource } from './source-step'

interface UpdateWizardProps {
  onOpenSavedMatches: () => void
  onViewHistory: (batchId: string) => void
}

/**
 * The three screens of one update: give the list → review every change → result (with Undo).
 * The rule and list type are remembered per browser; everything else starts fresh each time.
 */
export function UpdateWizard({ onOpenSavedMatches, onViewHistory }: UpdateWizardProps) {
  const [analyzed, setAnalyzed] = useState<AnalyzedSource | null>(null)
  const [applied, setApplied] = useState<AppliedResult | null>(null)
  const [listType, setListType] = useState<ListType>(() => loadListType() || 'cost')
  const [rule, setRule] = useState<PricingRule>(() => loadRule() || DEFAULT_RULE)
  // Bumped per analysis so the review screen's own state (ticks, edits) can never leak into the next list.
  const [session, setSession] = useState(0)

  const changeListType = useCallback((type: ListType) => {
    setListType(type)
    saveListType(type)
  }, [])
  const changeRule = useCallback((next: PricingRule) => {
    setRule(next)
    saveRule(next)
  }, [])

  const reset = () => {
    setAnalyzed(null)
    setApplied(null)
  }

  if (applied) return <ResultStep result={applied} onNew={reset} onViewHistory={onViewHistory} />

  if (analyzed) {
    return (
      <ReviewStep
        key={session}
        analysis={analyzed.analysis}
        source={analyzed.source}
        listType={listType}
        onListType={changeListType}
        rule={rule}
        onRule={changeRule}
        onBack={() => setAnalyzed(null)}
        onApplied={setApplied}
      />
    )
  }

  return (
    <SourceStep
      onOpenSavedMatches={onOpenSavedMatches}
      onAnalyzed={(result) => {
        // A list that says what its numbers are (labels, headers, a "Retail" column) wins over the
        // remembered choice; otherwise keep what the user used last time.
        if (result.listTypeHint) setListType(result.listTypeHint)
        setSession((n) => n + 1)
        setAnalyzed(result)
      }}
    />
  )
}
