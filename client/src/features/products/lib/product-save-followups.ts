import { getStoredLanguage, translate } from '@/i18n'
import type { AppDispatch } from '@/stores/store'
import { productVariantApi, type CreateProductVariantBody } from '@/stores/productVariant.api'
import { runBackgroundTask, type BackgroundTaskOutcome } from '@/lib/background-tasks'
import { runBranchSync, summarizeBranchSync } from '../hooks/use-branch-sync'

const t = (key: string, vars?: Record<string, string | number>) => translate(getStoredLanguage(), key, vars)

/**
 * What still has to happen once a product itself is saved: creating the variants generated
 * in the form (the variant endpoint needs the product's id), then adding the product to the
 * other branches ticked in "Also add to my other branches" — last, so its variants go too.
 *
 * None of this can fail the save (the product already exists), so it no longer holds the
 * dialog open: it runs as a background task (lib/background-tasks.ts) and the person is
 * straight back on the Products list. Returns immediately; `onVariantsSaved` fires once the
 * variants are in, so the list can refresh that row.
 *
 * Returns false when there was nothing to do.
 */
export function startProductSaveFollowUps(
  dispatch: AppDispatch,
  {
    productId,
    productName,
    variants,
    branchIds,
    onVariantsSaved,
  }: {
    productId: string
    productName: string
    variants: CreateProductVariantBody[]
    branchIds: string[]
    onVariantsSaved?: () => void
  }
): boolean {
  if (variants.length === 0 && branchIds.length === 0) return false

  runBackgroundTask({
    title: t('Finishing "{{name}}"', { name: productName }),
    errorMessage: t('Saved here, but not everything finished. Edit the product to check its variants, or retry from Added Today → Sync Across Branches.'),
    run: async ({ update }): Promise<BackgroundTaskOutcome> => {
      // One step per variant, plus one for the whole branch sync. A lone step has no
      // meaningful percentage, so progress is only shown when there are several.
      const total = variants.length + (branchIds.length ? 1 : 0)
      const progressAt = (done: number) => (total > 1 ? { done, total } : undefined)
      const notes: string[] = []
      let problem: string | undefined

      let variantFailures = 0
      for (let i = 0; i < variants.length; i += 1) {
        update({ detail: t('Saving variants ({{done}}/{{total}})', { done: i + 1, total: variants.length }), progress: progressAt(i) })
        try {
          await dispatch(productVariantApi.endpoints.createProductVariant.initiate({ productId, data: variants[i] })).unwrap()
        } catch {
          variantFailures += 1
        }
      }
      if (variants.length) {
        onVariantsSaved?.()
        if (variantFailures) {
          problem = t('{{failed}} of {{total}} variant(s) failed to save — edit the product to retry.', { failed: variantFailures, total: variants.length })
        } else {
          notes.push(t('{{count}} variant(s) saved', { count: variants.length }))
        }
      }

      if (branchIds.length) {
        update({ detail: t('Adding to your other branches'), progress: progressAt(variants.length) })
        const run = await runBranchSync(dispatch, { productIds: [productId], branchIds })
        const { created, failed, branchesReached } = summarizeBranchSync(run.result)
        const firstFailure = run.result.branches.flatMap((b) => (b.error ? [b.error] : b.failed.map((f) => f.error)))[0]
        const syncProblem = run.errorMessage ?? firstFailure ?? run.result.skipped[0]?.reason
        if (run.stoppedEarly || failed > 0 || run.result.skipped.length > 0) {
          problem = [
            problem,
            `${t('Not added to every branch')}${syncProblem ? `: ${syncProblem}` : ''}. ${t('Retry from the Products page: Added Today → Sync Across Branches.')}`,
          ]
            .filter(Boolean)
            .join(' ')
        } else if (created > 0) {
          notes.push(t('Also added to {{count}} other branch(es)', { count: branchesReached }))
        } else {
          notes.push(t('Your other branches already have this product'))
        }
      }

      if (problem) return { status: 'warning', message: [...notes, problem].join(' · ') }
      return { status: 'success', message: notes.join(' · ') }
    },
  })
  return true
}
