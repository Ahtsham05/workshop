import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BadgePercent, Calculator, CalendarClock, Minus, Percent, Receipt, Scale, TrendingUp, UnfoldVertical, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useIsPhone } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { WINDOW_LAYER } from '@/features/notepad/lib/layers'
import { useFloatingPosition } from '@/hooks/use-floating-position'
import {
  CALCULATOR_SHORTCUT_LABEL,
  closeCalculator,
  isCalculatorShortcut,
  minimizeCalculator,
  openCalculator,
  setCalculatorTab,
  toggleCalculator,
  useCalculatorState,
  type CalculatorTab,
} from '../lib/calculator-store'
import { BasicCalculator } from './basic-calculator'
import { BreakEvenTool, DiscountTool, InstallmentTool, MarginMarkupTool, PercentTool, TaxTool } from './business-tools'

const WIDTH = 400
/** Keypad height until the person drags it to their own size. */
const BASIC_HEIGHT = 600
const MIN_HEIGHT = 320
const EDGE = 8
/** Window border, top + bottom. */
const FRAME_BORDER = 2
/** The tool body's p-3, top + bottom. */
const BODY_PADDING = 24
const RESIZE_STEP = 16
const POSITION_KEY = 'calculator-window-v1'
const SIZE_KEY = 'calculator-size-v1'
// Minimized pill starts to the left of the assistant launcher (56px wide, 20px from the edge), not on top of it.
const PILL_DEFAULT = { side: 92, bottom: 28 }

const TABS: { key: CalculatorTab; label: string; icon: typeof Calculator }[] = [
  { key: 'basic', label: 'Calculator', icon: Calculator },
  { key: 'margin', label: 'Margin', icon: TrendingUp },
  { key: 'discount', label: 'Discount', icon: BadgePercent },
  { key: 'tax', label: 'Tax', icon: Receipt },
  { key: 'percent', label: 'Percent', icon: Percent },
  { key: 'installment', label: 'Installment', icon: CalendarClock },
  { key: 'breakeven', label: 'Break-even', icon: Scale },
]

interface Position {
  x: number
  y: number
}

/**
 * Heights the person chose by dragging an edge. The keypad and the business tools are sized
 * separately: a tall keypad is a matter of taste, while a tool is best at exactly its own
 * height — so `tools: null` (the default) means "fit the tool on screen, no scrolling".
 */
interface Sizes {
  basic: number
  tools: number | null
}

const DEFAULT_SIZES: Sizes = { basic: BASIC_HEIGHT, tools: null }

function readJson<T>(key: string): Partial<T> | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Partial<T>) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

function readPosition(): Position {
  const parsed = readJson<Position>(POSITION_KEY)
  if (parsed && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) return parsed as Position
  return { x: -1, y: -1 }
}

function readSizes(): Sizes {
  const parsed = readJson<Sizes>(SIZE_KEY)
  return {
    basic: Number.isFinite(parsed?.basic) ? (parsed!.basic as number) : DEFAULT_SIZES.basic,
    tools: Number.isFinite(parsed?.tools) ? (parsed!.tools as number) : null,
  }
}

let bannerProbe: HTMLDivElement | null = null
/**
 * Height of the fixed notification / install banners along the bottom of the screen, in px.
 * Their CSS variables are in rem, so an invisible probe lets the browser resolve them.
 */
function bannersHeight() {
  if (!bannerProbe?.isConnected) {
    bannerProbe = document.createElement('div')
    bannerProbe.setAttribute('aria-hidden', 'true')
    bannerProbe.style.cssText =
      'position:fixed;left:0;top:0;width:0;visibility:hidden;pointer-events:none;height:calc(var(--push-banner-height, 0px) + var(--pwa-banner-height, 0px))'
    document.body.appendChild(bannerProbe)
  }
  return bannerProbe.offsetHeight
}
/** Bottom of the usable screen: the window never hides behind the banners. */
const screenBottom = () => window.innerHeight - bannersHeight()
const maxHeight = () => Math.max(MIN_HEIGHT, screenBottom() - EDGE * 2)
const clampHeight = (height: number, max = maxHeight()) => Math.round(Math.min(Math.max(height, MIN_HEIGHT), max))
const frameWidth = () => Math.min(WIDTH, window.innerWidth - EDGE * 2)

/**
 * Keeps a window of `height` on screen; -1 means "never placed" → bottom-right corner, clear
 * of the header. The stored position is only an anchor: a taller tool slides the window up
 * just enough to fit, and a shorter one lets it settle back where the person put it.
 */
function clamp(position: Position, height: number): Position {
  const maxX = Math.max(EDGE, window.innerWidth - frameWidth() - EDGE)
  const maxY = Math.max(EDGE, screenBottom() - height - EDGE)
  const x = position.x < 0 ? maxX - 16 : Math.min(Math.max(position.x, EDGE), maxX)
  const y = position.y < 0 ? Math.max(EDGE, Math.min(72, maxY)) : Math.min(Math.max(position.y, EDGE), maxY)
  return { x, y }
}

const outerHeight = (el: HTMLElement | null) => (el ? el.getBoundingClientRect().height : 0)

type ResizeEdge = 'top' | 'bottom'

/**
 * The floating Business Calculator. Like the Notes window it is a real window, not a
 * modal: the invoice or price list underneath stays live and readable, which is the
 * whole point of working a margin out while looking at it.
 */
export function CalculatorWindow() {
  const { isOpen, isMinimized, tab, openSeq } = useCalculatorState()
  const isPhone = useIsPhone()
  const pill = useFloatingPosition('calculator-pill', PILL_DEFAULT)
  const [position, setPosition] = useState<Position>(() => readPosition())
  const [sizes, setSizes] = useState<Sizes>(() => readSizes())
  /** The current tool's full height (title bar + tabs + content), measured live. */
  const [fitHeight, setFitHeight] = useState<number | null>(null)
  const [, setViewportTick] = useState(0)
  const windowRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const tabsRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; dx: number; dy: number } | null>(null)
  const resizeRef = useRef<{ pointerId: number; edge: ResizeEdge; startY: number; top: number; height: number } | null>(null)

  const isBasic = tab === 'basic'
  const sizeKey: keyof Sizes = isBasic ? 'basic' : 'tools'
  const isCustomHeight = isBasic ? sizes.basic !== BASIC_HEIGHT : sizes.tools != null

  // Ctrl/Cmd + Alt + C from anywhere, even mid-typing in an invoice field. Capture phase,
  // so a field that stops its keydown from bubbling can't swallow it.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isCalculatorShortcut(event)) return
      event.preventDefault()
      if (event.repeat) return
      toggleCalculator()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  // Position and height are derived from the viewport on every render, so a browser resize
  // or a banner appearing / being dismissed (they set CSS variables on <html>) only re-renders.
  useEffect(() => {
    if (!isOpen) return
    const onResize = () => setViewportTick((t) => t + 1)
    window.addEventListener('resize', onResize)
    const banners = new MutationObserver(onResize)
    banners.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
    return () => {
      window.removeEventListener('resize', onResize)
      banners.disconnect()
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && position.x >= 0) writeJson(POSITION_KEY, position)
  }, [isOpen, position])

  useEffect(() => {
    writeJson(SIZE_KEY, sizes)
  }, [sizes])

  // A new tool starts at the top, not wherever the last one was scrolled to.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
  }, [tab, openSeq])

  // Measure how tall the open tool really is, and keep measuring: results, hints and the
  // installment schedule change it while the person types. The content sits inside the
  // scrolling body, so its height never depends on the window's own height (no feedback loop).
  // Layout effect + ResizeObserver both land before paint, so a tool never flashes at the wrong size.
  useLayoutEffect(() => {
    if (!isOpen || isMinimized || isPhone || isBasic) return
    const measure = () => {
      const content = contentRef.current
      if (!content) return
      const natural = FRAME_BORDER + outerHeight(headerRef.current) + outerHeight(tabsRef.current) + BODY_PADDING + outerHeight(content)
      setFitHeight(Math.ceil(natural))
    }
    measure()
    const observer = new ResizeObserver(measure)
    for (const el of [contentRef.current, headerRef.current, tabsRef.current]) if (el) observer.observe(el)
    return () => observer.disconnect()
  }, [isOpen, isMinimized, isPhone, isBasic, tab])

  const max = maxHeight()
  const height = clampHeight(isBasic ? sizes.basic : (sizes.tools ?? fitHeight ?? BASIC_HEIGHT), max)
  const placed = clamp(position, height)

  const onDragStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isPhone || event.button !== 0) return
      if ((event.target as HTMLElement).closest('button')) return
      dragRef.current = { pointerId: event.pointerId, dx: event.clientX - placed.x, dy: event.clientY - placed.y }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [isPhone, placed.x, placed.y]
  )
  const onDragMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      event.preventDefault()
      setPosition(clamp({ x: event.clientX - drag.dx, y: event.clientY - drag.dy }, height))
    },
    [height]
  )
  const onDragEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }, [])

  /* ── Height resizing: drag the top or bottom edge, like any desktop window ── */

  const setHeight = useCallback((next: number) => setSizes((prev) => ({ ...prev, [sizeKey]: next })), [sizeKey])
  /** Back to the default: the keypad's standard height, or a tool fitted to its content. */
  const resetHeight = useCallback(() => setSizes((prev) => ({ ...prev, [sizeKey]: DEFAULT_SIZES[sizeKey] })), [sizeKey])

  const onResizeStart = (edge: ResizeEdge) => (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    resizeRef.current = { pointerId: event.pointerId, edge, startY: event.clientY, top: placed.y, height }
    // Pin the window where it is on screen now: if it had slid up to fit a tall tool, shrinking
    // it must not let it drop back to the old anchor mid-drag.
    setPosition(placed)
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onResizeMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    event.preventDefault()
    const dy = event.clientY - resize.startY
    if (resize.edge === 'bottom') {
      // The top stays put; the bottom edge follows the pointer down to the screen edge.
      setHeight(clampHeight(resize.height + dy, screenBottom() - resize.top - EDGE))
    } else {
      // The bottom stays put; the top edge (and the window with it) follows the pointer.
      const bottom = resize.top + resize.height
      const top = Math.min(Math.max(resize.top + dy, EDGE), bottom - MIN_HEIGHT)
      setHeight(bottom - top)
      setPosition({ x: placed.x, y: top })
    }
  }
  const onResizeEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (resizeRef.current?.pointerId !== event.pointerId) return
    resizeRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const onResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? RESIZE_STEP * 4 : RESIZE_STEP
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const next = height + (event.key === 'ArrowDown' ? step : -step)
      setHeight(clampHeight(next, screenBottom() - placed.y - EDGE))
    } else if (event.key === 'Enter' || event.key === 'Home') {
      event.preventDefault()
      resetHeight()
    }
  }
  const resizeHandle = (edge: ResizeEdge) => ({
    onPointerDown: onResizeStart(edge),
    onPointerMove: onResizeMove,
    onPointerUp: onResizeEnd,
    onPointerCancel: onResizeEnd,
    onDoubleClick: resetHeight,
  })
  const resetLabel = isBasic ? 'Reset to the standard height' : 'Fit height to the tool (no scrolling)'

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    // Events from portaled children still bubble here through the React tree.
    if (!windowRef.current?.contains(event.target as Node)) return
    event.stopPropagation()
    closeCalculator()
  }

  if (!isOpen) return null

  if (isMinimized) {
    return createPortal(
      <button
        type='button'
        onClick={() => openCalculator()}
        style={pill.style}
        {...pill.handlers}
        title='Open calculator — drag to move'
        className={cn(
          'flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-xs font-medium shadow-lg transition-transform hover:scale-105',
          pill.dragging && 'scale-105 shadow-2xl ring-2 ring-primary/40',
          WINDOW_LAYER
        )}
      >
        <Calculator className='size-4 text-primary' />
        Calculator
      </button>,
      document.body
    )
  }

  // On phones the window fills the screen down to the fixed notification / install banners.
  const frameStyle: React.CSSProperties = isPhone
    ? { top: 0, left: 0, right: 0, bottom: 'calc(var(--push-banner-height, 0px) + var(--pwa-banner-height, 0px))' }
    : { left: placed.x, top: placed.y, width: frameWidth(), height }

  return createPortal(
    <div
      ref={windowRef}
      role='dialog'
      aria-label='Business calculator'
      onKeyDown={onKeyDown}
      style={frameStyle}
      className={cn(
        'fixed flex flex-col overflow-hidden border bg-card text-card-foreground shadow-2xl',
        WINDOW_LAYER,
        isPhone ? 'rounded-none' : 'rounded-xl',
        // No `duration-*` here: it also sets transition-duration, and with the default
        // transition-property of `all` every height/top change (tab switch, drag, resize)
        // would lag 150ms behind. The enter animation already defaults to 150ms.
        'animate-in fade-in zoom-in-95'
      )}
    >
      {!isPhone && (
        <>
          {/* Thin grab strips on the top and bottom edges; the bottom one also shows a grip. */}
          <div
            {...resizeHandle('top')}
            aria-hidden
            title='Drag to resize · double-click to reset'
            className='absolute inset-x-3 top-0 z-10 h-1.5 cursor-ns-resize touch-none'
          />
          <div
            {...resizeHandle('bottom')}
            role='separator'
            aria-orientation='horizontal'
            aria-label={`Resize calculator height. Arrow keys to resize, Enter to ${isBasic ? 'reset' : 'fit to the tool'}`}
            aria-valuenow={height}
            aria-valuemin={MIN_HEIGHT}
            aria-valuemax={max}
            tabIndex={0}
            onKeyDown={onResizeKeyDown}
            title='Drag to resize · double-click to reset'
            className='group/resize absolute inset-x-0 bottom-0 z-10 flex h-2.5 cursor-ns-resize touch-none items-end justify-center pb-0.5 outline-none'
          >
            <span className='h-1 w-10 rounded-full bg-muted-foreground/25 transition-colors group-hover/resize:bg-primary/60 group-focus-visible/resize:bg-primary group-active/resize:bg-primary' />
          </div>
        </>
      )}

      <div
        ref={headerRef}
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        className={cn('flex shrink-0 select-none items-center gap-2 border-b bg-muted/60 px-3 py-2', !isPhone && 'cursor-grab active:cursor-grabbing')}
      >
        <Calculator className='size-4 text-primary' />
        <span className='text-xs font-semibold'>Business calculator</span>
        <span className='hidden text-[10px] text-muted-foreground sm:inline'>{CALCULATOR_SHORTCUT_LABEL}</span>
        <div className='ms-auto flex items-center gap-0.5'>
          {!isPhone && isCustomHeight && (
            <Button size='icon' variant='ghost' className='size-7' onClick={resetHeight} title={resetLabel} aria-label={resetLabel}>
              <UnfoldVertical className='size-4' />
            </Button>
          )}
          <Button size='icon' variant='ghost' className='size-7' onClick={minimizeCalculator} title='Minimize' aria-label='Minimize calculator'>
            <Minus className='size-4' />
          </Button>
          <Button
            size='icon'
            variant='ghost'
            className='size-7 hover:bg-destructive hover:text-white'
            onClick={closeCalculator}
            title='Close (Esc)'
            aria-label='Close calculator'
          >
            <X className='size-4' />
          </Button>
        </div>
      </div>

      {/* Every tool always on screen, no sideways scrolling: two full rows on a 12-column
          grid — four tools on top (3 columns each), three wider ones below (4 each). */}
      <div ref={tabsRef} role='tablist' aria-label='Calculator tools' className='grid shrink-0 grid-cols-12 gap-1 border-b bg-muted/30 p-1.5'>
        {TABS.map(({ key, label, icon: Icon }, index) => (
          <button
            key={key}
            type='button'
            role='tab'
            aria-selected={tab === key}
            onClick={() => setCalculatorTab(key)}
            className={cn(
              'flex min-w-0 items-center justify-center gap-1.5 rounded-md px-1.5 py-1.5 text-xs font-medium transition-colors',
              index < 4 ? 'col-span-3' : 'col-span-4',
              tab === key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-background hover:text-foreground'
            )}
          >
            <Icon className='size-3.5 shrink-0' />
            <span className='whitespace-nowrap'>{label}</span>
          </button>
        ))}
      </div>

      <div ref={bodyRef} className={cn('min-h-0 flex-1 p-3', isBasic ? 'flex flex-col' : 'overflow-y-auto overscroll-contain')}>
        {/* Tools stay mounted only while shown; their inputs persist via localStorage. */}
        {isBasic ? (
          <BasicCalculator />
        ) : (
          <div ref={contentRef}>
            {tab === 'margin' && <MarginMarkupTool />}
            {tab === 'discount' && <DiscountTool />}
            {tab === 'tax' && <TaxTool />}
            {tab === 'percent' && <PercentTool />}
            {tab === 'installment' && <InstallmentTool />}
            {tab === 'breakeven' && <BreakEvenTool />}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
