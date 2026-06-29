import { forwardRef } from 'react'
import { BarcodeSvg } from './barcode-svg'
import type { BarcodeItem } from '../types'

interface BarcodeSettings {
  columns: number
  showTitle: boolean
  showSubtitle: boolean
  showCode: boolean
  barHeight: number
  barWidth: number
}

interface BarcodePrintSheetProps {
  items: BarcodeItem[]
  settings: BarcodeSettings
}

export const BarcodePrintSheet = forwardRef<HTMLDivElement, BarcodePrintSheetProps>(
  ({ items, settings }, ref) => {
    // Flexbox (not CSS grid) — Chromium reliably paginates flex-wrap across
    // print pages, whereas grid rows can get clipped mid-row when printed.
    const itemWidth = `calc(${100 / settings.columns}% - 0.5rem)`
    return (
      <div ref={ref} className='bg-white p-4 text-black'>
        <div className='flex flex-wrap gap-3'>
          {items.map((item) => (
            <div
              key={item.id}
              className='flex flex-col items-center justify-center gap-1 rounded border border-gray-300 p-2 text-center'
              style={{ width: itemWidth, pageBreakInside: 'avoid', breakInside: 'avoid' }}
            >
              {settings.showTitle && (
                <div className='w-full truncate text-xs font-semibold'>{item.title}</div>
              )}
              {settings.showSubtitle && item.subtitle && (
                <div className='w-full truncate text-[10px] text-gray-600'>{item.subtitle}</div>
              )}
              <BarcodeSvg
                value={item.code}
                height={settings.barHeight}
                width={settings.barWidth}
                displayValue={settings.showCode}
                fontSize={10}
              />
            </div>
          ))}
        </div>
      </div>
    )
  }
)
BarcodePrintSheet.displayName = 'BarcodePrintSheet'
