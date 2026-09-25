/**
 * Stacking order for the floating Notes window.
 *
 * The window is portaled to <body> and floats above the page, so it needs a
 * z-index above ordinary page chrome. Every menu it owns is portaled to <body>
 * too — Radix popovers and dropdown menus default to `z-50` in
 * components/ui/*, which is BELOW the window. Left alone they open correctly
 * but render behind it, so the button looks dead: nothing appears on click.
 *
 * Anything rendered from inside the window that must be clickable therefore
 * carries POPOVER_LAYER. It deliberately stays below the reminder alarm splash
 * (z-[100]) — an alarm still has to win over a colour picker.
 */

/** The window itself, and its minimized pill. */
export const WINDOW_LAYER = 'z-[90]'

/** Popovers, dropdowns and tooltips opened from inside the window. */
export const POPOVER_LAYER = 'z-[95]'
