import { Sparkles, PhoneCall, BadgeCheck, FileText, Trophy, XCircle, type LucideIcon } from 'lucide-react'
import type { LeadSource, LeadStage } from '@/stores/lead.api'

export const STAGES: LeadStage[] = ['new', 'contacted', 'qualified', 'proposal_sent', 'won', 'lost']

// Stages that form the linear pipeline — 'lost' is a side-branch reachable from any
// of these without confirmation; jumping forward more than one of these does need it.
export const ACTIVE_STAGE_ORDER: LeadStage[] = ['new', 'contacted', 'qualified', 'proposal_sent', 'won']

export const STAGE_LABELS: Record<LeadStage, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  proposal_sent: 'Proposal Sent',
  won: 'Won',
  lost: 'Lost',
}

export const STAGE_ICONS: Record<LeadStage, LucideIcon> = {
  new: Sparkles,
  contacted: PhoneCall,
  qualified: BadgeCheck,
  proposal_sent: FileText,
  won: Trophy,
  lost: XCircle,
}

interface StageStyle {
  header: string
  dot: string
  badge: string
  iconWrap: string
  accentText: string
  /** Static (non-computed) ring classes for avatars — Tailwind's scanner needs the
   * literal class name in source, so never derive this via string-replace on `dot`. */
  ring: string
}

export const STAGE_COLUMN_STYLES: Record<LeadStage, StageStyle> = {
  new: {
    header: 'border-t-slate-400',
    dot: 'bg-slate-400',
    badge: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
    iconWrap: 'bg-slate-500/12 text-slate-600 dark:text-slate-400',
    accentText: 'text-slate-600 dark:text-slate-400',
    ring: 'ring-slate-400',
  },
  contacted: {
    header: 'border-t-blue-500',
    dot: 'bg-blue-500',
    badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    iconWrap: 'bg-blue-500/12 text-blue-600 dark:text-blue-400',
    accentText: 'text-blue-600 dark:text-blue-400',
    ring: 'ring-blue-500',
  },
  qualified: {
    header: 'border-t-violet-500',
    dot: 'bg-violet-500',
    badge: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    iconWrap: 'bg-violet-500/12 text-violet-600 dark:text-violet-400',
    accentText: 'text-violet-600 dark:text-violet-400',
    ring: 'ring-violet-500',
  },
  proposal_sent: {
    header: 'border-t-amber-500',
    dot: 'bg-amber-500',
    badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    iconWrap: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
    accentText: 'text-amber-600 dark:text-amber-400',
    ring: 'ring-amber-500',
  },
  won: {
    header: 'border-t-emerald-500',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    iconWrap: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
    accentText: 'text-emerald-600 dark:text-emerald-400',
    ring: 'ring-emerald-500',
  },
  lost: {
    header: 'border-t-red-500',
    dot: 'bg-red-500',
    badge: 'bg-red-500/10 text-red-600 dark:text-red-400',
    iconWrap: 'bg-red-500/12 text-red-600 dark:text-red-400',
    accentText: 'text-red-600 dark:text-red-400',
    ring: 'ring-red-500',
  },
}

export const SOURCES: LeadSource[] = ['whatsapp', 'referral', 'walk_in', 'facebook', 'manual', 'other']

export const SOURCE_LABELS: Record<LeadSource, string> = {
  whatsapp: 'WhatsApp',
  referral: 'Referral',
  walk_in: 'Walk-in',
  facebook: 'Facebook',
  manual: 'Manual Entry',
  other: 'Other',
}

/** Mirrors the server's lead.service.js isSkippedTransition — used to decide whether
 * to show the skip-confirmation dialog before the drag/drop request even round-trips. */
export function isSkippedStageTransition(fromStage: LeadStage, toStage: LeadStage): boolean {
  if (toStage === 'lost') return false
  if (fromStage === 'lost') return true
  const fromIdx = ACTIVE_STAGE_ORDER.indexOf(fromStage)
  const toIdx = ACTIVE_STAGE_ORDER.indexOf(toStage)
  if (fromIdx === -1 || toIdx === -1) return true
  return toIdx - fromIdx > 1
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value || 0)
}

export function formatTimeInStage(stageEnteredAt: string): string {
  const ms = Date.now() - new Date(stageEnteredAt).getTime()
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))
  if (days >= 1) return `${days}d`
  const hours = Math.floor(ms / (1000 * 60 * 60))
  if (hours >= 1) return `${hours}h`
  const minutes = Math.max(1, Math.floor(ms / (1000 * 60)))
  return `${minutes}m`
}
