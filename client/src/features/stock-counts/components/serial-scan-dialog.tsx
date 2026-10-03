import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, ScanLine, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'
import type { CountEntry, StockCountLine } from '@/stores/stockCount.api'
import { apiError } from '../lib/labels'

interface SerialScanDialogProps {
  line: StockCountLine | null
  editable: boolean
  expectedHidden: boolean
  onClose: () => void
  onSave: (entry: CountEntry) => Promise<StockCountLine[]>
}

/**
 * Counting an IMEI / serial-tracked product: scan every unit on the shelf. Units the system
 * expects but nobody scanned are what posting writes off; scanned units the system doesn't
 * have here are flagged (they belong to another branch or were never received).
 */
export function SerialScanDialog({ line, editable, expectedHidden, onClose, onSave }: SerialScanDialogProps) {
  const { t } = useLanguage()
  const [numbers, setNumbers] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [unexpected, setUnexpected] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!line) return
    setNumbers(line.scannedImeis ?? [])
    setUnexpected(line.unexpectedImeis ?? [])
    setInput('')
  }, [line])

  if (!line) return null
  const expected = new Set(line.expectedImeis ?? [])
  const missing = expectedHidden ? [] : (line.expectedImeis ?? []).filter((n) => !numbers.includes(n))

  const add = () => {
    const value = input.replace(/\s+/g, '').trim()
    if (!value) return
    if (numbers.includes(value)) toast.info(t('Already scanned'))
    else setNumbers((list) => [value, ...list])
    setInput('')
    inputRef.current?.focus()
  }

  const save = async () => {
    setSaving(true)
    try {
      const [updated] = await onSave({ lineId: line.id, imeis: numbers })
      setUnexpected(updated?.unexpectedImeis ?? [])
      if (updated?.unexpectedImeis?.length) {
        toast.warning(t('{{n}} unit(s) are not in stock in this branch').replace('{{n}}', String(updated.unexpectedImeis.length)))
      } else {
        onClose()
      }
    } catch (err) {
      toast.error(apiError(err, t('Could not save')))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-md'>
        <DialogHeader className='text-left'>
          <DialogTitle className='flex items-center gap-2'>
            <ScanLine className='size-4 text-primary' />
            {line.name}
          </DialogTitle>
          <DialogDescription>{t('Scan or type every unit’s IMEI / serial number. Press Enter after each one.')}</DialogDescription>
        </DialogHeader>

        {editable && (
          <div className='flex gap-2'>
            <Input
              ref={inputRef}
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  add()
                }
              }}
              placeholder={t('IMEI / serial number')}
              showVoiceInput={false}
              className='h-10 font-mono'
            />
            <Button onClick={add} variant='outline' className='h-10'>
              {t('Add')}
            </Button>
          </div>
        )}

        <div className='text-sm font-medium'>
          {t('{{n}} scanned').replace('{{n}}', String(numbers.length))}
          {!expectedHidden && line.expectedImeis && ` / ${line.expectedImeis.length} ${t('expected')}`}
        </div>
        <div className='max-h-60 space-y-1 overflow-y-auto'>
          {numbers.map((n) => (
            <div
              key={n}
              className={cn(
                'flex items-center justify-between rounded border px-2 py-1 font-mono text-sm',
                unexpected.includes(n) && 'border-amber-500/40 bg-amber-500/10',
                !expectedHidden && expected.has(n) && 'border-emerald-500/30'
              )}
            >
              <span>{n}</span>
              <span className='flex items-center gap-2'>
                {unexpected.includes(n) && <span className='font-sans text-xs text-amber-700 dark:text-amber-300'>{t('not in stock here')}</span>}
                {editable && (
                  <button type='button' onClick={() => setNumbers((list) => list.filter((x) => x !== n))} aria-label={t('Remove')}>
                    <X className='size-3.5 text-muted-foreground hover:text-foreground' />
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>

        {missing.length > 0 && (
          <div className='rounded-md border border-rose-500/30 bg-rose-500/5 p-2 text-xs'>
            <div className='mb-1 font-medium text-rose-700 dark:text-rose-300'>
              {t('Not found yet ({{n}})').replace('{{n}}', String(missing.length))}
            </div>
            <div className='font-mono text-muted-foreground'>{missing.join(', ')}</div>
          </div>
        )}

        <DialogFooter className='gap-2'>
          <Button variant='outline' onClick={onClose}>
            {editable ? t('Cancel') : t('Close')}
          </Button>
          {editable && (
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className='mr-1 size-4 animate-spin' />}
              {t('Save count')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
