import { Separator } from '@/components/ui/separator'

interface ContentSectionProps {
  title: string
  desc: string
  children: React.ReactNode
}

export default function ContentSection({
  title,
  desc,
  children,
}: ContentSectionProps) {
  return (
    <div className='flex flex-1 flex-col'>
      <div className='flex-none'>
        <h3 className='text-lg font-medium'>{title}</h3>
        <p className='text-muted-foreground text-sm'>{desc}</p>
      </div>
      <Separator className='my-4 flex-none' />
      {/* max-h-full (not h-full): caps this at the available panel height so a long page
          (Appearance) still scrolls internally, but a short page's content isn't stretched
          to fill the whole panel — that just left dead space below it.

          relative: this panel is the only scroll container the settings pages get, and the
          shell around it is locked to the viewport. An `absolute` descendant with no
          positioned ancestor (every `sr-only` form control is one) would otherwise be laid
          out against the viewport, escape this clip, and stretch the *document's* scroll
          area down to wherever it happens to sit — Appearance's hidden theme radios put it
          ~1100px below the fold, which read as a long scroll into blank white. Positioning
          this element makes it their containing block, so they get clipped like everything
          else in here. */}
      <div className='relative max-h-full w-full overflow-y-auto scroll-smooth pr-4 pb-6'>
        <div className='-mx-1 px-1.5 lg:max-w-xl'>{children}</div>
      </div>
    </div>
  )
}
