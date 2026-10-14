import { useEffect, useMemo, useState } from 'react'
import { ClipboardPaste } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { resolvePasted, type PasteResult } from './paste'
import { parsePasted } from './search'
import type { PastedLine, ProductSource } from './types'

const toText = (lines: PastedLine[]) =>
  lines
    .map((l) =>
      [l.productText, l.quantity ?? '', l.rate ?? '', ...l.extra]
        .join('\t')
        .replace(/\t+$/, '')
    )
    .join('\n')

/**
 * Paste rows copied from Excel / Google Sheets or a CSV: product code or name, quantity,
 * rate. Matched lines become rows; the rest stay here to fix and add again.
 */
export function BulkPasteDialog({
  open,
  initialText,
  products,
  onAdd,
  onClose,
  t,
}: {
  open: boolean
  initialText?: string
  products: ProductSource
  onAdd: (resolved: PasteResult['resolved']) => void
  onClose: () => void
  t: (s: string) => string
}) {
  const [text, setText] = useState(initialText || '')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => {
    if (open) {
      setText(initialText || '')
      setNote(null)
    }
  }, [open, initialText])
  const parsed = useMemo(() => parsePasted(text), [text])

  const add = async () => {
    setBusy(true)
    try {
      const { resolved, unresolved } = await resolvePasted(parsed, products)
      if (resolved.length) onAdd(resolved)
      if (!unresolved.length) {
        onClose()
        return
      }
      setText(toText(unresolved))
      setNote(
        `${resolved.length} ${t('added')} · ${unresolved.length} ${t(
          'not matched (lines'
        )} ${unresolved.map((l) => l.line).join(', ')}) — ${t('fix the code or name and add again')}`
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>{t('Paste rows')}</DialogTitle>
          <DialogDescription>
            {t(
              'Copy rows from Excel, Google Sheets or a CSV: product code or name, quantity, rate — one item per line.'
            )}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus
          rows={10}
          value={text}
          spellCheck={false}
          aria-label={t('Rows to paste')}
          placeholder={'FAN-56-WHT\t10\t8500\nCopper wire 0.35mm\t2.5\t3200'}
          className='[field-sizing:fixed] max-h-[45vh] overflow-y-auto font-mono text-xs'
          onChange={(e) => {
            setText(e.target.value)
            setNote(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              e.stopPropagation()
              void add()
            }
          }}
        />
        <p className='text-muted-foreground text-xs'>
          {parsed.length} {t('line(s) ready')} · Ctrl+Enter {t('to add')}
        </p>
        {note && (
          <p
            role='status'
            className='rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300'
          >
            {note}
          </p>
        )}
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            {t('Close')}
          </Button>
          <Button onClick={add} disabled={busy || parsed.length === 0}>
            <ClipboardPaste className='mr-2 h-4 w-4' />
            {t('Add rows')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
