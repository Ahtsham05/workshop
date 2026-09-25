import {
  BookOpen,
  Braces,
  Bug,
  ClipboardList,
  Code2,
  FileCode2,
  FileText,
  Gauge,
  Languages,
  Lightbulb,
  ListChecks,
  ListTodo,
  Send,
  SpellCheck,
  Sparkles,
  TestTube2,
  Type,
  Users,
  Wand2,
} from 'lucide-react'
import type { NoteAiAction } from '@/stores/note.api'

export type AiColor = 'blue' | 'indigo' | 'violet' | 'amber' | 'pink' | 'sky' | 'teal' | 'rose'

/** Tile background + icon color per action, light/dark aware — same token shape as note-colors.ts. */
export const AI_COLOR_STYLES: Record<AiColor, { tile: string; icon: string }> = {
  blue: { tile: 'bg-blue-100 dark:bg-blue-500/20', icon: 'text-blue-600 dark:text-blue-300' },
  indigo: { tile: 'bg-indigo-100 dark:bg-indigo-500/20', icon: 'text-indigo-600 dark:text-indigo-300' },
  violet: { tile: 'bg-violet-100 dark:bg-violet-500/20', icon: 'text-violet-600 dark:text-violet-300' },
  amber: { tile: 'bg-amber-100 dark:bg-amber-500/20', icon: 'text-amber-600 dark:text-amber-300' },
  pink: { tile: 'bg-pink-100 dark:bg-pink-500/20', icon: 'text-pink-600 dark:text-pink-300' },
  sky: { tile: 'bg-sky-100 dark:bg-sky-500/20', icon: 'text-sky-600 dark:text-sky-300' },
  teal: { tile: 'bg-teal-100 dark:bg-teal-500/20', icon: 'text-teal-600 dark:text-teal-300' },
  rose: { tile: 'bg-rose-100 dark:bg-rose-500/20', icon: 'text-rose-600 dark:text-rose-300' },
}

export interface AiActionMeta {
  action: NoteAiAction
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  color: AiColor
  resultKind: 'text' | 'list' | 'meeting'
  /** Result is a set of tasks, inserted as real checklist lines rather than prose. */
  checklist?: boolean
  /** Prompts for a value (rewrite style / target language) before running. */
  needsOption?: 'style' | 'targetLanguage' | 'length'
}

/** Every note gets these — the general-purpose writing toolkit. */
export const CORE_ACTIONS: AiActionMeta[] = [
  { action: 'summarize', label: 'Summarize', description: 'A short summary of this note', icon: FileText, color: 'blue', resultKind: 'text', needsOption: 'length' },
  { action: 'improveWriting', label: 'Improve Writing', description: 'Clearer, more polished wording', icon: Sparkles, color: 'violet', resultKind: 'text' },
  { action: 'fixGrammar', label: 'Fix Grammar', description: 'Correct spelling & grammar only', icon: SpellCheck, color: 'sky', resultKind: 'text' },
  { action: 'generateTitle', label: 'Generate Title', description: 'Suggest a title from the content', icon: Type, color: 'indigo', resultKind: 'text' },
  { action: 'extractKeyPoints', label: 'Extract Key Points', description: 'The most important points as bullets', icon: ListChecks, color: 'blue', resultKind: 'list' },
  { action: 'generateActionItems', label: 'Extract Tasks', description: 'Turn this note into a checklist', icon: ListTodo, color: 'indigo', resultKind: 'list', checklist: true },
  { action: 'generateIdeas', label: 'Generate Ideas', description: 'Related ideas based on this note', icon: Lightbulb, color: 'amber', resultKind: 'list' },
  { action: 'translate', label: 'Translate', description: 'Translate to another language', icon: Languages, color: 'violet', resultKind: 'text', needsOption: 'targetLanguage' },
  { action: 'explain', label: 'Explain', description: 'Explain this in simple language', icon: BookOpen, color: 'sky', resultKind: 'text' },
  { action: 'rewrite', label: 'Rewrite', description: 'Rewrite in a different style', icon: Wand2, color: 'pink', resultKind: 'text', needsOption: 'style' },
]

/** Only shown when the note actually contains a code block. */
export const CODE_ACTIONS: AiActionMeta[] = [
  { action: 'explainCode', label: 'Explain Code', description: 'What this code does', icon: Code2, color: 'blue', resultKind: 'text' },
  { action: 'findBugs', label: 'Find Bugs', description: 'Possible bugs & edge cases', icon: Bug, color: 'rose', resultKind: 'list' },
  { action: 'improveCode', label: 'Improve Code', description: 'Cleaner, more readable code', icon: Sparkles, color: 'violet', resultKind: 'text' },
  { action: 'optimizeCode', label: 'Optimize Code', description: 'Faster, same behavior', icon: Gauge, color: 'teal', resultKind: 'text' },
  { action: 'generateDocumentation', label: 'Generate Documentation', description: 'Docstrings & comments', icon: FileCode2, color: 'indigo', resultKind: 'text' },
  { action: 'convertCode', label: 'Convert Code', description: 'Convert to another language', icon: Braces, color: 'sky', resultKind: 'text', needsOption: 'targetLanguage' },
  { action: 'generateTests', label: 'Generate Tests', description: 'Unit tests for this code', icon: TestTube2, color: 'amber', resultKind: 'text' },
]

/** Only shown for note type "meeting". */
export const MEETING_ACTIONS: AiActionMeta[] = [
  { action: 'meetingSummary', label: 'Meeting Summary', description: 'Decisions, action items & follow-up', icon: ClipboardList, color: 'indigo', resultKind: 'meeting' },
  { action: 'extractDecisions', label: 'Extract Decisions', description: 'Decisions made in this meeting', icon: ListChecks, color: 'blue', resultKind: 'list' },
  { action: 'identifyParticipants', label: 'Identify Participants', description: 'Who was mentioned', icon: Users, color: 'teal', resultKind: 'list' },
  { action: 'generateFollowUp', label: 'Follow-up Message', description: 'Draft a follow-up message', icon: Send, color: 'violet', resultKind: 'text' },
]

export const ALL_ACTIONS: AiActionMeta[] = [...CORE_ACTIONS, ...CODE_ACTIONS, ...MEETING_ACTIONS]
export const ACTION_META_BY_KEY: Record<string, AiActionMeta> = Object.fromEntries(
  ALL_ACTIONS.map((meta) => [meta.action, meta]),
)

export const REWRITE_STYLES: { id: string; label: string }[] = [
  { id: 'professional', label: 'Professional' },
  { id: 'simple', label: 'Simple' },
  { id: 'shorter', label: 'Shorter' },
  { id: 'detailed', label: 'Detailed' },
  { id: 'friendly', label: 'Friendly' },
]

export const SUMMARY_LENGTHS: { id: string; label: string }[] = [
  { id: 'short', label: 'Short' },
  { id: 'medium', label: 'Medium' },
  { id: 'detailed', label: 'Detailed' },
]

export const COMMON_LANGUAGES = ['English', 'Urdu', 'Roman Urdu', 'Arabic', 'Spanish', 'French']
