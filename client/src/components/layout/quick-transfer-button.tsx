import { ArrowLeftRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { QUICK_TRANSFER_SHORTCUT_LABEL, useQuickTransfer } from '@/features/stock-transfer/context/quick-transfer-context'

/**
 * Header entry point for Quick Stock Transfer — one click from any screen, without leaving
 * it. Hovering (or focusing) it already starts loading the form and the product list, so
 * they are usually ready by the time it is clicked.
 */
export function QuickTransferButton({ className }: { className?: string }) {
  const { t } = useLanguage()
  const quickTransfer = useQuickTransfer()
  if (!quickTransfer?.canTransfer) return null

  const label = `${t('New stock transfer')} (${QUICK_TRANSFER_SHORTCUT_LABEL})`
  return (
    <Button
      variant='ghost'
      size='icon'
      onClick={() => quickTransfer.openQuickTransfer()}
      onPointerEnter={quickTransfer.warmUp}
      onFocus={quickTransfer.warmUp}
      className={cn('rounded-full', className)}
      title={label}
      aria-label={label}
      aria-keyshortcuts='Control+Alt+S'
    >
      <ArrowLeftRight className='size-[1.2rem]' />
    </Button>
  )
}
