import { useEffect } from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from '@/stores/store'
import { useGetBranchQuery } from '@/stores/branch.api'
import { setActivePrintColors } from '@/lib/print-colors'
import { setActivePrintDesign } from '@/lib/print-design'
import { setActiveDistributorSettings } from '@/features/invoice/utils/distributor-settings'

/**
 * Hands the active branch's print colours, invoice-designer settings and Distributor-template details (Settings → Printing) to the invoice / purchase
 * print generators, so every print call site picks them up without passing them along.
 */
export function PrintColorsSync() {
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const { data: branch } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })
  const colors = branch?.printSettings?.colors
  const design = branch?.printSettings?.design
  const distributor = branch?.printSettings?.distributor
  useEffect(() => {
    setActivePrintColors(colors)
  }, [colors])
  useEffect(() => {
    setActivePrintDesign(design)
  }, [design])
  useEffect(() => {
    setActiveDistributorSettings(distributor)
  }, [distributor])
  return null
}
