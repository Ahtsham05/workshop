/**
 * Appearance engine — branch colour identity + table row colours.
 *
 * Two independent things live here because they share one mechanism (CSS custom
 * properties set on <html>):
 *
 *  1. **Branch colour** (org-wide, stored on the Branch): the whole app is tinted
 *     with the active branch's colour so staff can tell at a glance whether they
 *     are posting to the main branch or a sub-branch.
 *  2. **Row colours** (per user, stored on the User + localStorage): the table
 *     row / alternating-row / hover palette. Staring at dense tables all day is
 *     tiring, so each person picks the combination their eyes tolerate.
 *
 * Every value is written as a *pair* (`--x-light` / `--x-dark`) and index.css picks
 * the right one off the `.dark` class. That way switching day/night never needs JS.
 */

/* ── Branch colours ──────────────────────────────────────────────────────── */

export type BranchColorKey =
  | ''
  | 'slate'
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'teal'
  | 'emerald'
  | 'amber'
  | 'orange'
  | 'rose'

export interface BranchColorOption {
  key: Exclude<BranchColorKey, ''>
  label: string
  hex: string
}

/** Mid-tone hues that stay legible mixed into both the light and the dark surfaces. */
export const BRANCH_COLORS: BranchColorOption[] = [
  { key: 'slate', label: 'Slate', hex: '#64748b' },
  { key: 'blue', label: 'Blue', hex: '#3b82f6' },
  { key: 'indigo', label: 'Indigo', hex: '#6366f1' },
  { key: 'violet', label: 'Violet', hex: '#8b5cf6' },
  { key: 'teal', label: 'Teal', hex: '#14b8a6' },
  { key: 'emerald', label: 'Emerald', hex: '#10b981' },
  { key: 'amber', label: 'Amber', hex: '#f59e0b' },
  { key: 'orange', label: 'Orange', hex: '#f97316' },
  { key: 'rose', label: 'Rose', hex: '#f43f5e' },
]

export function branchColorHex(key: BranchColorKey | undefined | null): string | null {
  if (!key) return null
  return BRANCH_COLORS.find((c) => c.key === key)?.hex ?? null
}

/* ── Tint strength ───────────────────────────────────────────────────────── */

export type BranchTintLevel = 'off' | 'subtle' | 'medium' | 'strong'

interface TintMix {
  bg: number
  card: number
  sidebar: number
}

interface TintLevel {
  key: BranchTintLevel
  label: string
  description: string
  light: TintMix
  dark: TintMix
}

/**
 * How much of the branch colour is mixed into the background / card / sidebar
 * surfaces. Dark surfaces swallow colour, so they get a slightly richer mix.
 */
export const BRANCH_TINT_LEVELS: TintLevel[] = [
  {
    key: 'off',
    label: 'Off',
    description: 'No branch tint — standard app colours.',
    light: { bg: 0, card: 0, sidebar: 0 },
    dark: { bg: 0, card: 0, sidebar: 0 },
  },
  {
    key: 'subtle',
    label: 'Subtle',
    description: 'A hint of colour. Recommended for all-day use.',
    light: { bg: 4, card: 2.5, sidebar: 14 },
    dark: { bg: 6, card: 5, sidebar: 14 },
  },
  {
    key: 'medium',
    label: 'Medium',
    description: 'Clearly visible without fighting the data.',
    light: { bg: 7, card: 4.5, sidebar: 26 },
    dark: { bg: 10, card: 8, sidebar: 26 },
  },
  {
    key: 'strong',
    label: 'Strong',
    description: 'Unmistakable — for staff who switch branches often.',
    light: { bg: 11, card: 7, sidebar: 42 },
    dark: { bg: 15, card: 12, sidebar: 40 },
  },
]

/* ── Theme colour (buttons, links, focus rings) ─────────────────────────────
 *
 * Unlike branch tint and row colours, a theme colour does not need a separate
 * light/dark value: it is a brand colour, not a surface, so the same hue reads
 * fine against either background. Applying it is therefore a plain override of
 * `--primary` / `--primary-foreground` / `--ring` written as inline style on
 * <html> — inline style already outranks the `:root` / `.dark` rules in
 * index.css, so 'default' just removes the override and the stock colours
 * (which are also what shipped before this feature existed) come back. */

export type ThemeColorKey =
  // Neutral
  | 'default'
  | 'graphite'
  | 'stone'
  // Blue
  | 'navy'
  | 'blue'
  | 'sky'
  | 'cyan'
  // Green
  | 'teal'
  | 'emerald'
  | 'green'
  | 'forest'
  | 'lime'
  // Warm
  | 'yellow'
  | 'amber'
  | 'orange'
  | 'bronze'
  | 'red'
  | 'maroon'
  // Purple & pink
  | 'indigo'
  | 'violet'
  | 'purple'
  | 'fuchsia'
  | 'pink'
  | 'rose'

/** Swatches are shown family by family rather than as one long wall of dots. */
export type ThemeColorGroup = 'neutral' | 'blue' | 'green' | 'warm' | 'purple'

export const THEME_COLOR_GROUPS: { key: ThemeColorGroup; label: string }[] = [
  { key: 'neutral', label: 'Neutral' },
  { key: 'blue', label: 'Blue' },
  { key: 'green', label: 'Green' },
  { key: 'warm', label: 'Warm' },
  { key: 'purple', label: 'Purple & pink' },
]

export interface ThemeColorOption {
  key: ThemeColorKey
  label: string
  group: ThemeColorGroup
  /** Shown as the picker's swatch dot — the recognisable, vivid shade. */
  swatch: string
  /**
   * Only for colours whose real primary differs by mode. 'default' is the one such
   * case: it keeps index.css's own `--primary`, which is near-black in light mode
   * and near-white in dark, so a single dot would misrepresent it in one of them.
   */
  swatchDark?: string
  /** Applied to buttons etc. Tuned a shade darker than the swatch where needed for contrast. */
  primary: string
  primaryForeground: string
  ring: string
}

/**
 * Every `primary` here clears 4.5:1 against its own `primaryForeground`, because it
 * is a button fill with a label on it — the swatch is allowed to be brighter since
 * nothing is written on top of it. Keys are never renamed or removed: a saved
 * preference (user account + localStorage) is matched by key.
 */
export const THEME_COLORS: ThemeColorOption[] = [
  /* ── Neutral ──────────────────────────────────────────────────────────── */
  {
    key: 'default',
    label: 'Default',
    group: 'neutral',
    swatch: '#0f172a',
    swatchDark: '#e8eaee',
    primary: '',
    primaryForeground: '',
    ring: '',
  },
  { key: 'graphite', label: 'Graphite', group: 'neutral', swatch: '#475569', primary: '#334155', primaryForeground: '#ffffff', ring: '#64748b' },
  { key: 'stone', label: 'Stone', group: 'neutral', swatch: '#78716c', primary: '#57534e', primaryForeground: '#ffffff', ring: '#a8a29e' },

  /* ── Blue ─────────────────────────────────────────────────────────────── */
  { key: 'navy', label: 'Navy', group: 'blue', swatch: '#1d4ed8', primary: '#1e3a8a', primaryForeground: '#ffffff', ring: '#2563eb' },
  { key: 'blue', label: 'Blue', group: 'blue', swatch: '#3b82f6', primary: '#2563eb', primaryForeground: '#ffffff', ring: '#3b82f6' },
  { key: 'sky', label: 'Sky', group: 'blue', swatch: '#0ea5e9', primary: '#0284c7', primaryForeground: '#ffffff', ring: '#0ea5e9' },
  { key: 'cyan', label: 'Cyan', group: 'blue', swatch: '#06b6d4', primary: '#0891b2', primaryForeground: '#ffffff', ring: '#06b6d4' },

  /* ── Green ────────────────────────────────────────────────────────────── */
  { key: 'teal', label: 'Teal', group: 'green', swatch: '#14b8a6', primary: '#0d9488', primaryForeground: '#ffffff', ring: '#14b8a6' },
  { key: 'emerald', label: 'Emerald', group: 'green', swatch: '#10b981', primary: '#059669', primaryForeground: '#ffffff', ring: '#10b981' },
  { key: 'green', label: 'Green', group: 'green', swatch: '#22c55e', primary: '#16a34a', primaryForeground: '#ffffff', ring: '#22c55e' },
  { key: 'forest', label: 'Forest', group: 'green', swatch: '#15803d', primary: '#166534', primaryForeground: '#ffffff', ring: '#16a34a' },
  { key: 'lime', label: 'Lime', group: 'green', swatch: '#84cc16', primary: '#4d7c0f', primaryForeground: '#ffffff', ring: '#84cc16' },

  /* ── Warm ─────────────────────────────────────────────────────────────── */
  { key: 'yellow', label: 'Yellow', group: 'warm', swatch: '#eab308', primary: '#a16207', primaryForeground: '#ffffff', ring: '#eab308' },
  // Dark text on this amber only reaches 3.9:1; white reaches 4.9:1, so the button
  // label is white here even though the swatch reads as a light colour.
  { key: 'amber', label: 'Amber', group: 'warm', swatch: '#f59e0b', primary: '#b45309', primaryForeground: '#ffffff', ring: '#f59e0b' },
  { key: 'orange', label: 'Orange', group: 'warm', swatch: '#f97316', primary: '#c2410c', primaryForeground: '#ffffff', ring: '#f97316' },
  { key: 'bronze', label: 'Bronze', group: 'warm', swatch: '#b45309', primary: '#92400e', primaryForeground: '#ffffff', ring: '#d97706' },
  { key: 'red', label: 'Red', group: 'warm', swatch: '#ef4444', primary: '#dc2626', primaryForeground: '#ffffff', ring: '#ef4444' },
  { key: 'maroon', label: 'Maroon', group: 'warm', swatch: '#9f1239', primary: '#881337', primaryForeground: '#ffffff', ring: '#be123c' },

  /* ── Purple & pink ────────────────────────────────────────────────────── */
  { key: 'indigo', label: 'Indigo', group: 'purple', swatch: '#6366f1', primary: '#4f46e5', primaryForeground: '#ffffff', ring: '#6366f1' },
  { key: 'violet', label: 'Violet', group: 'purple', swatch: '#8b5cf6', primary: '#7c3aed', primaryForeground: '#ffffff', ring: '#8b5cf6' },
  { key: 'purple', label: 'Purple', group: 'purple', swatch: '#a855f7', primary: '#9333ea', primaryForeground: '#ffffff', ring: '#a855f7' },
  { key: 'fuchsia', label: 'Fuchsia', group: 'purple', swatch: '#d946ef', primary: '#c026d3', primaryForeground: '#ffffff', ring: '#d946ef' },
  { key: 'pink', label: 'Pink', group: 'purple', swatch: '#ec4899', primary: '#db2777', primaryForeground: '#ffffff', ring: '#ec4899' },
  { key: 'rose', label: 'Rose', group: 'purple', swatch: '#f43f5e', primary: '#e11d48', primaryForeground: '#ffffff', ring: '#f43f5e' },
]

export function themeColorOption(key: ThemeColorKey | undefined | null): ThemeColorOption {
  return THEME_COLORS.find((c) => c.key === key) ?? THEME_COLORS[0]
}

/* ── Row colour schemes ──────────────────────────────────────────────────── */

export type RowSchemeKey =
  | 'default'
  | 'slate'
  | 'sky'
  | 'mint'
  | 'sand'
  | 'lavender'
  | 'rose'
  | 'paper'

export interface RowColors {
  /** Every body row. */
  base: string
  /** Even rows when alternating rows are on. */
  alt: string
  /** Row under the cursor. */
  hover: string
  /** Header row. */
  head: string
}

export interface RowScheme {
  key: RowSchemeKey
  label: string
  description: string
  light: RowColors
  dark: RowColors
}

/**
 * Row tints are semi-transparent ink over whatever surface is underneath, never
 * opaque fills — that is what lets them sit on top of a branch-tinted background
 * (and on dark mode) without repainting it.
 */
type Alphas = { base: number; alt: number; hover: number; head: number }

function lightRow(hue: number, chroma: number, a: Alphas): RowColors {
  return {
    base: `oklch(0.45 ${chroma} ${hue} / ${a.base}%)`,
    alt: `oklch(0.45 ${chroma} ${hue} / ${a.alt}%)`,
    hover: `oklch(0.45 ${(chroma * 1.4).toFixed(3)} ${hue} / ${a.hover}%)`,
    head: `oklch(0.45 ${chroma} ${hue} / ${a.head}%)`,
  }
}

function darkRow(hue: number, chroma: number, a: Alphas): RowColors {
  return {
    base: `oklch(0.88 ${chroma} ${hue} / ${a.base}%)`,
    alt: `oklch(0.88 ${chroma} ${hue} / ${a.alt}%)`,
    hover: `oklch(0.92 ${(chroma * 1.3).toFixed(3)} ${hue} / ${a.hover}%)`,
    head: `oklch(0.88 ${chroma} ${hue} / ${a.head}%)`,
  }
}

/** Tinted schemes share one rhythm; only the hue changes. */
const TINTED_LIGHT: Alphas = { base: 3, alt: 9, hover: 14, head: 11 }
const TINTED_DARK: Alphas = { base: 3, alt: 8, hover: 14, head: 7 }

export const ROW_SCHEMES: RowScheme[] = [
  {
    key: 'default',
    label: 'Neutral',
    description: 'The standard grey stripe.',
    light: lightRow(257, 0.03, { base: 0, alt: 6, hover: 11, head: 5 }),
    dark: darkRow(257, 0.02, { base: 0, alt: 5, hover: 10, head: 4 }),
  },
  {
    key: 'slate',
    label: 'Cool slate',
    description: 'Low-contrast grey-blue. Easiest on tired eyes.',
    light: lightRow(250, 0.04, TINTED_LIGHT),
    dark: darkRow(250, 0.03, TINTED_DARK),
  },
  {
    key: 'sky',
    label: 'Soft blue',
    description: 'Classic ledger blue.',
    light: lightRow(240, 0.1, TINTED_LIGHT),
    dark: darkRow(240, 0.07, TINTED_DARK),
  },
  {
    key: 'mint',
    label: 'Mint',
    description: 'Cool green — calm on long stock lists.',
    light: lightRow(165, 0.09, TINTED_LIGHT),
    dark: darkRow(165, 0.07, TINTED_DARK),
  },
  {
    key: 'sand',
    label: 'Warm sand',
    description: 'Warm, low-blue tint for long sessions.',
    light: lightRow(80, 0.1, TINTED_LIGHT),
    dark: darkRow(80, 0.07, TINTED_DARK),
  },
  {
    key: 'lavender',
    label: 'Lavender',
    description: 'Gentle violet stripe.',
    light: lightRow(300, 0.09, TINTED_LIGHT),
    dark: darkRow(300, 0.07, TINTED_DARK),
  },
  {
    key: 'rose',
    label: 'Rose',
    description: 'Warm pink stripe with strong row separation.',
    light: lightRow(15, 0.1, TINTED_LIGHT),
    dark: darkRow(15, 0.07, TINTED_DARK),
  },
  {
    key: 'paper',
    label: 'Paper',
    description: 'Cream sheet look — the lowest blue light of the set.',
    light: lightRow(85, 0.09, { base: 8, alt: 15, hover: 20, head: 17 }),
    dark: darkRow(85, 0.06, { base: 4, alt: 10, hover: 16, head: 9 }),
  },
]

export function rowScheme(key: RowSchemeKey | undefined | null): RowScheme {
  return ROW_SCHEMES.find((s) => s.key === key) ?? ROW_SCHEMES[0]
}

/* ── User preferences ────────────────────────────────────────────────────── */

export interface AppearancePreferences {
  rowScheme: RowSchemeKey
  alternateRows: boolean
  branchTint: BranchTintLevel
  themeColor: ThemeColorKey
}

// Matches the 'royal' preset below on purpose: brand-new accounts (nothing saved
// yet, on either this device or the account) land on the same indigo-violet accent
// as the sign-in, sign-up and onboarding screens, instead of the neutral stock
// look — so Settings → Appearance also shows "Royal" as already selected rather
// than looking like an unmatched custom mix.
export const DEFAULT_APPEARANCE: AppearancePreferences = {
  rowScheme: 'lavender',
  alternateRows: true,
  branchTint: 'subtle',
  themeColor: 'violet',
}

/* ── Themes (presets) ────────────────────────────────────────────────────────
 *
 * A theme is not a new mechanism: it is one saved combination of the dials that
 * already exist — light/dark mode, theme colour, row colours, alternating rows
 * and branch tint strength. Picking one sets all five at once, which is what most
 * people actually want ("make it look like that") instead of tuning five controls
 * until they agree with each other.
 *
 * Nothing extra is persisted for a theme: which one is highlighted is derived by
 * comparing the live settings back against this table (`matchThemePreset`), so a
 * theme stays a starting point and any dial can still be nudged afterwards. */

export type ThemeMode = 'light' | 'dark'

export interface ThemePreset {
  key: string
  label: string
  description: string
  mode: ThemeMode
  themeColor: ThemeColorKey
  rowScheme: RowSchemeKey
  branchTint: BranchTintLevel
  alternateRows: boolean
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    key: 'classic',
    label: 'Classic',
    description: 'The stock look — neutral ink on white.',
    mode: 'light',
    themeColor: 'default',
    rowScheme: 'default',
    branchTint: 'subtle',
    alternateRows: true,
  },
  {
    key: 'ocean',
    label: 'Ocean',
    description: 'Corporate blue with a soft ledger stripe.',
    mode: 'light',
    themeColor: 'blue',
    rowScheme: 'sky',
    branchTint: 'subtle',
    alternateRows: true,
  },
  {
    key: 'evergreen',
    label: 'Evergreen',
    description: 'Deep green — calm on long stock and sales lists.',
    mode: 'light',
    themeColor: 'emerald',
    rowScheme: 'mint',
    branchTint: 'subtle',
    alternateRows: true,
  },
  {
    key: 'sunset',
    label: 'Sunset',
    description: 'Warm orange over a sand stripe.',
    mode: 'light',
    themeColor: 'orange',
    rowScheme: 'sand',
    branchTint: 'subtle',
    alternateRows: true,
  },
  {
    key: 'royal',
    label: 'Royal',
    description: 'Violet accents with a lavender stripe.',
    mode: 'light',
    themeColor: 'violet',
    rowScheme: 'lavender',
    branchTint: 'subtle',
    alternateRows: true,
  },
  {
    key: 'reading',
    label: 'Reading room',
    description: 'Cream sheet, bronze accents — the lowest blue light of the set.',
    mode: 'light',
    themeColor: 'bronze',
    rowScheme: 'paper',
    branchTint: 'off',
    alternateRows: true,
  },
  {
    key: 'midnight',
    label: 'Midnight',
    description: 'Dark surfaces with indigo accents.',
    mode: 'dark',
    themeColor: 'indigo',
    rowScheme: 'slate',
    branchTint: 'subtle',
    alternateRows: true,
  },
  {
    key: 'graphite',
    label: 'Graphite',
    description: 'Dark and neutral — nothing competes with the numbers.',
    mode: 'dark',
    themeColor: 'graphite',
    rowScheme: 'default',
    branchTint: 'off',
    alternateRows: true,
  },
  {
    key: 'aurora',
    label: 'Aurora',
    description: 'Indigo-violet accents on deep navy — the same look as sign-in and setup.',
    mode: 'dark',
    themeColor: 'violet',
    rowScheme: 'lavender',
    branchTint: 'subtle',
    alternateRows: true,
  },
]

/** The settings a preset writes, as a patch for `setPreferences`. */
export function themePresetPreferences(preset: ThemePreset): AppearancePreferences {
  return {
    themeColor: preset.themeColor,
    rowScheme: preset.rowScheme,
    branchTint: preset.branchTint,
    alternateRows: preset.alternateRows,
  }
}

/**
 * Which preset the current settings *are*, if any. `mode` is the resolved light/dark
 * mode (never 'system'), so a person on system-dark matches the dark presets.
 */
export function matchThemePreset(
  prefs: AppearancePreferences,
  mode: ThemeMode
): ThemePreset | null {
  return (
    THEME_PRESETS.find(
      (p) =>
        p.mode === mode &&
        p.themeColor === prefs.themeColor &&
        p.rowScheme === prefs.rowScheme &&
        p.branchTint === prefs.branchTint &&
        p.alternateRows === prefs.alternateRows
    ) ?? null
  )
}

const PREFS_KEY = 'app-appearance-v1'
/** The active branch's colour, cached so the first paint after a reload is already tinted. */
const BRANCH_COLOR_KEY = 'app-branch-color'

export function readStoredAppearance(): AppearancePreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { ...DEFAULT_APPEARANCE }
    const parsed = JSON.parse(raw) as Partial<AppearancePreferences>
    return normalizeAppearance(parsed)
  } catch {
    return { ...DEFAULT_APPEARANCE }
  }
}

/** Accepts anything (server payload, old localStorage) and returns a valid set. */
export function normalizeAppearance(
  value: Partial<AppearancePreferences> | null | undefined
): AppearancePreferences {
  return {
    rowScheme: ROW_SCHEMES.some((s) => s.key === value?.rowScheme)
      ? (value!.rowScheme as RowSchemeKey)
      : DEFAULT_APPEARANCE.rowScheme,
    alternateRows:
      typeof value?.alternateRows === 'boolean'
        ? value.alternateRows
        : DEFAULT_APPEARANCE.alternateRows,
    branchTint: BRANCH_TINT_LEVELS.some((t) => t.key === value?.branchTint)
      ? (value!.branchTint as BranchTintLevel)
      : DEFAULT_APPEARANCE.branchTint,
    themeColor: THEME_COLORS.some((c) => c.key === value?.themeColor)
      ? (value!.themeColor as ThemeColorKey)
      : DEFAULT_APPEARANCE.themeColor,
  }
}

export function writeStoredAppearance(prefs: AppearancePreferences) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* private mode / quota — the in-memory state still applies for this session */
  }
}

/** Drops this device's copy of the appearance state (used on sign-out). */
export function clearStoredAppearance(): void {
  try {
    localStorage.removeItem(PREFS_KEY)
    localStorage.removeItem(BRANCH_COLOR_KEY)
  } catch {
    /* ignore */
  }
  applyAppearance(DEFAULT_APPEARANCE, '')
}

export function readStoredBranchColor(): BranchColorKey {
  try {
    const key = localStorage.getItem(BRANCH_COLOR_KEY) ?? ''
    return BRANCH_COLORS.some((c) => c.key === key) ? (key as BranchColorKey) : ''
  } catch {
    return ''
  }
}

export function writeStoredBranchColor(key: BranchColorKey) {
  try {
    if (key) localStorage.setItem(BRANCH_COLOR_KEY, key)
    else localStorage.removeItem(BRANCH_COLOR_KEY)
  } catch {
    /* ignore */
  }
}

/* ── Applying it to the document ─────────────────────────────────────────── */

/**
 * Writes the whole appearance state onto <html> as custom properties. index.css
 * consumes them; nothing else in the app needs to know these names.
 */
export function applyAppearance(
  prefs: AppearancePreferences,
  branchColor: BranchColorKey
): void {
  const root = document.documentElement
  const scheme = rowScheme(prefs.rowScheme)

  const setPair = (name: string, light: string, dark: string) => {
    root.style.setProperty(`${name}-light`, light)
    root.style.setProperty(`${name}-dark`, dark)
  }

  setPair('--row-base', scheme.light.base, scheme.dark.base)
  setPair('--row-alt', scheme.light.alt, scheme.dark.alt)
  setPair('--row-hover', scheme.light.hover, scheme.dark.hover)
  setPair('--row-head', scheme.light.head, scheme.dark.head)

  root.dataset.rowScheme = prefs.rowScheme
  root.dataset.rowZebra = prefs.alternateRows ? 'on' : 'off'

  const hex = branchColorHex(branchColor)
  const level =
    BRANCH_TINT_LEVELS.find((l) => l.key === prefs.branchTint) ?? BRANCH_TINT_LEVELS[1]
  // No colour picked for this branch => no tint at all, whatever the strength setting.
  const mix = hex ? level : BRANCH_TINT_LEVELS[0]

  root.style.setProperty('--branch-color', hex ?? 'transparent')
  setPair('--branch-tint-bg', `${mix.light.bg}%`, `${mix.dark.bg}%`)
  setPair('--branch-tint-card', `${mix.light.card}%`, `${mix.dark.card}%`)
  setPair('--branch-tint-sidebar', `${mix.light.sidebar}%`, `${mix.dark.sidebar}%`)

  if (branchColor) root.dataset.branchColor = branchColor
  else delete root.dataset.branchColor

  const theme = themeColorOption(prefs.themeColor)
  if (theme.key === 'default') {
    root.style.removeProperty('--primary')
    root.style.removeProperty('--primary-foreground')
    root.style.removeProperty('--ring')
    root.style.removeProperty('--sidebar-accent')
    root.style.removeProperty('--sidebar-accent-foreground')
    root.style.removeProperty('--sidebar-ring')
    root.style.removeProperty('--theme-color')
    root.style.removeProperty('--sidebar-theme-tint')
    root.style.removeProperty('--accent-theme-tint')
    root.style.removeProperty('--chart-theme-primary')
    root.style.removeProperty('--chart-theme-primary-foreground')
    root.style.removeProperty('--chart-theme-primary-tint')
    delete root.dataset.themeColor
  } else {
    root.style.setProperty('--primary', theme.primary)
    root.style.setProperty('--primary-foreground', theme.primaryForeground)
    root.style.setProperty('--ring', theme.ring)
    // The sidebar panel is a fixed dark surface in both site themes (it does not
    // switch with light/dark mode), so its active/hover pill reuses the same
    // primary/foreground pairing already tuned for contrast — one colour, one
    // set of rules, instead of a second palette to keep in sync.
    root.style.setProperty('--sidebar-accent', theme.primary)
    root.style.setProperty('--sidebar-accent-foreground', theme.primaryForeground)
    root.style.setProperty('--sidebar-ring', theme.ring)
    // Washes the whole sidebar panel toward the chosen colour (not just the
    // active/hover pill) — same color-mix trick as branch tint, composed with it
    // in index.css so a colourful theme and a branch identity colour both show.
    root.style.setProperty('--theme-color', theme.primary)
    root.style.setProperty('--sidebar-theme-tint', '55%')
    // A light wash (not the sidebar's bold 55%) over the app-wide --accent token, so
    // every Select/Command/DropdownMenu item's hover/selected background follows the
    // theme too, without turning a long options list into a wall of saturated colour.
    root.style.setProperty('--accent-theme-tint', '10%')
    // Read by chart components, KPI/tag tone helpers, and active-tab styling (each via
    // `var(--chart-theme-primary, <their own default colour>)`) so the "headline" series
    // in a chart, a stat-card icon badge, a status tag, or the active tab in a tab bar all
    // follow the theme too — while things with real fixed meaning (profit green, an
    // up/down delta, a rising/falling trend) are left alone at each call site.
    root.style.setProperty('--chart-theme-primary', theme.primary)
    // Paired foreground for anything using --chart-theme-primary as a solid fill (not a
    // tint) that needs readable text on top of it — e.g. the active tab pill.
    root.style.setProperty('--chart-theme-primary-foreground', theme.primaryForeground)
    // A pre-diluted companion for badges/pills whose *background* was always a separate,
    // lighter literal shade from their *text* (e.g. `bg-green-50 text-green-700` — two
    // different discrete colours, not one colour at two opacities). Those call sites keep
    // text/border on the solid `--chart-theme-primary` and switch only their background to
    // this tint — using the same variable for both would make the text disappear into its
    // own background the moment a theme is picked.
    root.style.setProperty('--chart-theme-primary-tint', `color-mix(in oklab, ${theme.primary} 12%, transparent)`)
    root.dataset.themeColor = theme.key
  }
}

/**
 * Applies the last known appearance before React mounts, so the app never paints
 * one frame of default colours and then jumps.
 */
export function applyStoredAppearance(): void {
  applyAppearance(readStoredAppearance(), readStoredBranchColor())
}
