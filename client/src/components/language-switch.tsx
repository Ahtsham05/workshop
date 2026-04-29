import { useEffect, useState } from 'react'
import { useLanguage } from '@/context/language-context'
import { Button } from '@/components/ui/button'
import { Check, Globe, Loader2, RefreshCw } from 'lucide-react'
import {
  SUPPORTED_LANGUAGES,
  subscribeToTranslations,
  getInflightCount,
  retryFailures,
  rescanDomTranslator,
  type SupportedLanguage,
} from '@/i18n'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

/**
 * Reactive hook that returns the number of in-flight auto-translation requests.
 * Powers the spinner in the LanguageSwitch.
 */
function useInflightTranslations() {
  const [count, setCount] = useState(getInflightCount)
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>
    const update = () => setCount(getInflightCount())
    update()
    // Poll every 250 ms while there are in-flight requests, also subscribe to
    // updates so we tick down promptly when each completes.
    timer = setInterval(update, 250)
    const unsub = subscribeToTranslations(update)
    return () => {
      clearInterval(timer)
      unsub()
    }
  }, [])
  return count
}

export function LanguageSwitch() {
  const { language, setLanguage } = useLanguage()
  const inflight = useInflightTranslations()
  const isTranslating = inflight > 0

  const current = SUPPORTED_LANGUAGES.find((l) => l.code === language)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative h-9 gap-1.5 px-2.5 text-sm font-medium"
          aria-label="Switch language"
        >
          {isTranslating ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
          ) : (
            <Globe className="h-4 w-4 shrink-0" />
          )}
          <span className="hidden sm:inline">{current?.nativeName ?? 'Language'}</span>
          <span className="sm:hidden">{current?.flag}</span>
          {isTranslating && (
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Globe className="h-3.5 w-3.5" />
          Language
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {SUPPORTED_LANGUAGES.map((lang) => {
          const isActive = language === lang.code
          return (
            <DropdownMenuItem
              key={lang.code}
              onClick={() => setLanguage(lang.code as SupportedLanguage)}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2.5 transition-colors',
                isActive && 'bg-accent font-medium'
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xl leading-none shrink-0">{lang.flag}</span>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm leading-snug truncate">{lang.nativeName}</span>
                  <span className="text-xs text-muted-foreground leading-snug">
                    {lang.name}
                    {lang.dir === 'rtl' && <span className="ml-1.5 rounded bg-orange-100 px-1 text-[9px] font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">RTL</span>}
                  </span>
                </div>
              </div>
              {isActive && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </DropdownMenuItem>
          )
        })}

        {isTranslating && (
          <>
            <DropdownMenuSeparator />
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Translating {inflight} phrase{inflight === 1 ? '' : 's'}…
            </div>
          </>
        )}

        {language !== 'en' && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault()
                retryFailures()
                rescanDomTranslator()
              }}
              className="cursor-pointer gap-2 text-xs text-muted-foreground"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Re-translate page
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
