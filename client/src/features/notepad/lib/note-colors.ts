import type { NoteColor } from '@/stores/note.api'

/**
 * Paper colours for a note. Windows Notepad has one; sticky-note apps earn a lot
 * of their usability from colour, so every swatch gets a light and a dark value
 * that keep body text readable in both themes (the `dark:` halves are muted, not
 * just the same hue dimmed).
 */
export interface NoteColorSpec {
  id: NoteColor
  label: string
  /** Card / editor surface. */
  surface: string
  /** Thin strip on the list row, also the swatch in the picker. */
  swatch: string
  /** Left border accent on the list row. */
  accent: string
  /** Background of the leading icon tile on a list row. */
  tile: string
  /** Icon colour inside that tile. */
  tileText: string
}

export const NOTE_COLORS: NoteColorSpec[] = [
  {
    id: 'default',
    label: 'Default',
    surface: 'bg-card',
    swatch: 'bg-muted-foreground/30',
    accent: 'border-l-border',
    tile: 'bg-muted',
    tileText: 'text-muted-foreground',
  },
  {
    id: 'yellow',
    label: 'Yellow',
    surface: 'bg-amber-50 dark:bg-amber-950/40',
    swatch: 'bg-amber-400',
    accent: 'border-l-amber-400',
    tile: 'bg-amber-100 dark:bg-amber-500/20',
    tileText: 'text-amber-700 dark:text-amber-300',
  },
  {
    id: 'green',
    label: 'Green',
    surface: 'bg-emerald-50 dark:bg-emerald-950/40',
    swatch: 'bg-emerald-400',
    accent: 'border-l-emerald-400',
    tile: 'bg-emerald-100 dark:bg-emerald-500/20',
    tileText: 'text-emerald-700 dark:text-emerald-300',
  },
  {
    id: 'blue',
    label: 'Blue',
    surface: 'bg-sky-50 dark:bg-sky-950/40',
    swatch: 'bg-sky-400',
    accent: 'border-l-sky-400',
    tile: 'bg-sky-100 dark:bg-sky-500/20',
    tileText: 'text-sky-700 dark:text-sky-300',
  },
  {
    id: 'purple',
    label: 'Purple',
    surface: 'bg-violet-50 dark:bg-violet-950/40',
    swatch: 'bg-violet-400',
    accent: 'border-l-violet-400',
    tile: 'bg-violet-100 dark:bg-violet-500/20',
    tileText: 'text-violet-700 dark:text-violet-300',
  },
  {
    id: 'pink',
    label: 'Pink',
    surface: 'bg-pink-50 dark:bg-pink-950/40',
    swatch: 'bg-pink-400',
    accent: 'border-l-pink-400',
    tile: 'bg-pink-100 dark:bg-pink-500/20',
    tileText: 'text-pink-700 dark:text-pink-300',
  },
  {
    id: 'orange',
    label: 'Orange',
    surface: 'bg-orange-50 dark:bg-orange-950/40',
    swatch: 'bg-orange-400',
    accent: 'border-l-orange-400',
    tile: 'bg-orange-100 dark:bg-orange-500/20',
    tileText: 'text-orange-700 dark:text-orange-300',
  },
  {
    id: 'red',
    label: 'Red',
    surface: 'bg-rose-50 dark:bg-rose-950/40',
    swatch: 'bg-rose-400',
    accent: 'border-l-rose-400',
    tile: 'bg-rose-100 dark:bg-rose-500/20',
    tileText: 'text-rose-700 dark:text-rose-300',
  },
]

const BY_ID = new Map(NOTE_COLORS.map((color) => [color.id, color]))

export const getNoteColor = (id: NoteColor | undefined): NoteColorSpec =>
  BY_ID.get(id || 'default') ?? NOTE_COLORS[0]
