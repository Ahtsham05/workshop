/**
 * PortalShell — a clean, sidebar-free layout for school portal users
 * (students and parents). Renders a sticky top bar with the school identity
 * and a user menu (logout), then the portal page content below.
 */
import { ReactNode } from 'react'
import { LogOut, GraduationCap } from 'lucide-react'
import { useSelector } from 'react-redux'
import { RootState } from '@/stores/store'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { useLogout } from '@/hooks/use-logout'
import { NotificationBell } from '@/components/notification-bell'

function initials(name?: string): string {
  if (!name) return 'U'
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('')
}

export function PortalShell({ children }: { children: ReactNode }) {
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: org } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })
  const { logout } = useLogout()

  const schoolName = org?.name || 'School Portal'
  const portalLabel = user?.schoolRole === 'parent' ? 'Parent Portal' : 'Student Portal'

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b bg-white/80 backdrop-blur dark:bg-slate-950/80">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-3 min-w-0">
            {org?.logo?.url ? (
              <img
                src={org.logo.url}
                alt={schoolName}
                className="h-9 w-9 rounded-md object-contain border bg-white"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-600 text-white">
                <GraduationCap className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold leading-tight">{schoolName}</p>
              <p className="text-xs text-muted-foreground leading-tight">{portalLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
          <NotificationBell />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 px-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user?.photoUrl?.url} alt={user?.name} />
                  <AvatarFallback className="bg-blue-100 text-blue-700 text-xs font-semibold">
                    {initials(user?.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden sm:block max-w-[140px] truncate text-sm font-medium">
                  {user?.name || 'Student'}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col">
                  <span className="text-sm font-semibold truncate">{user?.name || 'Student'}</span>
                  <span className="text-xs text-muted-foreground truncate">{user?.email}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-red-600 focus:text-red-600">
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-5xl px-2 sm:px-4 py-4">{children}</main>
    </div>
  )
}
