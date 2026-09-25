import type { NoteAiActionResult } from '@/stores/note.api'
import { plainTextToHtml } from './note-text'

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const CODE_ACTIONS = new Set(['explainCode', 'improveCode', 'optimizeCode', 'generateDocumentation', 'convertCode', 'generateTests'])

const listToHtml = (items: string[], checklist: boolean): string => {
  if (!items.length) return ''
  if (checklist) {
    // Real checklist lines — same `data-note-check` markup the toolbar's checklist
    // button produces, so these are clickable, not just bullet-shaped text.
    return items.map((item) => `<div data-note-check data-checked="false">${escapeHtml(item)}</div>`).join('')
  }
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
}

const textToHtml = (text: string, action: string): string => {
  if (!text) return ''
  if (CODE_ACTIONS.has(action)) return `<pre>${escapeHtml(text)}</pre>`
  return plainTextToHtml(text)
}

/** Turns an AI action's result into HTML ready to insert into the note body. */
export const resultToHtml = (result: NoteAiActionResult, checklist = false): string => {
  if ('items' in result) return listToHtml(result.items, checklist)
  if ('summary' in result) {
    const parts = [
      result.summary ? `<div><strong>Summary:</strong> ${escapeHtml(result.summary)}</div>` : '',
      result.decisions.length ? `<div><strong>Decisions</strong></div>${listToHtml(result.decisions, false)}` : '',
      result.actionItems.length ? `<div><strong>Action Items</strong></div>${listToHtml(result.actionItems, true)}` : '',
      result.followUp ? `<div><strong>Follow-up</strong></div>${textToHtml(result.followUp, 'generateFollowUp')}` : '',
    ]
    return parts.filter(Boolean).join('')
  }
  return textToHtml(result.result, result.action)
}

/** Plain text of the result, for the Copy button. */
export const resultToPlainText = (result: NoteAiActionResult): string => {
  if ('items' in result) return result.items.map((item) => `• ${item}`).join('\n')
  if ('summary' in result) {
    return [
      result.summary && `Summary: ${result.summary}`,
      result.decisions.length ? `Decisions:\n${result.decisions.map((d) => `• ${d}`).join('\n')}` : '',
      result.actionItems.length ? `Action Items:\n${result.actionItems.map((a) => `☐ ${a}`).join('\n')}` : '',
      result.followUp && `Follow-up:\n${result.followUp}`,
    ]
      .filter(Boolean)
      .join('\n\n')
  }
  return result.result
}
