import { useLanguage } from '@/context/language-context'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/i18n'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

export function LanguageSettings() {
  const { language, setLanguage } = useLanguage()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span>Language</span>
          <span className="text-muted-foreground font-normal text-sm">/ زبان / اللغة / भाषा</span>
        </CardTitle>
        <CardDescription>
          Choose your preferred display language for the entire application.
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SUPPORTED_LANGUAGES.map((lang) => {
            const isActive = language === lang.code
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => setLanguage(lang.code as SupportedLanguage)}
                className={cn(
                  'relative flex flex-col items-center gap-2 rounded-xl border-2 bg-popover p-4 text-center transition-all hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-muted'
                )}
              >
                {/* Active checkmark */}
                {isActive && (
                  <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3 w-3" />
                  </span>
                )}

                {/* Flag */}
                <span className="text-3xl leading-none">{lang.flag}</span>

                {/* Native name */}
                <span
                  className={cn(
                    'text-base font-semibold leading-snug',
                    isActive && 'text-primary'
                  )}
                >
                  {lang.nativeName}
                </span>

                {/* English name */}
                <span className="text-xs text-muted-foreground">{lang.name}</span>

                {/* Direction badge */}
                {lang.dir === 'rtl' && (
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                    RTL
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Current language info */}
        <p className="mt-4 text-xs text-muted-foreground">
          Currently selected:{' '}
          <span className="font-medium text-foreground">
            {SUPPORTED_LANGUAGES.find((l) => l.code === language)?.name}
          </span>
          {SUPPORTED_LANGUAGES.find((l) => l.code === language)?.dir === 'rtl' && (
            <> — Right-to-left layout is active.</>
          )}
        </p>
      </CardContent>
    </Card>
  )
}
