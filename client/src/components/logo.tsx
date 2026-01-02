import { useTheme } from '@/context/theme-context'
import { useEffect, useState } from 'react'

interface LogoProps {
  className?: string
  width?: number
  height?: number
}

export function Logo({ className = '', width = 120, height = 80 }: LogoProps) {
  const { theme } = useTheme()
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    // Check actual theme including system preference
    if (theme === 'dark') {
      setIsDark(true)
    } else if (theme === 'light') {
      setIsDark(false)
    } else {
      // System theme
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
      setIsDark(systemTheme)
    }
  }, [theme])

  return (
    <img
      src={isDark ? '/images/logo-dark.png' : '/images/logo-light.png'}
      alt="Jhulelal"
      className={`${className} transition-opacity duration-200`}
      style={{
        width: width ? `${width}px` : 'auto',
        height: height ? `${height}px` : 'auto',
        objectFit: 'contain'
      }}
      loading="eager"
    />
  )
}

export function LogoIcon({ className = '', size = 32 }: { className?: string; size?: number }) {
  const { theme } = useTheme()
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    // Check actual theme including system preference
    if (theme === 'dark') {
      setIsDark(true)
    } else if (theme === 'light') {
      setIsDark(false)
    } else {
      // System theme
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
      setIsDark(systemTheme)
    }
  }, [theme])

  return (
    <img
      src={isDark ? '/images/logo-dark.png' : '/images/logo-light.png'}
      alt="786"
      className={`${className} transition-opacity duration-200`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        objectFit: 'contain'
      }}
      loading="eager"
    />
  )
}
