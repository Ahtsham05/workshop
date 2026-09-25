/**
 * contentEditable helpers.
 *
 * document.execCommand is deprecated but still the only cross-browser way to get
 * undo-stack-aware rich text editing without pulling in a full editor framework
 * (ProseMirror/Slate would be ~120 KB for a notepad). The app's existing
 * components/ui/rich-text-editor.tsx already takes this approach.
 *
 * Block formatting, however, is NOT left to execCommand. `formatBlock` wraps the
 * caret's block in the new tag instead of replacing it, so pressing Heading then
 * Subheading then Quote on the same line builds `<h1><h2><blockquote><ul><li>…`
 * — markup no browser re-parses the same way twice, which is how a note ends up
 * showing its own tags as text. The helpers below replace the block element
 * outright and keep headings, quotes, code blocks and lists mutually exclusive.
 */

import { formatNoteTimestamp } from './note-time'

export type InlineFormat = 'bold' | 'italic' | 'underline' | 'strikeThrough'

export type BlockTag = 'H1' | 'H2' | 'BLOCKQUOTE' | 'PRE' | 'DIV'

const BLOCK_TAGS = /^(DIV|P|H1|H2|H3|UL|OL|LI|BLOCKQUOTE|PRE)$/

export const exec = (command: string, value?: string) => {
  document.execCommand(command, false, value)
}

export const isFormatActive = (command: string): boolean => {
  try {
    return document.queryCommandState(command)
  } catch {
    return false
  }
}

// ── Caret bookkeeping ──────────────────────────────────────────────────────
// Replacing a block element throws the caret away, so its position is recorded
// as a plain character offset inside the block and restored afterwards.

const caretOffsetIn = (block: HTMLElement): number => {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return 0
  const caret = selection.getRangeAt(0)
  if (!block.contains(caret.endContainer)) return 0
  const measure = document.createRange()
  measure.selectNodeContents(block)
  measure.setEnd(caret.endContainer, caret.endOffset)
  return measure.toString().length
}

const setCaretOffset = (block: HTMLElement, offset: number) => {
  const selection = window.getSelection()
  if (!selection) return
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
  let remaining = offset
  let node = walker.nextNode() as Text | null
  while (node) {
    if (remaining <= node.data.length) {
      const range = document.createRange()
      range.setStart(node, remaining)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
      return
    }
    remaining -= node.data.length
    node = walker.nextNode() as Text | null
  }
  const range = document.createRange()
  range.selectNodeContents(block)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

// ── Block lookup ───────────────────────────────────────────────────────────

/** The block element the caret sits in, scoped to the editor root. */
export const getCurrentBlock = (root: HTMLElement): HTMLElement | null => {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  let node: Node | null = selection.getRangeAt(0).startContainer
  while (node && node !== root) {
    if (node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.test((node as HTMLElement).tagName)) {
      return node as HTMLElement
    }
    node = node.parentNode
  }
  return null
}

/** The direct child of the editor root that contains the caret. */
const getTopLevelBlock = (root: HTMLElement): HTMLElement | null => {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  let node: Node | null = selection.getRangeAt(0).startContainer
  if (!root.contains(node)) return null
  while (node && node.parentNode !== root) node = node.parentNode
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return null
  return node as HTMLElement
}

/**
 * The first line of an empty editor is a bare text node with no block element
 * around it, which is why the checklist and format buttons used to do nothing
 * there. This wraps it so every command has something to act on.
 */
const ensureBlockAtCaret = (root: HTMLElement): HTMLElement | null => {
  const existing = getTopLevelBlock(root)
  if (existing) return existing
  exec('formatBlock', 'div')
  return getTopLevelBlock(root)
}

/** Swaps a block's tag, carrying its contents and checklist state across. */
const replaceBlockTag = (block: HTMLElement, tag: BlockTag): HTMLElement => {
  if (block.tagName === tag) return block
  const offset = caretOffsetIn(block)
  const replacement = document.createElement(tag)
  replacement.innerHTML = block.innerHTML
  if (block.hasAttribute('data-note-check')) {
    replacement.setAttribute('data-note-check', '')
    replacement.setAttribute('data-checked', block.getAttribute('data-checked') || 'false')
  }
  block.replaceWith(replacement)
  setCaretOffset(replacement, offset)
  return replacement
}

// ── Commands ───────────────────────────────────────────────────────────────

/**
 * Heading / subheading / quote / code. Re-applying the same format returns the
 * line to plain text, and a line that is currently a list item leaves the list
 * first rather than nesting inside it.
 */
export const applyBlockFormat = (root: HTMLElement, tag: Exclude<BlockTag, 'DIV'>) => {
  let block = ensureBlockAtCaret(root)
  if (!block) return

  if (block.tagName === 'UL' || block.tagName === 'OL') {
    exec(block.tagName === 'UL' ? 'insertUnorderedList' : 'insertOrderedList')
    block = ensureBlockAtCaret(root)
    if (!block) return
  }

  replaceBlockTag(block, block.tagName === tag ? 'DIV' : tag)
}

/** Bullet / numbered list, flattening any heading or quote on the line first. */
export const toggleList = (root: HTMLElement, command: 'insertUnorderedList' | 'insertOrderedList') => {
  const block = ensureBlockAtCaret(root)
  if (block && /^(H1|H2|H3|BLOCKQUOTE|PRE)$/.test(block.tagName)) {
    replaceBlockTag(block, 'DIV')
  }
  exec(command)
}

/** Marks / unmarks the caret's line as a checklist item. */
export const toggleChecklistLine = (root: HTMLElement) => {
  const selection = window.getSelection()
  let target: HTMLElement | null = null

  // Inside a list, the tick belongs on the <li>, not on the whole <ul>.
  if (selection && selection.rangeCount > 0) {
    const node = selection.getRangeAt(0).startContainer
    const element = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement
    const listItem = element?.closest('li') ?? null
    if (listItem && root.contains(listItem)) target = listItem
  }
  if (!target) target = ensureBlockAtCaret(root)
  if (!target) return

  if (target.hasAttribute('data-note-check')) {
    target.removeAttribute('data-note-check')
    target.removeAttribute('data-checked')
  } else {
    target.setAttribute('data-note-check', '')
    target.setAttribute('data-checked', 'false')
  }
}

/**
 * Click-to-tick. Checklist markers are drawn with a ::before pseudo-element, so
 * there is no real node to bind to — instead, a click inside the left gutter of
 * a checklist line toggles it.
 */
export const handleChecklistClick = (event: MouseEvent, root: HTMLElement): boolean => {
  const target = (event.target as HTMLElement | null)?.closest?.('[data-note-check]') as HTMLElement | null
  if (!target || !root.contains(target)) return false
  const rect = target.getBoundingClientRect()
  // The gutter the marker is drawn in (see .notepad-content [data-note-check] in index.css).
  if (event.clientX - rect.left > 26) return false
  const checked = target.getAttribute('data-checked') === 'true'
  target.setAttribute('data-checked', checked ? 'false' : 'true')
  return true
}

/**
 * Inserts today's date + time at the caret — Notepad's F5, but in business time
 * and 12-hour AM/PM like the rest of the app.
 */
export const insertTimestamp = () => {
  exec('insertText', formatNoteTimestamp())
}

/** A divider is its own line, never dropped inside the current paragraph. */
export const insertDivider = (root: HTMLElement) => {
  const block = ensureBlockAtCaret(root)
  const rule = document.createElement('hr')
  if (!block) {
    exec('insertHorizontalRule')
    return
  }
  block.after(rule)
  const line = document.createElement('div')
  line.innerHTML = '<br>'
  rule.after(line)
  setCaretOffset(line, 0)
}

/** Strips inline styling AND returns the line to a plain block. */
export const clearFormatting = (root: HTMLElement) => {
  exec('removeFormat')
  const block = getTopLevelBlock(root)
  if (block && /^(H1|H2|H3|BLOCKQUOTE|PRE)$/.test(block.tagName)) replaceBlockTag(block, 'DIV')
  const listItem = getCurrentBlock(root)
  if (listItem?.tagName === 'LI') exec('insertUnorderedList')
  if (block) {
    block.removeAttribute('data-note-check')
    block.removeAttribute('data-checked')
  }
}

// ── Find & replace ─────────────────────────────────────────────────────────
// Matches are located by walking text nodes and navigated by moving the real
// selection onto them: no DOM is mutated for highlighting, so the undo stack and
// the caret stay intact, and the browser's own selection colour does the
// highlighting for free.

export interface TextMatch {
  node: Text
  start: number
  end: number
}

export const findMatches = (root: HTMLElement, needle: string, matchCase: boolean): TextMatch[] => {
  if (!needle) return []
  const matches: TextMatch[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const target = matchCase ? needle : needle.toLowerCase()

  let node = walker.nextNode() as Text | null
  while (node) {
    const haystack = matchCase ? node.data : node.data.toLowerCase()
    let index = haystack.indexOf(target)
    while (index !== -1) {
      matches.push({ node, start: index, end: index + needle.length })
      index = haystack.indexOf(target, index + needle.length)
    }
    node = walker.nextNode() as Text | null
  }
  return matches
}

export const selectMatch = (match: TextMatch) => {
  const range = document.createRange()
  range.setStart(match.node, match.start)
  range.setEnd(match.node, match.end)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  match.node.parentElement?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

/** Replaces the currently selected match; execCommand keeps it undoable. */
export const replaceSelection = (replacement: string) => {
  exec('insertText', replacement)
}

export const replaceAll = (root: HTMLElement, needle: string, replacement: string, matchCase: boolean): number => {
  const matches = findMatches(root, needle, matchCase)
  if (!matches.length) return 0
  // Right-to-left so earlier offsets stay valid as the text shifts.
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const match = matches[i]
    match.node.replaceData(match.start, match.end - match.start, replacement)
  }
  return matches.length
}
