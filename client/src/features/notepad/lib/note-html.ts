/**
 * Content repair for the note editor.
 *
 * Two problems are healed here, both on the way into the editor and on the way
 * out to the server, so a note that was already damaged fixes itself the next
 * time it is opened:
 *
 *  1. Stacked block wrappers — `<h1><h2><blockquote><ul><li>text</li>…` — which
 *     the old formatBlock-based toolbar produced. That markup is invalid, and
 *     browsers do not re-parse it to the same tree twice, so the note drifts a
 *     little more on every save/load cycle.
 *  2. Markup that was flattened into text, so the body literally reads
 *     "<div>hello</div>" instead of showing "hello".
 */

const BLOCK_CHILD = /^(DIV|P|H1|H2|H3|UL|OL|LI|BLOCKQUOTE|PRE)$/
const WRAPPERS = 'h1,h2,h3,blockquote,pre'

/**
 * True when a whole string looks like serialized markup rather than prose: it
 * opens with a tag, closes with one, and has at least one closing tag in
 * between. A note someone genuinely wrote about HTML fails at least one of
 * these, so the repair below stays off for real content.
 */
const looksLikeFlattenedMarkup = (text: string): boolean => {
  const trimmed = text.trim()
  if (trimmed.length < 12) return false
  return /^<[a-z][^>]*>/i.test(trimmed) && /<\/[a-z]+>$/i.test(trimmed) && trimmed.includes('</')
}

/** Un-escapes a body whose entire content is HTML that was turned into text. */
const recoverFlattenedMarkup = (html: string): string => {
  if (!html.includes('&lt;')) return html
  const probe = document.createElement('div')
  probe.innerHTML = html
  const text = probe.textContent || ''
  return looksLikeFlattenedMarkup(text) ? text : html
}

/**
 * Flattens illegal block nesting and drops the empty wrappers left behind.
 * Returns the cleaned HTML; identical input is returned unchanged so callers can
 * cheaply tell whether anything needed fixing.
 */
export const normalizeNoteHtml = (html: string): string => {
  if (!html) return ''
  const host = document.createElement('div')
  host.innerHTML = recoverFlattenedMarkup(html)

  // Unwrap a heading/quote/code element that contains another block. Repeated
  // because one unwrap can expose the next; the guard stops a pathological
  // document from spinning.
  for (let pass = 0; pass < 8; pass += 1) {
    let changed = false
    host.querySelectorAll(WRAPPERS).forEach((element) => {
      const wrapsBlock = Array.from(element.children).some((child) => BLOCK_CHILD.test(child.tagName))
      if (!wrapsBlock) return
      element.replaceWith(...Array.from(element.childNodes))
      changed = true
    })
    if (!changed) break
  }

  return host.innerHTML
}
