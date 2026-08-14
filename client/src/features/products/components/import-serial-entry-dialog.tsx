import { useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, ScanLine, X } from 'lucide-react'
import { toast } from 'sonner'
import type { ImeiEntry } from '@/stores/masterProduct.api'

const entryImei = (e: ImeiEntry) => (typeof e === 'string' ? e : e.imei)
const entryImei2 = (e: ImeiEntry) => (typeof e === 'string' ? undefined : e.imei2)

/**
 * Per-row opening-serial entry for the Import dialog — same interaction as the IMEI/
 * Serial block in users-action-dialog.tsx (Enter/comma to add, badge-click to remove,
 * dual-SIM IMEI2 support), reimplemented as a standalone dialog since Import's rows
 * aren't backed by react-hook-form. Closing without hitting the target count is
 * allowed — the row that opened this dialog is responsible for blocking import until
 * `value.length === targetCount`.
 */
export function ImportSerialEntryDialog({
  open,
  onOpenChange,
  productName,
  isSerial,
  targetCount,
  value,
  onChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  productName: string
  isSerial: boolean
  targetCount: number
  value: ImeiEntry[]
  onChange: (next: ImeiEntry[]) => void
}) {
  const [draft, setDraft] = useState('')
  const [draft2, setDraft2] = useState('')
  const input1Ref = useRef<HTMLInputElement | null>(null)
  const input2Ref = useRef<HTMLInputElement | null>(null)
  const label = isSerial ? 'serial number' : 'IMEI'

  const sanitize = (raw: string) => (isSerial ? raw : raw.replace(/\D/g, '').slice(0, 15))

  const isFull = value.length >= targetCount

  const add = () => {
    if (isFull) return
    const cleaned = draft.trim()
    const cleaned2 = draft2.trim()
    if (!cleaned) return
    if (cleaned2 && cleaned2 === cleaned) {
      toast.error('IMEI and IMEI 2 cannot be the same number')
      return
    }
    const used = new Set(value.flatMap((e) => [entryImei(e), entryImei2(e)].filter(Boolean)))
    if (used.has(cleaned) || (cleaned2 && used.has(cleaned2))) {
      toast.error(`This ${label} is already entered`)
      return
    }
    const next = [...value, cleaned2 ? { imei: cleaned, imei2: cleaned2 } : cleaned]
    onChange(next)
    setDraft('')
    setDraft2('')
    // The instant the target count is reached, the pick that completes it *is* the
    // confirmation — no extra click needed, same as the Invoice serial picker.
    if (next.length >= targetCount) {
      onOpenChange(false)
    } else {
      input1Ref.current?.focus()
    }
  }

  const remove = (num: string) => onChange(value.filter((e) => entryImei(e) !== num))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2 text-base'>
            <ScanLine className='h-4 w-4 text-amber-600' />
            {isSerial ? 'Serial Numbers' : 'IMEI Numbers'}
          </DialogTitle>
          <DialogDescription className='truncate'>{productName}</DialogDescription>
        </DialogHeader>

        <div className='space-y-2'>
          <span className='text-xs font-medium text-amber-700'>{`${value.length}/${targetCount} entered`}</span>

          {isFull ? (
            <p className='text-xs text-muted-foreground'>
              All {targetCount} entered — remove one below to enter a different number.
            </p>
          ) : (
            <div className='space-y-1.5'>
              <div className='flex items-center gap-2'>
                <Input
                  ref={input1Ref}
                  autoFocus
                  placeholder={isSerial ? 'Scan or type serial number' : 'Scan or type IMEI'}
                  value={draft}
                  inputMode={isSerial ? undefined : 'numeric'}
                  onChange={(e) => setDraft(sanitize(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === ',') {
                      e.preventDefault()
                      add()
                    } else if (e.key === 'Enter') {
                      e.preventDefault()
                      if (isSerial) add()
                      else if (draft.trim()) input2Ref.current?.focus()
                    }
                  }}
                />
                {isSerial && (
                  <Button type='button' size='sm' variant='outline' className='shrink-0' onClick={add}>
                    <Plus className='h-3.5 w-3.5' />
                  </Button>
                )}
              </div>
              {!isSerial && (
                <div className='flex items-center gap-2'>
                  <Input
                    ref={input2Ref}
                    placeholder='IMEI 2 (optional)'
                    value={draft2}
                    inputMode='numeric'
                    className='min-w-0 flex-1'
                    onChange={(e) => setDraft2(sanitize(e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault()
                        add()
                      } else if (e.key === 'Backspace' && !draft2) {
                        input1Ref.current?.focus()
                      }
                    }}
                  />
                  <Button type='button' size='sm' variant='outline' className='shrink-0' onClick={add}>
                    <Plus className='h-3.5 w-3.5' />
                  </Button>
                </div>
              )}
            </div>
          )}

          {value.length > 0 && (
            <div className='flex max-h-40 flex-wrap gap-1.5 overflow-y-auto'>
              {value.map((entry, idx) => {
                const num = entryImei(entry)
                const num2 = entryImei2(entry)
                return (
                  <Badge key={`${num}-${idx}`} variant='secondary' className='gap-1 pr-1'>
                    {num2 ? `${num} · ${num2}` : num}
                    <button type='button' onClick={() => remove(num)} className='ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20'>
                      <X className='h-3 w-3' />
                    </button>
                  </Badge>
                )
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type='button' onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
