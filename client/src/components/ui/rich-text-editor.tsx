import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  RemoveFormatting,
  FileText,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { normalizeInvoiceNotesHtml, plainTextToEditorHtml } from '@/lib/rich-text-utils'

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  fieldLabel: string
  addButtonLabel: string
  placeholder?: string
  defaultExpanded?: boolean
  className?: string
}

function normalizeEditorHtml(html: string): string {
  const trimmed = html.trim()
  if (!trimmed || trimmed === '<br>' || trimmed === '<div><br></div>') return ''
  return html
}

export function RichTextEditor({
  value,
  onChange,
  fieldLabel,
  addButtonLabel,
  placeholder = '',
  defaultExpanded = false,
  className,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(defaultExpanded || Boolean(value.trim()))

  const syncFromEditor = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    const html = normalizeEditorHtml(normalizeInvoiceNotesHtml(editor.innerHTML))
    onChange(html)
  }, [onChange])

  const applyFormat = useCallback((command: string, commandValue?: string) => {
    editorRef.current?.focus()
    document.execCommand(command, false, commandValue)
    syncFromEditor()
  }, [syncFromEditor])

  useEffect(() => {
    if (value.trim()) {
      setExpanded(true)
    }
  }, [value])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !expanded) return
    if (document.activeElement === editor) return

    const nextHtml = value ? plainTextToEditorHtml(value) : ''
    if (editor.innerHTML !== nextHtml) {
      editor.innerHTML = nextHtml
    }
  }, [value, expanded])

  const handleExpand = () => {
    setExpanded(true)
    queueMicrotask(() => editorRef.current?.focus())
  }

  const handleCollapse = () => {
    setExpanded(false)
  }

  if (!expanded) {
    return (
      <div className={className}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground"
          onClick={handleExpand}
        >
          <FileText className="h-4 w-4" />
          {addButtonLabel}
        </Button>
      </div>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <Label>{fieldLabel}</Label>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground"
          onClick={handleCollapse}
          title="Hide"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="rounded-md border bg-background">
        <div className="flex flex-wrap items-center gap-0.5 border-b px-1 py-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormat('bold')}
            title="Bold"
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormat('italic')}
            title="Italic"
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormat('underline')}
            title="Underline"
          >
            <Underline className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormat('insertUnorderedList')}
            title="Bullet list"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormat('insertOrderedList')}
            title="Numbered list"
          >
            <ListOrdered className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormat('removeFormat')}
            title="Clear formatting"
          >
            <RemoveFormatting className="h-4 w-4" />
          </Button>
        </div>

        <div
          ref={editorRef}
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-label={fieldLabel}
          data-placeholder={placeholder}
          className={cn(
            'min-h-[88px] max-h-48 overflow-y-auto px-3 py-2 text-sm outline-none',
            'empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]',
            '[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5',
            '[&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5',
            '[&_div]:min-h-[1.25em]'
          )}
          onInput={syncFromEditor}
          onBlur={syncFromEditor}
        />
      </div>
    </div>
  )
}
