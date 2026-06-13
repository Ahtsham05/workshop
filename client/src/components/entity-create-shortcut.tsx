import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { CustomersActionDialog } from '@/features/customers/components/users-action-dialog'
import { SuppliersActionDialog } from '@/features/suppliers/components/users-action-dialog'
import { UsersActionDialog as ProductActionDialog } from '@/features/products/components/users-action-dialog'

export type QuickCreateEntityType = 'customer' | 'supplier' | 'product'

export type QuickCreateState = {
  type: QuickCreateEntityType
  defaultName?: string
} | null

type ShortcutButtonProps = {
  label: string
  onClick: () => void
  className?: string
}

export function EntityCreateShortcutButton({ label, onClick, className }: ShortcutButtonProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type='button'
            variant='outline'
            size='icon'
            className={cn('h-10 w-10 shrink-0', className)}
            onClick={onClick}
            aria-label={label}
          >
            <Plus className='h-4 w-4' />
          </Button>
        </TooltipTrigger>
        <TooltipContent side='top'>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

type EmptyPromptProps = {
  message: string
  actionLabel: string
  onCreate: () => void
}

export function EntityCreateEmptyPrompt({ message, actionLabel, onCreate }: EmptyPromptProps) {
  return (
    <div className='flex flex-col items-center gap-3 px-4 py-6 text-center'>
      <p className='text-sm text-muted-foreground'>{message}</p>
      <Button type='button' variant='outline' size='sm' onClick={onCreate} className='gap-2'>
        <Plus className='h-4 w-4' />
        {actionLabel}
      </Button>
    </div>
  )
}

type QuickCreateDialogsProps = {
  state: QuickCreateState
  onClose: () => void
  onCreated: (type: QuickCreateEntityType, entity: any) => void
}

export function EntityQuickCreateDialogs({ state, onClose, onCreated }: QuickCreateDialogsProps) {
  if (!state) return null

  const handleCreated = (entity: any) => {
    onCreated(state.type, entity)
    onClose()
  }

  return (
    <>
      <CustomersActionDialog
        key={`quick-customer-${state.defaultName || 'new'}`}
        open={state.type === 'customer'}
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        defaultName={state.defaultName}
        onCreated={handleCreated}
      />
      <SuppliersActionDialog
        key={`quick-supplier-${state.defaultName || 'new'}`}
        open={state.type === 'supplier'}
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        defaultName={state.defaultName}
        onCreated={handleCreated}
      />
      <ProductActionDialog
        key={`quick-product-${state.defaultName || 'new'}`}
        open={state.type === 'product'}
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        defaultName={state.defaultName}
        onCreated={handleCreated}
      />
    </>
  )
}
