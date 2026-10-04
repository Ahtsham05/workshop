import { useState } from 'react'
import { Check, LayoutTemplate, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { useLanguage } from '@/context/language-context'
import type { SavedTableLayoutsApi } from './use-saved-table-layouts'

/** Menu items (drop inside a DropdownMenuContent) for switching/saving named column layouts. */
export function TableLayoutMenuItems({
  api,
  onResetToDefault,
  onRequestSave,
}: {
  api: SavedTableLayoutsApi
  onResetToDefault: () => void
  onRequestSave: () => void
}) {
  const { t } = useLanguage()
  const { layouts, activeLayout, isModified } = api

  return (
    <>
      <DropdownMenuLabel className='flex items-center gap-2'>
        <LayoutTemplate className='h-3.5 w-3.5' />
        {t('Saved layouts')}
        {activeLayout && isModified && (
          <span className='ml-auto text-[10px] font-normal text-amber-600 dark:text-amber-400'>{t('modified')}</span>
        )}
      </DropdownMenuLabel>
      <DropdownMenuItem
        onSelect={() => {
          api.clearActive()
          onResetToDefault()
        }}
      >
        <Check className={`mr-2 h-4 w-4 ${activeLayout ? 'opacity-0' : ''}`} />
        {t('Default layout')}
      </DropdownMenuItem>
      {layouts.map((layout) => (
        <DropdownMenuItem key={layout.id} onSelect={() => api.applyLayout(layout.id)} className='group/layout pr-1'>
          <Check className={`mr-2 h-4 w-4 shrink-0 ${activeLayout?.id === layout.id ? '' : 'opacity-0'}`} />
          <span className='min-w-0 flex-1 truncate'>{layout.name}</span>
          <button
            type='button'
            aria-label={`${t('Delete layout')} ${layout.name}`}
            className='ml-2 rounded p-1 text-muted-foreground opacity-60 hover:bg-destructive/10 hover:text-destructive hover:opacity-100'
            onClick={(e) => {
              e.stopPropagation()
              api.remove(layout.id)
            }}
          >
            <Trash2 className='h-3.5 w-3.5' />
          </button>
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      {activeLayout && isModified && (
        <DropdownMenuItem onSelect={() => api.updateActive()}>
          <Save className='mr-2 h-4 w-4' />
          {t('Update')} “{activeLayout.name}”
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onSelect={onRequestSave}>
        <Save className='mr-2 h-4 w-4' />
        {t('Save current layout as…')}
      </DropdownMenuItem>
    </>
  )
}

/** Name prompt for "Save current layout as…" — rendered outside the dropdown so it survives it closing. */
export function SaveLayoutDialog({
  open,
  onOpenChange,
  api,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  api: SavedTableLayoutsApi
}) {
  const { t } = useLanguage()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    const err = api.saveAs(name)
    if (err) {
      setError(err)
      return
    }
    setName('')
    setError(null)
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setName('')
          setError(null)
        }
        onOpenChange(o)
      }}
    >
      <DialogContent className='sm:max-w-sm'>
        <DialogHeader>
          <DialogTitle>{t('Save column layout')}</DialogTitle>
          <DialogDescription>
            {t('Saves which columns are shown, their order and their widths so you can switch back any time.')}
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-1'>
          <Input
            autoFocus
            value={name}
            maxLength={40}
            placeholder={t('e.g. Counter view')}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
            }}
          />
          {error && <p className='text-xs text-destructive'>{t(error)}</p>}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button onClick={submit}>{t('Save layout')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
