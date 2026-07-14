import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PackageOpen, Trash2 } from 'lucide-react'
import type { FastBillHeldRecord } from '@/lib/pos-hold-storage'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  held: FastBillHeldRecord[]
  onResume: (record: FastBillHeldRecord) => void
  onDelete: (id: string) => void
}

export function HeldCartsSheet({ open, onOpenChange, held, onResume, onDelete }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side='right' className='w-full sm:max-w-md'>
        <SheetHeader>
          <SheetTitle>Held Carts</SheetTitle>
        </SheetHeader>
        <ScrollArea className='h-[calc(100vh-100px)] px-4'>
          {held.length === 0 ? (
            <div className='flex flex-col items-center justify-center py-16 text-center text-muted-foreground'>
              <PackageOpen className='mb-2 h-10 w-10 opacity-35' />
              <p className='text-sm'>No held carts</p>
            </div>
          ) : (
            <ul className='space-y-2 pb-4'>
              {held.map((record) => {
                const items = record.snapshot.cart as Array<{ quantity: number; unitPrice: number }>
                const total = items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0)
                return (
                  <li key={record.id} className='rounded-lg border border-border/70 p-3'>
                    <div className='flex items-center justify-between'>
                      <span className='font-medium'>{record.label}</span>
                      <Badge variant='secondary'>{items.length} items</Badge>
                    </div>
                    <p className='mt-0.5 text-xs text-muted-foreground'>
                      {new Date(record.savedAt).toLocaleString()} · Rs{total.toFixed(2)}
                    </p>
                    <div className='mt-2 flex gap-2'>
                      <Button type='button' size='sm' className='h-7 flex-1 text-xs' onClick={() => onResume(record)}>
                        Resume
                      </Button>
                      <Button
                        type='button'
                        size='icon'
                        variant='ghost'
                        className='h-7 w-7 text-muted-foreground hover:text-destructive'
                        onClick={() => onDelete(record.id)}
                      >
                        <Trash2 className='h-3.5 w-3.5' />
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
