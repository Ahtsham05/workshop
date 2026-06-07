import { LogOut } from 'lucide-react'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { NotificationBell } from '@/components/notification-bell'
import { useLogout } from '@/hooks/use-logout'
import { useLanguage } from '@/context/language-context'

export function SchoolTeacherMobileHeader() {
  const { logout } = useLogout()
  const { t } = useLanguage()

  return (
    <header className="md:hidden sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <SidebarTrigger variant="outline" className="scale-110" />
      <span className="flex-1 truncate text-sm font-semibold">
        {t('employee_portal') || 'Teacher Portal'}
      </span>
      <NotificationBell />
      <Button
        variant="ghost"
        size="sm"
        onClick={logout}
        className="shrink-0 text-red-600 hover:bg-red-50 hover:text-red-600"
      >
        <LogOut className="h-4 w-4" />
        <span className="ml-1.5">{t('log_out') || 'Log out'}</span>
      </Button>
    </header>
  )
}
