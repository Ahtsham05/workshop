import { useEffect, useState } from 'react'
import { WHATSAPP_UI_ENABLED } from '@/config/whatsapp-ui'
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/i18n'
import {
  ArrowLeftRight,
  Calculator,
  Camera,
  Check,
  ChevronDown,
  Globe,
  MessageCircle,
  Search as SearchIcon,
  Video,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { useSearch } from '@/context/search-context'
import { useWhatsAppOptional } from '@/context/whatsapp-context'
import {
  RECORD_SHORTCUT,
  SCREENSHOT_SHORTCUT,
  type useScreenCapture,
} from '@/hooks/use-screen-capture'
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from '@/components/ui/dropdown-menu'
import { openCalculator } from '@/features/calculator/lib/calculator-store'
import { useQuickTransfer } from '@/features/stock-transfer/context/quick-transfer-context'

/**
 * The header shortcuts that are hidden for lack of room, offered in the profile menu
 * instead: below 640px search, WhatsApp, calculator, stock transfer and language; the
 * camera whenever the header itself has hidden it (it goes by the header's width, which
 * the sidebar changes too — so that one is measured, not guessed from the viewport).
 */
export function HeaderShortcutsMenu({
  capture,
}: {
  /** The header's one screen-capture state (its keyboard shortcuts must exist only once). */
  capture: ReturnType<typeof useScreenCapture>
}) {
  const { t, language, setLanguage } = useLanguage()
  const { setOpen: openSearch } = useSearch()
  const whatsapp = useWhatsAppOptional()
  const quickTransfer = useQuickTransfer()
  const cameraHidden = useHeaderShortcutHidden('capture')
  const current = SUPPORTED_LANGUAGES.find((l) => l.code === language)
  const [languagesOpen, setLanguagesOpen] = useState(false)

  // Phone-only rows share one class; the camera rows follow the measurement instead.
  const phone = 'sm:hidden'
  const showCamera = cameraHidden && capture.recordingStartedAt === null

  return (
    <>
      <DropdownMenuSeparator className={cn(!showCamera && phone)} />
      <DropdownMenuLabel
        className={cn(
          'text-muted-foreground px-2 py-1 text-xs font-normal',
          !showCamera && phone
        )}
      >
        {t('Shortcuts')}
      </DropdownMenuLabel>
      <DropdownMenuGroup>
        <DropdownMenuItem className={phone} onClick={() => openSearch(true)}>
          <SearchIcon className='mr-2 h-4 w-4' />
          <span>{t('Search')}</span>
          <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
        </DropdownMenuItem>
        {WHATSAPP_UI_ENABLED && whatsapp && (
          <DropdownMenuItem
            className={phone}
            onClick={whatsapp.openConnectionDialog}
          >
            <MessageCircle className='mr-2 h-4 w-4' />
            <span>WhatsApp</span>
            {whatsapp.isReady && (
              <span className='ml-auto h-2 w-2 rounded-full bg-[#25D366]' />
            )}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className={phone} onClick={() => openCalculator()}>
          <Calculator className='mr-2 h-4 w-4' />
          <span>{t('Calculator')}</span>
        </DropdownMenuItem>
        {quickTransfer?.canTransfer && (
          <DropdownMenuItem
            className={phone}
            onClick={() => quickTransfer.openQuickTransfer()}
          >
            <ArrowLeftRight className='mr-2 h-4 w-4' />
            <span>{t('New stock transfer')}</span>
          </DropdownMenuItem>
        )}
        {showCamera && (
          <DropdownMenuItem onSelect={() => void capture.takeScreenshot()}>
            <Camera className='mr-2 h-4 w-4' />
            <span>{t('Take screenshot')}</span>
            <DropdownMenuShortcut className='hidden sm:inline'>
              {SCREENSHOT_SHORTCUT}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        )}
        {showCamera && capture.canRecord && (
          <DropdownMenuItem onSelect={() => void capture.startRecording()}>
            <Video className='mr-2 h-4 w-4' />
            <span>{t('Record screen')}</span>
            <DropdownMenuShortcut className='hidden sm:inline'>
              {RECORD_SHORTCUT}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        )}
        {/* Languages open inside the menu (a side sub-menu runs off a phone screen). */}
        <DropdownMenuItem
          className={phone}
          aria-expanded={languagesOpen}
          onSelect={(event) => {
            event.preventDefault()
            setLanguagesOpen((open) => !open)
          }}
        >
          <Globe className='mr-2 h-4 w-4' />
          <span>{t('Language')}</span>
          <span className='text-muted-foreground ml-auto pl-2 text-xs'>
            {current?.flag} {current?.nativeName}
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 transition-transform',
              languagesOpen && 'rotate-180'
            )}
          />
        </DropdownMenuItem>
        {languagesOpen &&
          SUPPORTED_LANGUAGES.map((lang) => (
            <DropdownMenuItem
              key={lang.code}
              className={cn(
                phone,
                'pl-8',
                language === lang.code && 'font-medium'
              )}
              onClick={() => setLanguage(lang.code as SupportedLanguage)}
            >
              <span className='mr-2 text-base leading-none'>{lang.flag}</span>
              <span className='truncate'>{lang.nativeName}</span>
              {language === lang.code && <Check className='ml-auto h-4 w-4' />}
            </DropdownMenuItem>
          ))}
      </DropdownMenuGroup>
    </>
  )
}

/**
 * Whether a header shortcut (marked `data-header-shortcut="<name>"`) is hidden right now —
 * re-checked whenever the header changes size (window resize, sidebar opened or closed).
 */
function useHeaderShortcutHidden(name: string) {
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    // Looked up on every check: the button unmounts while a recording runs.
    const find = () =>
      document.querySelector<HTMLElement>(`[data-header-shortcut="${name}"]`)
    const check = () => {
      const el = find()
      setHidden(!el || el.getClientRects().length === 0)
    }
    check()
    const header =
      find()?.closest('header') ||
      document.querySelector('header') ||
      document.body
    const observer = new ResizeObserver(check)
    observer.observe(header)
    return () => observer.disconnect()
  }, [name])
  return hidden
}
