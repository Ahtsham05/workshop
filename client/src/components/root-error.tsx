import { useEffect } from 'react'
import type { ErrorComponentProps } from '@tanstack/react-router'
import GeneralError from '@/features/errors/general-error'

export function RootError({ error }: ErrorComponentProps) {
  useEffect(() => {
    if (error) {
      console.error('[router] startup error:', error)
    }
  }, [error])

  return <GeneralError minimal={false} />
}
