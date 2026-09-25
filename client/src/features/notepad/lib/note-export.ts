import { htmlToPlainText } from './note-text'
import { getNoteTitle } from './note-text'
import type { Note } from '@/stores/note.api'

/** Filesystem-safe stem for a downloaded note. */
const safeFileName = (name: string) =>
  (name || 'note')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60) || 'note'

const download = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // Revoke on the next tick — Firefox cancels the download if it happens sooner.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** The Windows Notepad exit hatch: your text, as a .txt file, unchanged. */
export const downloadNoteAsTxt = (note: Pick<Note, 'title' | 'content' | 'plainText'>) => {
  const title = getNoteTitle(note)
  const body = note.plainText || htmlToPlainText(note.content || '')
  download(new Blob([`${title}\n\n${body}\n`], { type: 'text/plain;charset=utf-8' }), `${safeFileName(title)}.txt`)
}

/** Keeps bold/lists/headings, so a formatted note survives the round trip. */
export const downloadNoteAsHtml = (note: Pick<Note, 'title' | 'content' | 'plainText'>) => {
  const title = getNoteTitle(note)
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;max-width:46rem;margin:3rem auto;padding:0 1.5rem;line-height:1.6;color:#111}h1{font-size:1.5rem;margin-bottom:1.5rem}</style>
</head><body><h1>${title}</h1>${note.content || ''}</body></html>`
  download(new Blob([html], { type: 'text/html;charset=utf-8' }), `${safeFileName(title)}.html`)
}

export const copyNoteToClipboard = async (note: Pick<Note, 'title' | 'content' | 'plainText'>) => {
  const body = note.plainText || htmlToPlainText(note.content || '')
  await navigator.clipboard.writeText(body)
}

/**
 * Print via a hidden same-origin iframe rather than window.open: popup blockers
 * kill the new-window version, and the iframe never steals focus from the editor.
 */
export const printNote = (note: Pick<Note, 'title' | 'content' | 'plainText'>) => {
  const title = getNoteTitle(note)
  const frame = document.createElement('iframe')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  document.body.appendChild(frame)

  const doc = frame.contentDocument
  if (!doc) {
    document.body.removeChild(frame)
    return
  }
  doc.open()
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  @page { margin: 18mm; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; line-height: 1.6; color: #111; }
  h1 { font-size: 18pt; margin: 0 0 6mm; }
  ul, ol { padding-left: 6mm; }
</style></head><body><h1>${title}</h1>${note.content || ''}</body></html>`)
  doc.close()

  frame.contentWindow?.focus()
  frame.contentWindow?.print()
  // Give the print dialog time to take its snapshot before the frame disappears.
  setTimeout(() => {
    if (frame.parentNode) document.body.removeChild(frame)
  }, 1500)
}
