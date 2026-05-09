'use client'

import { useState } from 'react'
import LongText from '@/components/long-text'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useLanguage } from '@/context/language-context'
import { getTextClasses, getUrduSecondaryNameClasses } from '@/utils/urdu-text-utils'
import { cn } from '@/lib/utils'
import { User } from 'lucide-react'
import type { ContactPicture } from '@/components/contact-photo-cell'

function initialsFromName(name: string): string {
  const trimmed = String(name ?? '').trim()
  if (!trimmed) return ''
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    const a = parts[0]?.[0]
    const b = parts[parts.length - 1]?.[0]
    if (a && b) return `${a}${b}`.toUpperCase()
  }
  return trimmed.slice(0, 2).toUpperCase()
}

export interface ContactMediaNameCellProps {
  name: string
  nameUrdu?: string | null
  picture?: ContactPicture
  idCardFront?: ContactPicture
  idCardBack?: ContactPicture
  /** When false, names use default styling (e.g. ledger table). */
  compact?: boolean
}

export function ContactMediaNameCell({
  name,
  nameUrdu,
  picture,
  idCardFront,
  idCardBack,
  compact = false,
}: ContactMediaNameCellProps) {
  const { t } = useLanguage()
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null)

  const profileUrl = picture?.url?.trim()
  const frontUrl = idCardFront?.url?.trim()
  const backUrl = idCardBack?.url?.trim()
  const initials = initialsFromName(name)

  const profileInner = profileUrl ? (
    <img src={profileUrl} alt='' className='h-8 w-8 rounded-full object-cover' />
  ) : (
    <div className='flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-muted to-muted/70 text-[10px] font-semibold text-muted-foreground'>
      {initials || <User className='h-3.5 w-3.5 opacity-70' aria-hidden />}
    </div>
  )

  const openPreview = (url: string, title: string) => {
    setPreview({ url, title })
  }

  const idThumbs =
    frontUrl || backUrl ? (
      <div
        className='flex shrink-0 items-center gap-1.5 border-l border-border/60 pl-2 sm:pl-2.5'
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <span className='whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-muted-foreground'>
          {t('id_short')}:
        </span>
        <div className='flex items-center gap-1'>
          {frontUrl ? (
            <button
              type='button'
              className='overflow-hidden rounded-md ring-1 ring-border transition hover:ring-primary/50'
              aria-label={t('id_card_front')}
              onClick={(e) => {
                e.stopPropagation()
                openPreview(frontUrl, t('id_card_front'))
              }}
            >
              <img src={frontUrl} alt='' className='h-6 w-9 object-cover sm:h-7 sm:w-10' />
            </button>
          ) : null}
          {backUrl ? (
            <button
              type='button'
              className='overflow-hidden rounded-md ring-1 ring-border transition hover:ring-primary/50'
              aria-label={t('id_card_back')}
              onClick={(e) => {
                e.stopPropagation()
                openPreview(backUrl, t('id_card_back'))
              }}
            >
              <img src={backUrl} alt='' className='h-6 w-9 object-cover sm:h-7 sm:w-10' />
            </button>
          ) : null}
        </div>
      </div>
    ) : null

  return (
    <>
      <div className='flex min-w-0 flex-nowrap items-center gap-2 sm:gap-2.5'>
        {profileUrl ? (
          <button
            type='button'
            className={cn(
              'shrink-0 rounded-full ring-offset-background transition hover:ring-2 hover:ring-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            )}
            aria-label={t('view_full_photo')}
            onClick={(e) => {
              e.stopPropagation()
              openPreview(profileUrl, t('profile_picture'))
            }}
          >
            {profileInner}
          </button>
        ) : (
          <div className='shrink-0'>{profileInner}</div>
        )}

        <div className='min-w-0 flex-1'>
          <div className={cn('flex min-w-0 items-center', compact ? 'gap-1.5' : 'gap-2')}>
            <div className='flex min-w-0 flex-1 flex-row flex-wrap items-center gap-x-2 gap-y-0.5'>
              <LongText
                className={getTextClasses(name, 'max-w-none shrink-0 font-medium')}
              >
                {name}
              </LongText>
              {nameUrdu ? (
                <span
                  className={cn('min-w-0 truncate', getUrduSecondaryNameClasses(nameUrdu))}
                  dir='rtl'
                >
                  {nameUrdu}
                </span>
              ) : null}
            </div>
            {idThumbs}
          </div>
        </div>
      </div>

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent
          className='max-w-[min(96vw,56rem)] border-none bg-transparent p-0 shadow-none sm:max-w-[min(96vw,56rem)]'
        >
          <DialogHeader className='sr-only'>
            <DialogTitle>{preview?.title ?? ''}</DialogTitle>
          </DialogHeader>
          {preview ? (
            <div className='rounded-xl bg-background/95 p-2 shadow-2xl ring-1 ring-border'>
              <p className='mb-2 px-1 text-center text-sm font-medium text-foreground'>{preview.title}</p>
              <img
                src={preview.url}
                alt=''
                className='max-h-[min(78vh,720px)] w-full rounded-lg object-contain'
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
