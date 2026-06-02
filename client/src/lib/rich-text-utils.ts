import { escapeHtml } from '@/lib/escape-html'

const ALLOWED_TAGS = new Set([
  'B',
  'STRONG',
  'I',
  'EM',
  'U',
  'BR',
  'P',
  'DIV',
  'UL',
  'OL',
  'LI',
  'SPAN',
])

function hasHtmlTags(text: string): boolean {
  return /<[a-z][^>]*>/i.test(text)
}

function looksLikeEntityEncodedHtml(text: string): boolean {
  return /&lt;\/?[a-z]/i.test(text) || /&amp;lt;\/?[a-z]/i.test(text)
}

/** Decode HTML entities when content was stored or transmitted as escaped markup. */
export function decodeHtmlEntities(text: string): string {
  if (typeof document === 'undefined') {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&#39;/g, "'")
  }

  let current = text
  for (let i = 0; i < 3; i += 1) {
    if (!looksLikeEntityEncodedHtml(current)) break
    const el = document.createElement('textarea')
    el.innerHTML = current
    const decoded = el.value
    if (!decoded || decoded === current) break
    current = decoded
  }
  return current
}

function normalizeRichContent(content: string): string {
  const trimmed = content.trim()
  if (!trimmed) return ''

  let working = trimmed
  if (looksLikeEntityEncodedHtml(working)) {
    working = decodeHtmlEntities(working).trim()
  }
  return working
}

function sanitizeElement(element: Element): void {
  const children = Array.from(element.childNodes)

  for (const child of children) {
    if (child.nodeType === Node.TEXT_NODE) continue

    if (child.nodeType !== Node.ELEMENT_NODE) {
      child.remove()
      continue
    }

    const el = child as Element
    if (!ALLOWED_TAGS.has(el.tagName)) {
      const fragment = document.createDocumentFragment()
      while (el.firstChild) {
        fragment.appendChild(el.firstChild)
      }
      el.replaceWith(fragment)
      continue
    }

    Array.from(el.attributes).forEach((attr) => el.removeAttribute(attr.name))
    sanitizeElement(el)
  }
}

function sanitizeRichHtml(html: string): string {
  if (typeof document === 'undefined') {
    return escapeHtml(html).replace(/\r\n/g, '\n').replace(/\n/g, '<br />')
  }

  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const container = doc.body.firstElementChild
  if (!container) {
    return escapeHtml(html).replace(/\r\n/g, '\n').replace(/\n/g, '<br />')
  }

  sanitizeElement(container)
  const cleaned = container.innerHTML.trim()
  if (!cleaned || cleaned === '<br>' || cleaned === '<div><br></div>') return ''
  return cleaned
}

/** Convert legacy plain-text invoice notes into editor-friendly HTML. */
export function plainTextToEditorHtml(text: string): string {
  const working = normalizeRichContent(text)
  if (!working) return ''
  if (hasHtmlTags(working)) return sanitizeRichHtml(working)

  return working
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      if (!line) return '<div><br></div>'
      return `<div>${escapeHtml(line)}</div>`
    })
    .join('')
}

/** Normalize rich-text editor output before saving to the invoice. */
export function normalizeInvoiceNotesHtml(content: string): string {
  const working = normalizeRichContent(content)
  if (!working) return ''
  if (!hasHtmlTags(working)) return working
  return sanitizeRichHtml(working)
}

/** Sanitize rich invoice terms for safe HTML rendering on print and detail views. */
export function invoiceTermsToSafeHtml(content: string): string {
  const working = normalizeRichContent(content)
  if (!working) return ''

  if (!hasHtmlTags(working)) {
    return escapeHtml(working).replace(/\r\n/g, '\n').replace(/\n/g, '<br />')
  }

  return sanitizeRichHtml(working)
}

/** Strip HTML tags for plain-text previews (lists, tables, etc.). */
export function richTextToPlainText(content: string): string {
  const working = normalizeRichContent(content)
  if (!working) return ''
  if (!hasHtmlTags(working)) return working

  if (typeof document === 'undefined') {
    return working.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }

  const doc = new DOMParser().parseFromString(`<div>${working}</div>`, 'text/html')
  return (doc.body.textContent || '').replace(/\s+\n/g, '\n').trim()
}
