import { type ReactNode } from 'react'

export function RestaurantShell({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <>
      <div className='mb-6'>
        <h1 className='text-3xl font-bold tracking-tight'>{title}</h1>
        {description ? (
          <p className='text-muted-foreground mt-1'>{description}</p>
        ) : null}
      </div>
      {children}
    </>
  )
}
