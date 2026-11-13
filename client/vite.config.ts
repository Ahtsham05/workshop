import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

/**
 * Settings → Appearance → Zoom works like the browser's own zoom, from CSS alone:
 *
 * 1. The app scales by changing the root font size (lib/appearance.ts), so everything
 *    written in rem — all of Tailwind's scale — grows or shrinks.
 * 2. Fixed pixel sizes (`text-[11px]`, `w-[220px]`, `h-[38px]`…) are rewritten to the
 *    same size in rem here (11px → 0.6875rem), so they scale too instead of staying put.
 *    Identical at 100%. Hairlines under 2px (borders), `!important` rules (the 16px
 *    mobile-input rule that stops iOS focus zoom) and `@media print` are left alone.
 * 3. Tailwind's screen breakpoints (`sm:` … `2xl:`, `max-lg:`, `min-[420px]:`) become container
 *    queries on <body>. A media query measures `64rem` with the browser's default 16px
 *    whatever the app's font size is; a container query measures it with the root font
 *    size. So at 80% a 1440px screen gets the layout of a 1800px screen — exactly what
 *    zooming the browser out does — and at 125% the layout of a 1152px one. Every
 *    portal (dialogs, popovers) is inside <body>, so they follow too.
 *
 * Unlike the CSS `zoom` property, none of this changes the coordinate system, so
 * Radix popover/dropdown positioning and 100svh panels keep working.
 */
type CssNode = { type: string; name?: string; params?: string; parent?: CssNode | null }

const insidePrintMedia = (node: CssNode | null | undefined) => {
  for (let n = node; n; n = n.parent) {
    if (n.type === 'atrule' && n.name === 'media' && /\bprint\b/.test(n.params ?? '')) return true
  }
  return false
}

const SCALED_PROPS =
  /^(font-size|line-height|letter-spacing|(min-|max-)?(width|height)|padding(-.+)?|margin(-.+)?|(row-|column-)?gap|top|right|bottom|left|inset(-.+)?|flex-basis|grid-(template|auto)-(columns|rows)|border(-.+)?-radius|scroll-(margin|padding)(-.+)?)$/
const PX_TOKEN = /(^|[\s(,+*/-])(\d*\.?\d+)px\b/g
// Tailwind's own screens (`lg:` → `(width >= 64rem)`) and arbitrary ones (`min-[420px]:`).
// The production build has already lowered them to `(min-width: 64rem)` and, for `max-*`,
// `not all and (min-width: 64rem)` by the time this runs; the dev server has not.
const LENGTH = '([\\d.]+(?:rem|px))'
const BREAKPOINT_FORMS: [RegExp, string][] = [
  [new RegExp(`^\\(width\\s*>=\\s*${LENGTH}\\)$`), '>='],
  [new RegExp(`^\\(min-width:\\s*${LENGTH}\\)$`), '>='],
  [new RegExp(`^\\(width\\s*<\\s*${LENGTH}\\)$`), '<'],
  [new RegExp(`^not all and \\(min-width:\\s*${LENGTH}\\)$`), '<'],
]
const breakpointToContainer = (params: string) => {
  const p = params.trim()
  for (const [re, op] of BREAKPOINT_FORMS) {
    const m = re.exec(p)
    if (m) return `app (width ${op} ${pxToRem(m[1])})`
  }
  return null
}
const pxToRem = (value: string) =>
  value.replace(/(\d*\.?\d+)px\b/g, (_, num: string) => `${+(Number(num) / 16).toFixed(4)}rem`)

const appZoomCss = () => ({
  postcssPlugin: 'app-zoom-css',
  Declaration(decl: { prop: string; value: string; important?: boolean; parent?: CssNode | null }) {
    if (decl.important || !SCALED_PROPS.test(decl.prop) || !decl.value.includes('px')) return
    if (insidePrintMedia(decl.parent)) return
    decl.value = decl.value.replace(PX_TOKEN, (all: string, pre: string, num: string) => {
      const n = Number(num)
      return n < 2 ? all : `${pre}${+(n / 16).toFixed(4)}rem`
    })
  },
  AtRule: {
    media(rule: { name: string; params: string }) {
      const container = breakpointToContainer(rule.params)
      if (!container) return
      rule.name = 'container'
      rule.params = container
    },
    // Element-size breakpoints such as `@min-[1050px]/header:` scale the same way, so a
    // header that drops its clock below 1050px still does at every zoom level.
    container(rule: { params: string }) {
      rule.params = pxToRem(rule.params)
    },
  },
})
appZoomCss.postcss = true as const

// https://vite.dev/config/
export default defineConfig(() => ({
  css: {
    postcss: { plugins: [appZoomCss()] },
  },
  base: process.env.VITE_ELECTRON === 'true' ? './' : '/',
  plugins: [
    TanStackRouterVite({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    cors: true,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 5173,
      clientPort: 5173,
    },
  },
  optimizeDeps: {
    // Force react + react-dom + react-redux into one pre-bundle pass so they
    // all share a single React instance.  Without this, Vite may emit separate
    // chunks (e.g. chunk-TJE776R7 for React, chunk-YSFGEKTM for react-redux)
    // where each chunk has its own React copy — causing the
    // "Cannot read properties of null (reading 'useContext')" crash.
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-redux',
      '@reduxjs/toolkit',
    ],
  },
  resolve: {
    // Ensure only one copy of React exists in the bundle.
    // Without this, Vite may pre-bundle react-redux (or other libs) with their
    // own React copy, causing the "Invalid hook call" / useContext null crash.
    dedupe: ['react', 'react-dom', 'react-redux'],
    alias: {
      '@': path.resolve(__dirname, './src'),

      // fix loading all icon chunks in dev mode
      // https://github.com/tabler/tabler-icons/issues/1233
      '@tabler/icons-react': '@tabler/icons-react/dist/esm/icons/index.mjs',
    },
  },
}))
