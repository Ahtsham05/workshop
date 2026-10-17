import { Calculator } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CALCULATOR_SHORTCUT_LABEL, toggleCalculator, useCalculatorState } from '@/features/calculator/lib/calculator-store'

/** Header entry point for the floating Business Calculator (also Ctrl+Alt+C and Ctrl+K). */
export function CalculatorButton({ className }: { className?: string }) {
  const { isOpen, isMinimized } = useCalculatorState()
  const active = isOpen && !isMinimized
  return (
    <Button
      variant='ghost'
      size='icon'
      onClick={toggleCalculator}
      className={cn('relative rounded-full', className)}
      title={`Calculator (${CALCULATOR_SHORTCUT_LABEL})`}
      aria-label='Open calculator'
      aria-pressed={active}
    >
      <Calculator className={cn('size-[1.2rem]', isOpen && 'text-primary')} />
    </Button>
  )
}
