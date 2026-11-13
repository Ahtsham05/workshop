import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

/** Hides the print window's own toolbar and its on-screen "floating card" chrome, so the
 *  preview reads as the paper itself. */
const PREVIEW_CSS = `
  .no-print { display: none !important; }
  html, body { background: #fff !important; }
  @media screen {
    body { margin: 0 auto !important; box-shadow: none !important; border-radius: 0 !important; }
    #invoice-print-root, .invoice-print-page { box-shadow: none !important; margin-top: 0 !important; }
  }
`

function withPreviewStyles(html: string): string {
  const tag = `<style data-preview>${PREVIEW_CSS}</style>`
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${tag}</head>`) : `${tag}${html}`
}

/**
 * The real print HTML (same generator as Print) shown scaled to the screen width — what
 * Odoo shows after Confirm. Sandboxed without scripts, so the print window's auto-print
 * and bridges never run here; `allow-same-origin` only lets us measure the page height.
 */
export function PrintPreviewFrame({ html, baseWidth }: { html: string | null; baseWidth: number }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [doc, setDoc] = useState({ width: baseWidth, height: 900 })
  const [loaded, setLoaded] = useState(false)

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const update = () => setContainerWidth(el.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setLoaded(false)
    setDoc({ width: baseWidth, height: 900 })
  }, [html, baseWidth])

  const measure = () => {
    const d = frameRef.current?.contentDocument
    if (!d?.documentElement) return
    const width = Math.max(baseWidth, d.documentElement.scrollWidth)
    const height = Math.max(200, d.documentElement.scrollHeight)
    setDoc((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
  }

  const handleLoad = () => {
    setLoaded(true)
    measure()
    // Logo, web fonts and barcodes land after `load` on slow phones.
    setTimeout(measure, 350)
    setTimeout(measure, 1200)
  }

  const scale = containerWidth > 0 ? Math.min(1, containerWidth / doc.width) : 1

  return (
    <div ref={wrapRef} className='relative w-full overflow-hidden' style={{ height: Math.ceil(doc.height * scale) }}>
      {html ? (
        <iframe
          ref={frameRef}
          title='Invoice preview'
          sandbox='allow-same-origin'
          srcDoc={withPreviewStyles(html)}
          onLoad={handleLoad}
          scrolling='no'
          className='absolute top-0 border-0 bg-white'
          style={{
            width: doc.width,
            height: doc.height,
            left: Math.max(0, (containerWidth - doc.width * scale) / 2),
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            opacity: loaded ? 1 : 0,
            transition: 'opacity 150ms ease',
          }}
        />
      ) : null}
      {!loaded && (
        <div className='absolute inset-0 flex items-start justify-center bg-white pt-24 text-sm text-muted-foreground'>
          <Loader2 className='mr-2 h-4 w-4 animate-spin' />
          Loading preview…
        </div>
      )}
    </div>
  )
}
