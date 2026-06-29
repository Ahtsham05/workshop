import { useEffect, useRef, useState } from 'react'
import JsBarcode from 'jsbarcode'

interface BarcodeSvgProps {
  value: string
  height?: number
  width?: number
  fontSize?: number
  displayValue?: boolean
  className?: string
}

export function BarcodeSvg({
  value,
  height = 50,
  width = 2,
  fontSize = 12,
  displayValue = true,
  className,
}: BarcodeSvgProps) {
  const ref = useRef<SVGSVGElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!ref.current || !value) return
    try {
      JsBarcode(ref.current, value, {
        format: 'CODE128',
        width,
        height,
        displayValue,
        fontSize,
        margin: 6,
        background: '#ffffff',
        lineColor: '#000000',
        textMargin: 2,
      })
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [value, height, width, fontSize, displayValue])

  if (!value) {
    return <div className='text-xs text-muted-foreground'>No code</div>
  }

  return (
    <div className={className}>
      <svg ref={ref} />
      {failed && <div className='text-xs text-destructive'>Invalid barcode value</div>}
    </div>
  )
}
