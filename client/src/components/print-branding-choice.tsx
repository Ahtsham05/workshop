import type { ReactElement, ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import {
  PRINT_BRANDING_OPTIONS,
  getDefaultPrintBranding,
  setNextPrintBranding,
  type PrintBranding,
} from '@/lib/print-branding'
import { usePrintBrandingEnabled } from '@/hooks/use-print-branding-enabled'

/** "Print as" header + With logo / Without logo radio items, the branch default marked. */
export function PrintBrandingMenuItems({
  onPick,
  heading = 'Print as',
  options = PRINT_BRANDING_OPTIONS,
  defaultValue = getDefaultPrintBranding(),
}: {
  onPick: (style: PrintBranding) => void
  heading?: ReactNode
  options?: Array<{ value: PrintBranding; label: string; description: string }>
  defaultValue?: PrintBranding
}) {
  return (
    <>
      <DropdownMenuLabel className='text-xs font-medium text-muted-foreground'>{heading}</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={defaultValue} onValueChange={(v) => onPick(v as PrintBranding)}>
        {options.map((option) => (
          <DropdownMenuRadioItem key={option.value} value={option.value}>
            <div className='flex flex-col'>
              <span>
                {option.label}
                {option.value === defaultValue && <span className='ms-1.5 text-xs text-muted-foreground'>(default)</span>}
              </span>
              <span className='text-xs text-muted-foreground'>{option.description}</span>
            </div>
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  )
}

interface PrintBrandingChoiceProps {
  /** Prints with the style just picked (read by the generator via lib/print-branding). */
  onPrint: () => void
  /** The existing Print button — its own click prints with the default style. */
  children: ReactElement
  variant?: 'default' | 'ghost' | 'outline' | 'secondary'
  disabled?: boolean
  className?: string
  /** Extra classes for the ▾ trigger (e.g. brand colours of a filled main button). */
  triggerClassName?: string
}

/**
 * Wholesale / distributor organizations: puts a ▾ next to an invoice Print button offering
 * "With logo" / "Without logo" for that one print. Other organizations get the button unchanged.
 */
export function PrintBrandingChoice({ onPrint, children, variant = 'outline', disabled, className, triggerClassName }: PrintBrandingChoiceProps) {
  const enabled = usePrintBrandingEnabled()
  if (!enabled) return children

  return (
    <div className={cn('inline-flex items-stretch', className)}>
      {/* The main click always prints with the default style, clearing an earlier pick. */}
      <div className='contents [&>*]:rounded-r-none' onClickCapture={() => setNextPrintBranding(null)}>
        {children}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type='button'
            variant={variant}
            disabled={disabled}
            className={cn(
              'h-auto w-6 shrink-0 rounded-l-none px-1.5',
              variant === 'outline' ? '-ml-px' : 'border-l border-l-black/10',
              triggerClassName,
            )}
            title='Print with or without logo'
            aria-label='Print with or without logo'
          >
            <ChevronDown className='h-3.5 w-3.5' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <PrintBrandingMenuItems
            onPick={(style) => {
              setNextPrintBranding(style)
              onPrint()
            }}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
