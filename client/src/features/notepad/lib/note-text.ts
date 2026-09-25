/**
 * Text utilities shared by the editor, the list previews and the export menu.
 * The editor stores HTML, so anything that counts or exports has to come back
 * through plain text first.
 */

const stripOnce = (html: string): string =>
  String(html)
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(div|p|li|h1|h2|h3|blockquote|pre|tr)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

/** Text that is still markup after one strip — i.e. markup that was escaped. */
const stillMarkup = (text: string): boolean => {
  const trimmed = text.trim()
  return trimmed.startsWith('<') && trimmed.includes('</') && /<[a-z][^>]*>/i.test(trimmed)
}

/**
 * Editor HTML → readable text.
 *
 * Runs the strip more than once when what comes out is itself markup: notes
 * written before the block-format fix stored escaped HTML, so one pass just
 * decodes `&lt;div&gt;` into a visible `<div>`. Repeating means their list
 * previews and titles read as text immediately, without waiting for the note to
 * be opened and re-saved.
 */
export const htmlToPlainText = (html: string): string => {
  if (!html) return ''
  let text = stripOnce(html)
  for (let pass = 0; pass < 3 && stillMarkup(text); pass += 1) {
    text = stripOnce(text)
  }
  return text.replace(/\n{3,}/g, '\n\n').trim()
}

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** Pasted plain text (and imported .txt files) become one div per line. */
export const plainTextToHtml = (text: string): string =>
  String(text)
    .split(/\r?\n/)
    .map((line) => (line.trim() ? `<div>${escapeHtml(line)}</div>` : '<div><br></div>'))
    .join('')

export interface NoteStats {
  words: number
  characters: number
  charactersNoSpaces: number
  lines: number
  readingMinutes: number
}

/** The status-bar counters — the thing people open Word for after Notepad. */
export const getNoteStats = (html: string): NoteStats => {
  const text = htmlToPlainText(html)
  const words = text.split(/\s+/).filter(Boolean).length
  return {
    words,
    characters: text.length,
    charactersNoSpaces: text.replace(/\s/g, '').length,
    lines: text ? text.split('\n').length : 0,
    // 200 wpm is the common average; always show at least a minute for non-empty text.
    readingMinutes: words ? Math.max(1, Math.round(words / 200)) : 0,
  }
}

/**
 * Drops a value that turned out to be markup rather than prose.
 *
 * Titles stored before the block-format fix are fragments like
 * `<hr><hr><blockquote …><h1>` — no closing tags, so the repeated strip above
 * cannot recognise them. Removing every tag from prose still leaves words; from
 * a tag fragment it leaves nothing, and that is the test.
 */
const discardIfMarkup = (text: string): string => {
  if (!text.includes('<')) return text
  return text.replace(/<[^>]*>/g, '').trim().length === 0 ? '' : text
}

/** Preview line for the list rows — one line, collapsed whitespace. */
export const getNotePreview = (note: { plainText?: string; content?: string }, max = 120): string => {
  const source = discardIfMarkup(
    note.content ? htmlToPlainText(note.content) : htmlToPlainText(note.plainText || ''),
  )
  const collapsed = source.replace(/\s+/g, ' ').trim()
  return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed
}

/** Title shown when the user never typed one and the body is still empty. */
export const getNoteTitle = (note: { title?: string; plainText?: string; content?: string }): string => {
  // A title stored before the block-format fix can itself be escaped markup.
  const explicit = discardIfMarkup(htmlToPlainText((note.title || '').trim()).trim())
  if (explicit) return explicit
  const derived = (note.content ? htmlToPlainText(note.content) : htmlToPlainText(note.plainText || ''))
    .split('\n')
    .map((line) => discardIfMarkup(line.trim()))
    .find(Boolean)
  return derived ? derived.slice(0, 80) : 'Untitled note'
}
