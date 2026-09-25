import { AuthBrandPanel } from './components/auth-brand-panel'

interface Props {
  /** Page heading, e.g. "Welcome back". */
  title: string
  /** One line under the heading. */
  description: React.ReactNode
  children: React.ReactNode
  /** Small print under the form (terms, "already have an account", …). */
  footer?: React.ReactNode
}

/**
 * The shell every auth screen sits in: brand on the left, form on the right.
 *
 * Below `lg` the brand panel drops away entirely and the form gets the whole screen —
 * most staff sign in from a phone, and a decorative half-screen would only push the
 * fields below the fold.
 *
 * Both halves are pinned regardless of the signed-in app's own light/dark preference
 * (which lives in this browser's `vite-ui-theme` key and only takes effect once
 * someone is actually signed in) — the brand panel is always dark, the form panel is
 * always light, on purpose, not a light/dark pair that follows `<html>`. Each side
 * gets its own scoping class (`dark` / `light`); `@custom-variant dark
 * (&:is(.dark *))` in index.css matches ANY `.dark` ancestor, not just the root, so
 * this works regardless of what `<html>` currently has. The `dark`/`light` wrapper
 * around the brand panel also carries `contents` (CSS `display: contents`) so it
 * disappears from the grid's box model — the `<aside>` inside it stays the actual
 * grid item and keeps stretching to fill the column, exactly as if the wrapper
 * weren't there; only its class-based scoping (for `dark:` utilities and the CSS
 * custom properties below them) still applies to everything inside it.
 * `text-foreground` is re-asserted on the form panel: `body` sets its `color` once,
 * above this wrapper, and plain CSS properties inherit the already-computed value
 * rather than re-deriving it — unlike the custom-property tokens (`--card` /
 * `--background`), which recompute at whichever element `.light` nearest matches.
 *
 * Phones and tablets never see the full `AuthBrandPanel` (a whole illustrated half-
 * screen would only push the form below the fold), but they still get a compact
 * branded header above the form — same dark gradient, same mark — instead of a bare
 * white form with zero brand identity. It's a literal `<img src='/images/logo-
 * light.png'>` on a white tile, not the theme-reactive `<Logo>` component: `Logo`
 * picks its asset from `useTheme()` (the real, global `<html>` mode), which has no
 * idea this header is *locally* pinned dark regardless of that — on a fresh visitor
 * (dark by default) it would have picked the dark-background logo variant and shown
 * it floating with no tile on this always-dark strip, when it needs the light
 * variant + tile treatment (matching `AuthBrandPanel`'s own logo) every time.
 *
 * `grid-rows-[auto_1fr] lg:grid-rows-none`: below `lg` there are two stacked rows
 * (the mobile header, then `<main>`) inside a `min-h-svh` container. CSS Grid's
 * `align-content: normal` resolves to `stretch` for auto-sized row tracks, so
 * without an explicit template both rows were being inflated to fill the leftover
 * space (the header ballooning to ~220px of empty space below the logo) instead of
 * staying content-sized. `auto 1fr` pins the header to its content height and gives
 * all the leftover space to `<main>`'s row instead, where `justify-center` can
 * actually use it to centre the form card. Reset to `none` at `lg` so it doesn't
 * fight the single-row two-column desktop layout (the header row does not exist
 * there — `lg:hidden` removes it from the grid entirely).
 */
export default function AuthLayout({
  title,
  description,
  children,
  footer,
}: Props) {
  return (
    <div className='light bg-background grid min-h-svh grid-rows-[auto_1fr] lg:grid-rows-none lg:grid-cols-[1.05fr_1fr]'>
      <div className='dark bg-[linear-gradient(135deg,#050508_0%,#0c0e18_60%,#161a2c_100%)] px-5 py-5 text-white lg:hidden'>
        <div className='mx-auto flex w-full max-w-[420px] items-center gap-3'>
          <img
            src='/images/logo-light.png'
            alt=''
            className='h-10 w-10 shrink-0 rounded-lg bg-white object-contain p-1'
            aria-hidden
          />
          <div className='min-w-0 leading-tight'>
            <p className='text-sm font-semibold'>Logix Plus</p>
            <p className='truncate text-xs text-sky-200/70'>Smart Software for a Better Tomorrow</p>
          </div>
        </div>
      </div>

      <div className='dark contents'>
        <AuthBrandPanel />
      </div>

      <main className='light text-foreground relative flex flex-col justify-center px-5 py-8 sm:px-8 lg:py-10'>
        <div className='mx-auto w-full max-w-[420px] lg:rounded-2xl lg:border lg:bg-card lg:p-8 lg:shadow-xl lg:shadow-slate-900/[0.06]'>
          <div className='space-y-1.5'>
            <h1 className='text-2xl font-semibold tracking-tight'>{title}</h1>
            <p className='text-muted-foreground text-sm'>{description}</p>
          </div>

          <div className='mt-7'>{children}</div>

          {footer ? <div className='mt-7'>{footer}</div> : null}
        </div>
      </main>
    </div>
  )
}
