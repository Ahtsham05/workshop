import { ReactNode } from 'react'
import { useLanguage } from '@/context/language-context'

interface NoTranslateProps {
  children: ReactNode
  className?: string
}

/**
 * Component that prevents Google Translate from translating its content
 * Automatically applies translation prevention attributes when language is Urdu
 */
export function NoTranslate({ children, className = '' }: NoTranslateProps) {
  const { language } = useLanguage()
  
  // Only apply notranslate attributes when language is Urdu
  if (language === 'ur') {
    return (
      <span 
        className={`notranslate ${className}`}
        translate="no"
        lang="ur"
      >
        {children}
      </span>
    )
  }
  
  // For English, just return the children without any wrapper
  return <>{children}</>
}
