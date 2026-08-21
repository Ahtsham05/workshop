import { useEffect } from 'react'

import { useSidebar } from '@/components/ui/sidebar'

/**
 * Collapses the desktop nav sidebar once when the calling page mounts — used by
 * item-entry pages (Sale Invoice, Purchase Invoice, Purchase Order) that want the
 * full page width for their product/items table. Doesn't restore it on unmount,
 * so it behaves the same as the user collapsing it manually via the sidebar toggle.
 */
export function useCollapseSidebarOnMount() {
  const { setOpen, isMobile } = useSidebar()

  useEffect(() => {
    // Mobile already renders the sidebar as a closed-by-default overlay sheet
    // (separate openMobile state) — nothing to collapse there.
    if (isMobile) return
    setOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
