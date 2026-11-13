import { useEffect } from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from '@/stores/store'
import { useGetBranchQuery } from '@/stores/branch.api'
import { setActivePrintColors } from '@/lib/print-colors'
import { setActivePrintDesign } from '@/lib/print-design'
import { setDefaultPrintBranding } from '@/lib/print-branding'
import { setActiveDistributorSettings, normalizeDistributorSettings } from '@/features/invoice/utils/distributor-settings'
import { usePrintBrandingEnabled } from '@/hooks/use-print-branding-enabled'

/**
 * Hands the active branch's print colours, invoice-designer settings, Distributor-template details and
 * default "With / Without logo" (Settings → Printing) to the print generators, so every print call site
 * picks them up without passing them along.
 */
export function PrintColorsSync() {
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const { data: branch } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })
  const brandingEnabled = usePrintBrandingEnabled()
  const colors = branch?.printSettings?.colors
  const design = branch?.printSettings?.design
  const distributor = branch?.printSettings?.distributor
  const template = branch?.printSettings?.template
  useEffect(() => {
    setActivePrintColors(colors)
  }, [colors])
  useEffect(() => {
    setActivePrintDesign(design)
  }, [design])
  useEffect(() => {
    setActiveDistributorSettings(distributor)
  }, [distributor])
  // Wholesale / distributor branches on the Distributor template: its Invoice header choice is the
  // default for every print. Everyone else prints with the logo unless they pick otherwise.
  const headerStyle = normalizeDistributorSettings(distributor).headerStyle
  useEffect(() => {
    setDefaultPrintBranding(brandingEnabled && template === 'distributor' ? headerStyle : 'logo')
  }, [brandingEnabled, template, headerStyle])
  return null
}
