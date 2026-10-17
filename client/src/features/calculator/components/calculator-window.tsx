import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BadgePercent, Calculator, CalendarClock, Minus, Percent, Receipt, Scale, TrendingUp, X } from 'lucide-react'
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
const HEIGHT = 600
const EDGE = 8
const POSITION_KEY = 'calculator-window-v1'
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

function readPosition(): Position {
  try {
    const raw = localStorage.getItem(POSITION_KEY)
    const parsed = raw ? (JSON.parse(raw) as Position) : null
    if (parsed && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) return parsed
  } catch {
    /* ignore */
  }
  return { x: -1, y: -1 }
}

const size = () => ({
  width: Math.min(WIDTH, window.innerWidth - EDGE * 2),
  height: Math.min(HEIGHT, window.innerHeight - EDGE * 2),
})

/** Keeps the window on screen; -1 means "never placed" → bottom-right corner, clear of the header. */
function clamp(position: Position): Position {
  const { width, height } = size()
  const maxX = Math.max(EDGE, window.innerWidth - width - EDGE)
  const maxY = Math.max(EDGE, window.innerHeight - height - EDGE)
  const x = position.x < 0 ? maxX - 16 : Math.min(Math.max(position.x, EDGE), maxX)
  const y = position.y < 0 ? Math.max(EDGE, Math.min(72, maxY)) : Math.min(Math.max(position.y, EDGE), maxY)
  return { x, y }
}

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
  const windowRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; dx: number; dy: number } | null>(null)

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

  useEffect(() => {
    if (!isOpen) return
    setPosition((p) => clamp(p))
    const onResize = () => setPosition((p) => clamp(p))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || position.x < 0) return
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify(position))
    } catch {
      /* ignore */
    }
  }, [isOpen, position])

  // A new tool starts at the top, not wherever the last one was scrolled to.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
  }, [tab, openSeq])

  const onDragStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isPhone || event.button !== 0) return
      if ((event.target as HTMLElement).closest('button')) return
      dragRef.current = { pointerId: event.pointerId, dx: event.clientX - position.x, dy: event.clientY - position.y }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [isPhone, position.x, position.y]
  )
  const onDragMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    setPosition(clamp({ x: event.clientX - drag.dx, y: event.clientY - drag.dy }))
  }, [])
  const onDragEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }, [])

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

  const { width, height } = size()
  // On phones the window fills the screen down to the fixed notification / install banners.
  const frameStyle: React.CSSProperties = isPhone
    ? { top: 0, left: 0, right: 0, bottom: 'calc(var(--push-banner-height, 0px) + var(--pwa-banner-height, 0px))' }
    : { left: position.x, top: position.y, width, height }

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
        'animate-in fade-in zoom-in-95 duration-150'
      )}
    >
      <div
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        className={cn('flex select-none items-center gap-2 border-b bg-muted/60 px-3 py-2', !isPhone && 'cursor-grab active:cursor-grabbing')}
      >
        <Calculator className='size-4 text-primary' />
        <span className='text-xs font-semibold'>Business calculator</span>
        <span className='hidden text-[10px] text-muted-foreground sm:inline'>{CALCULATOR_SHORTCUT_LABEL}</span>
        <div className='ms-auto flex items-center gap-0.5'>
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
      <div role='tablist' aria-label='Calculator tools' className='grid shrink-0 grid-cols-12 gap-1 border-b bg-muted/30 p-1.5'>
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

      <div ref={bodyRef} className={cn('min-h-0 flex-1 p-3', tab === 'basic' ? 'flex flex-col' : 'overflow-y-auto')}>
        {/* Tools stay mounted only while shown; their inputs persist via localStorage. */}
        {tab === 'basic' && <BasicCalculator />}
        {tab === 'margin' && <MarginMarkupTool />}
        {tab === 'discount' && <DiscountTool />}
        {tab === 'tax' && <TaxTool />}
        {tab === 'percent' && <PercentTool />}
        {tab === 'installment' && <InstallmentTool />}
        {tab === 'breakeven' && <BreakEvenTool />}
      </div>
    </div>,
    document.body
  )
}
