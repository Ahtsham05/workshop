import type { ReactNode } from 'react'
import { useSelector } from 'react-redux'
import { ChevronDown, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PrintBrandingMenuItems } from '@/components/print-branding-choice'
import { usePrintBrandingEnabled } from '@/hooks/use-print-branding-enabled'
import { setNextPrintBranding, type PrintBranding } from '@/lib/print-branding'
import { PAPER_SIZE_OPTIONS, PAPER_FORMATS, type PaperSize } from '@/features/invoice/utils/paper-format'
import {
  DISTRIBUTOR_HEADER_STYLES,
  normalizeDistributorSettings,
  setNextPrintHeaderStyle,
  type DistributorHeaderStyle,
} from '@/features/invoice/utils/distributor-settings'
import { useGetBranchQuery } from '@/stores/branch.api'
import type { RootState } from '@/stores/store'

interface PrintFormatButtonProps {
  /** Called with the paper size to print — the branch default on primary click, or the picked override. */
  onPrint: (paperSize: PaperSize) => void
  /** Branch's configured default paper size (from `useBranchPaperSize()`). */
  defaultPaperSize: PaperSize
  /** Formats offered in the override dropdown. Defaults to all four. */
  allowedFormats?: PaperSize[]
  label?: string
  size?: 'sm' | 'default' | 'lg' | 'icon'
  variant?: 'default' | 'ghost' | 'outline' | 'secondary'
  className?: string
  /** Extra classes for the primary (left) button only, e.g. brand colors. */
  mainButtonClassName?: string
  /** Overrides the default `<Printer/> label` content of the primary button (e.g. a loading spinner). */
  mainButtonContent?: ReactNode
  /** Stretches the control to fill its container, with the primary button taking the remaining space. */
  fullWidth?: boolean
  disabled?: boolean
  /**
   * Sales invoices / quotations: when the branch prints on the Distributor layout, the dropdown
   * offers its header styles (With logo, Without logo, …) instead of paper sizes; the pick
   * applies to that one print and it goes on the branch's sheet size (A4 if it is set to thermal).
   * Wholesale / distributor organizations get With logo / Without logo on these invoice prints
   * whatever the template (lib/print-branding); other prints keep the paper-size dropdown.
   */
  invoiceHeaderStyles?: boolean
}

/**
 * Primary "Print" action using the branch's default paper size, plus a small
 * dropdown to print a one-off different size without changing the default.
 */
export function PrintFormatButton({
  onPrint,
  defaultPaperSize,
  allowedFormats = ['thermal80', 'thermal58', 'a4', 'a5'],
  label = 'Print',
  size = 'sm',
  variant = 'ghost',
  className,
  mainButtonClassName,
  mainButtonContent,
  fullWidth,
  disabled,
  invoiceHeaderStyles,
}: PrintFormatButtonProps) {
  const options = PAPER_SIZE_OPTIONS.filter((o) => allowedFormats.includes(o.value))
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const { data: branchData } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId || !invoiceHeaderStyles })
  const showHeaderStyles = Boolean(invoiceHeaderStyles) && branchData?.printSettings?.template === 'distributor'
  const defaultHeaderStyle = normalizeDistributorSettings(branchData?.printSettings?.distributor).headerStyle
  const sheetSize: PaperSize = PAPER_FORMATS[defaultPaperSize].family === 'thermal' ? 'a4' : defaultPaperSize
  // Invoices of a wholesale / distributor organization on any other template: With logo / Without logo, then paper sizes.
  const brandingEnabled = usePrintBrandingEnabled()
  const showBranding = Boolean(invoiceHeaderStyles) && !showHeaderStyles && brandingEnabled

  const printDefault = () => {
    setNextPrintHeaderStyle(null)
    onPrint(defaultPaperSize)
  }
  const printWithHeaderStyle = (style: DistributorHeaderStyle) => {
    setNextPrintHeaderStyle(style === defaultHeaderStyle ? null : style)
    onPrint(sheetSize)
  }
  const printWithBranding = (style: PrintBranding) => {
    setNextPrintBranding(style)
    onPrint(defaultPaperSize)
  }
  const printOnPaper = (paperSize: PaperSize) => {
    setNextPrintBranding(null)
    onPrint(paperSize)
  }

  return (
    <div className={`inline-flex items-stretch ${fullWidth ? 'w-full' : ''} ${className ?? ''}`}>
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled}
        onClick={printDefault}
        title={`${label || 'Print'} (${PAPER_SIZE_OPTIONS.find((o) => o.value === defaultPaperSize)?.label ?? defaultPaperSize})`}
        className={`rounded-r-none ${fullWidth ? 'flex-1' : ''} ${mainButtonClassName ?? ''}`}
      >
        {mainButtonContent ?? (
          <>
            <Printer className="h-4 w-4" />
            {size !== 'icon' && label && <span className="ml-1">{label}</span>}
          </>
        )}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant={variant}
            size="icon"
            disabled={disabled}
            className="rounded-l-none border-l px-1.5 w-6"
            title={showHeaderStyles || showBranding ? 'Print with or without logo' : 'Choose a different paper size'}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {showHeaderStyles ? (
            <>
              <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                Print invoice as · {PAPER_SIZE_OPTIONS.find((o) => o.value === sheetSize)?.label ?? sheetSize}
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup value={defaultHeaderStyle} onValueChange={(v) => printWithHeaderStyle(v as DistributorHeaderStyle)}>
                {DISTRIBUTOR_HEADER_STYLES.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    <div className="flex flex-col">
                      <span>
                        {option.label}
                        {option.value === defaultHeaderStyle && <span className="ms-1.5 text-xs text-muted-foreground">(default)</span>}
                      </span>
                      <span className="text-xs text-muted-foreground">{option.description}</span>
                    </div>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </>
          ) : (
            <>
              {showBranding && (
                <>
                  <PrintBrandingMenuItems
                    heading={`Print as · ${PAPER_SIZE_OPTIONS.find((o) => o.value === defaultPaperSize)?.label ?? defaultPaperSize}`}
                    onPick={printWithBranding}
                  />
                  {options.length > 1 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Paper size</DropdownMenuLabel>
                    </>
                  )}
                </>
              )}
              {(!showBranding || options.length > 1) && (
                <DropdownMenuRadioGroup value={defaultPaperSize} onValueChange={(v) => printOnPaper(v as PaperSize)}>
                  {options.map((option) => (
                    <DropdownMenuRadioItem key={option.value} value={option.value}>
                      <div className="flex flex-col">
                        <span>{option.label}</span>
                        <span className="text-xs text-muted-foreground">{option.description}</span>
                      </div>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
