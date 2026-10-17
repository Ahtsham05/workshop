import { FileText, Headphones, Image as ImageIcon, Images, Package, Paperclip, Video } from 'lucide-react'
import { cn } from '@/lib/utils'

// The server writes previews with a leading emoji ("📷 Photo", "🎥 Video", "📄 bill.pdf") so
// they also read well in notifications; on screen, WhatsApp shows a small grey icon instead.
const ICONS: [string, typeof ImageIcon][] = [
  ['📷', ImageIcon],
  ['🎥', Video],
  ['🎵', Headphones],
  ['📄', FileText],
  ['🖼️', Images],
  ['📎', Paperclip],
  ['📦', Package],
]

export function PreviewText({ text, className }: { text: string; className?: string }) {
  const hit = ICONS.find(([emoji]) => text.startsWith(`${emoji} `))
  if (!hit) return <span className={cn('truncate', className)}>{text}</span>
  const [emoji, Icon] = hit
  return (
    <span className={cn('flex min-w-0 items-center gap-1', className)}>
      <Icon className='size-3.5 shrink-0 opacity-80' aria-hidden />
      <span className='truncate'>{text.slice(emoji.length + 1)}</span>
    </span>
  )
}
