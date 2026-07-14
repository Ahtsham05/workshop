import { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import { Loader2, Printer } from 'lucide-react'
import ContentSection from '../components/content-section'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useGetBranchQuery, useUpdateBranchMutation } from '@/stores/branch.api'
import type { RootState } from '@/stores/store'
import { PAPER_SIZE_OPTIONS, type PaperSize } from '@/features/invoice/utils/paper-format'

export default function PrintingSettings() {
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const { data: branchData, isLoading } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })
  const [updateBranch, { isLoading: saving }] = useUpdateBranchMutation()

  const [paperSize, setPaperSize] = useState<PaperSize>('thermal80')

  useEffect(() => {
    if (branchData?.printSettings?.paperSize) {
      setPaperSize(branchData.printSettings.paperSize)
    }
  }, [branchData?.printSettings?.paperSize])

  const handleSave = async () => {
    if (!activeBranchId) return
    try {
      await updateBranch({ branchId: activeBranchId, body: { printSettings: { paperSize } } }).unwrap()
      toast.success('Default paper size updated')
    } catch {
      toast.error('Failed to update paper size')
    }
  }

  const hasChanges = paperSize !== (branchData?.printSettings?.paperSize ?? 'thermal80')

  return (
    <ContentSection
      title="Printing"
      desc="Choose the default paper size used across invoices, receipts, and statements for this branch."
    >
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <>
              <RadioGroup
                value={paperSize}
                onValueChange={(value) => setPaperSize(value as PaperSize)}
                className="grid grid-cols-1 sm:grid-cols-2 gap-3"
              >
                {PAPER_SIZE_OPTIONS.map((option) => (
                  <Label
                    key={option.value}
                    htmlFor={`paper-size-${option.value}`}
                    className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                      paperSize === option.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                    }`}
                  >
                    <RadioGroupItem value={option.value} id={`paper-size-${option.value}`} className="mt-0.5" />
                    <div className="flex items-start gap-2 min-w-0">
                      <Printer className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-sm">{option.label}</div>
                        <div className="text-xs text-muted-foreground">{option.description}</div>
                      </div>
                    </div>
                  </Label>
                ))}
              </RadioGroup>

              <div className="flex justify-end mt-6">
                <Button onClick={handleSave} disabled={saving || !hasChanges}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save'
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </ContentSection>
  )
}
