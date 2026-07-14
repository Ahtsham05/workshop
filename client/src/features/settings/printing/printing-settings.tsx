import { useEffect, useMemo, useState } from 'react'
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
import { INVOICE_TEMPLATE_OPTIONS, type InvoiceTemplate } from '@/features/invoice/utils/invoice-template'
import { generateA4InvoiceHTML, type PrintInvoiceData } from '@/features/invoice/utils/print-utils'

const SAMPLE_INVOICE_DATA: PrintInvoiceData = {
  invoiceNumber: 'INV-202607-000123',
  items: [
    { name: 'Premium Widget', quantity: 2, unitPrice: 450, subtotal: 900 },
    { name: 'Deluxe Gadget', quantity: 1, unitPrice: 1250, subtotal: 1250 },
    { name: 'Standard Bolt Pack', quantity: 5, unitPrice: 60, subtotal: 300 },
    { name: 'Steel Bracket', quantity: 3, unitPrice: 120, subtotal: 360 },
  ],
  customerId: 'sample-customer',
  customerName: 'Sample Customer',
  type: 'cash',
  subtotal: 2810,
  tax: 0,
  discount: 0,
  total: 2810,
  paidAmount: 2810,
  balance: 0,
  companyName: 'Your Business Name',
  companyAddress: '123 Business Street, City',
  companyPhone: '0300-1234567',
}

const THUMB_WIDTH = 200
const PAGE_WIDTH = 794
const PAGE_HEIGHT = 1123
const THUMB_SCALE = THUMB_WIDTH / PAGE_WIDTH
// Crop to a "peek" of the top of the page instead of the full A4 height — the sample
// invoice is short, so showing the whole page leaves a large blank gap underneath it.
const THUMB_HEIGHT = 230

/**
 * The generated HTML includes the on-screen "Print Options" action bar (Print/WhatsApp/
 * SMS/PDF buttons) and a decorative floating-card look meant for the real print popup —
 * neither belongs in a template design thumbnail. Strip both so the preview shows only
 * the page itself, flush to the frame.
 */
function toPreviewOnlyHtml(html: string): string {
  const chromeReset = `
    <style>
      .no-print { display: none !important; }
      body { max-width: none !important; margin: 0 !important; box-shadow: none !important; border-radius: 0 !important; }
    </style>
  `
  return html.replace('</head>', `${chromeReset}</head>`)
}

export default function PrintingSettings() {
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const { data: branchData, isLoading } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })
  const [updateBranch, { isLoading: saving }] = useUpdateBranchMutation()

  const [paperSize, setPaperSize] = useState<PaperSize>('thermal80')
  const [template, setTemplate] = useState<InvoiceTemplate>('standard')

  useEffect(() => {
    if (branchData?.printSettings?.paperSize) {
      setPaperSize(branchData.printSettings.paperSize)
    }
    setTemplate(branchData?.printSettings?.template ?? 'standard')
  }, [branchData?.printSettings?.paperSize, branchData?.printSettings?.template])

  const previewHtmlByTemplate = useMemo(() => {
    const map: Partial<Record<InvoiceTemplate, string>> = {}
    for (const option of INVOICE_TEMPLATE_OPTIONS) {
      map[option.value] = toPreviewOnlyHtml(generateA4InvoiceHTML(SAMPLE_INVOICE_DATA, 'a4', option.value))
    }
    return map
  }, [])

  const handleSave = async () => {
    if (!activeBranchId) return
    try {
      await updateBranch({ branchId: activeBranchId, body: { printSettings: { paperSize, template } } }).unwrap()
      toast.success('Printing preferences updated')
    } catch {
      toast.error('Failed to update printing preferences')
    }
  }

  const hasChanges =
    paperSize !== (branchData?.printSettings?.paperSize ?? 'thermal80') ||
    template !== (branchData?.printSettings?.template ?? 'standard')

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

              <div className="mt-8">
                <Label className="text-sm font-medium">Invoice template</Label>
                <p className="text-xs text-muted-foreground mt-1 mb-3">
                  Applies to A4/A5 sheet invoices. The thumbnail is a live preview rendered from a sample invoice.
                </p>
                <RadioGroup
                  value={template}
                  onValueChange={(value) => setTemplate(value as InvoiceTemplate)}
                  className="grid gap-4"
                  style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${THUMB_WIDTH + 24}px, 1fr))` }}
                >
                  {INVOICE_TEMPLATE_OPTIONS.map((option) => (
                    <Label
                      key={option.value}
                      htmlFor={`invoice-template-${option.value}`}
                      className={`flex flex-col gap-2 rounded-lg border p-3 cursor-pointer transition-colors ${
                        template === option.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                      }`}
                    >
                      <div
                        className="relative overflow-hidden rounded border bg-muted/40 mx-auto"
                        style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
                      >
                        <iframe
                          title={`${option.label} template preview`}
                          srcDoc={previewHtmlByTemplate[option.value]}
                          tabIndex={-1}
                          style={{
                            width: PAGE_WIDTH,
                            height: PAGE_HEIGHT,
                            border: 'none',
                            background: '#fff',
                            transform: `scale(${THUMB_SCALE})`,
                            transformOrigin: 'top left',
                            pointerEvents: 'none',
                          }}
                        />
                        <div
                          className="pointer-events-none absolute inset-x-0 bottom-0 h-8"
                          style={{ background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.9))' }}
                        />
                      </div>
                      <div className="flex items-start gap-2 min-w-0">
                        <RadioGroupItem value={option.value} id={`invoice-template-${option.value}`} className="mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <div className="font-medium text-sm">{option.label}</div>
                          <div className="text-xs text-muted-foreground">{option.description}</div>
                        </div>
                      </div>
                    </Label>
                  ))}
                </RadioGroup>
              </div>

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
