import { useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { QuickLinkAction } from '@/stores/quickLinks.api'
import { useQuickTransfer } from '@/features/stock-transfer/context/quick-transfer-context'

/**
 * Runs a quick link (dashboard tile, voice command). Most go to their page; a few open a
 * form over the current screen instead — the person stays where they were. The page is the
 * fallback whenever the in-place form isn't available.
 */
export function useRunQuickLink() {
  const navigate = useNavigate()
  const quickTransfer = useQuickTransfer()
  return useCallback(
    (action: Pick<QuickLinkAction, 'actionKey' | 'route' | 'routeSearch'>) => {
      if (action.actionKey === 'new_stock_transfer' && quickTransfer?.canTransfer) {
        quickTransfer.openQuickTransfer()
        return
      }
      navigate({ to: action.route, search: action.routeSearch })
    },
    [navigate, quickTransfer]
  )
}
