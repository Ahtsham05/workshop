import * as React from 'react'
import { Link } from '@tanstack/react-router'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'

/** Up to two initials for the monogram shown when the business has no logo (or it fails to load). */
function initialsOf(name: string) {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

/**
 * Sidebar header for businesses that brand the app as their own (wholesalers /
 * distributors): their logo and business name instead of the Logix Plus product mark.
 * Clicking it goes to the dashboard, like a site logo.
 */
export function BusinessBrand({
  name,
  logoUrl,
  tagline,
}: {
  name: string
  logoUrl?: string
  tagline?: string
}) {
  const [logoFailed, setLogoFailed] = React.useState(false)
  React.useEffect(() => setLogoFailed(false), [logoUrl])
  const showLogo = !!logoUrl && !logoFailed

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size='lg' tooltip={name} asChild className='h-auto min-h-12 py-2 group-data-[collapsible=icon]:min-h-0'>
          <Link to='/' aria-label={`${name} — dashboard`}>
            {showLogo ? (
              <div className='flex aspect-square size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-0.5 shadow-sm ring-1 ring-black/10 group-data-[collapsible=icon]:size-8'>
                <img
                  src={logoUrl}
                  alt={`${name} logo`}
                  className='size-full object-contain'
                  onError={() => setLogoFailed(true)}
                />
              </div>
            ) : (
              <div className='bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold tracking-wide shadow-sm group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:text-xs'>
                {initialsOf(name)}
              </div>
            )}
            <div className='grid min-w-0 flex-1 text-left leading-tight'>
              <span className='line-clamp-2 text-sm font-semibold break-words' title={name}>
                {name}
              </span>
              {tagline && (
                <span className='truncate text-xs text-sidebar-foreground/65'>
                  {tagline}
                </span>
              )}
            </div>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
