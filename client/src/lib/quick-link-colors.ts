/**
 * Tailwind only generates CSS for class names it can see as literal text in a source
 * file at build time — it never executes JS or inspects runtime/API data. Quick Links'
 * `color` field comes from server/src/config/quick-link-registry.js over the network,
 * so a class string that appears *only* there (never as literal text anywhere in
 * client/src) silently produces no CSS: the icon badge renders with no background,
 * which is invisible against a white dialog since the icon itself is `text-white`.
 *
 * This array exists purely so every color string the registry actually uses is also
 * literal text here, which Tailwind's scanner picks up regardless of whether the
 * array is ever read at runtime (it isn't). If a new color is ever added to the
 * server registry, add the exact same string here too, or its badge will render
 * invisibly. Generated from `[...new Set(QUICK_LINK_ACTIONS.map(a => a.color))]`.
 */
export const QUICK_LINK_COLOR_SAFELIST = [
  'bg-amber-500 hover:bg-amber-600',
  'bg-amber-600 hover:bg-amber-700',
  'bg-blue-500 hover:bg-blue-600',
  'bg-blue-600 hover:bg-blue-700',
  'bg-blue-700 hover:bg-blue-800',
  'bg-cyan-500 hover:bg-cyan-600',
  'bg-cyan-600 hover:bg-cyan-700',
  'bg-cyan-700 hover:bg-cyan-800',
  'bg-emerald-500 hover:bg-emerald-600',
  'bg-emerald-600 hover:bg-emerald-700',
  'bg-fuchsia-500 hover:bg-fuchsia-600',
  'bg-fuchsia-600 hover:bg-fuchsia-700',
  'bg-fuchsia-700 hover:bg-fuchsia-800',
  'bg-gray-600 hover:bg-gray-700',
  'bg-green-500 hover:bg-green-600',
  'bg-green-600 hover:bg-green-700',
  'bg-indigo-500 hover:bg-indigo-600',
  'bg-indigo-600 hover:bg-indigo-700',
  'bg-indigo-700 hover:bg-indigo-800',
  'bg-lime-500 hover:bg-lime-600',
  'bg-lime-600 hover:bg-lime-700',
  'bg-orange-500 hover:bg-orange-600',
  'bg-orange-600 hover:bg-orange-700',
  'bg-orange-700 hover:bg-orange-800',
  'bg-pink-500 hover:bg-pink-600',
  'bg-pink-600 hover:bg-pink-700',
  'bg-pink-700 hover:bg-pink-800',
  'bg-purple-500 hover:bg-purple-600',
  'bg-purple-600 hover:bg-purple-700',
  'bg-red-500 hover:bg-red-600',
  'bg-red-600 hover:bg-red-700',
  'bg-rose-500 hover:bg-rose-600',
  'bg-sky-500 hover:bg-sky-600',
  'bg-sky-600 hover:bg-sky-700',
  'bg-slate-500 hover:bg-slate-600',
  'bg-slate-600 hover:bg-slate-700',
  'bg-slate-700 hover:bg-slate-800',
  'bg-teal-500 hover:bg-teal-600',
  'bg-teal-600 hover:bg-teal-700',
  'bg-teal-700 hover:bg-teal-800',
  'bg-violet-500 hover:bg-violet-600',
  'bg-violet-600 hover:bg-violet-700',
  'bg-yellow-500 hover:bg-yellow-600',
  'bg-yellow-600 hover:bg-yellow-700',
] as const
