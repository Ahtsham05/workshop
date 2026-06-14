import { Outlet } from '@tanstack/react-router'
import {
  IconBrowserCheck,
  IconCloudDownload,
  IconNotification,
  IconPalette,
  IconRefresh,
  IconGitMerge,
  IconDatabase,
  IconArchive,
  IconDatabaseCog,
  IconTool,
  IconUser,
  IconBrandWhatsapp,
} from '@tabler/icons-react'
import { Separator } from '@/components/ui/separator'
import SidebarNav from './components/sidebar-nav'
import { WHATSAPP_UI_ENABLED } from '@/config/whatsapp-ui'
import { isElectronApp } from '@/lib/sync/electron'

export default function Settings() {
  const navItems = sidebarNavItems.filter((item) => {
    if (!WHATSAPP_UI_ENABLED && item.href === '/settings/whatsapp') return false
    if (item.desktopOnly && !isElectronApp()) return false
    return true
  })

  return (
    <>
        <div className='space-y-0.5'>
          <h1 className='text-2xl font-bold tracking-tight md:text-3xl'>
            Settings
          </h1>
          <p className='text-muted-foreground'>
            Manage your account settings and set e-mail preferences.
          </p>
        </div>
        <Separator className='my-4 lg:my-6' />
        <div className='flex flex-1 flex-col space-y-2 overflow-hidden md:space-y-2 lg:flex-row lg:space-y-0 lg:space-x-12'>
          <aside className='top-0 lg:sticky lg:w-1/5'>
            <SidebarNav items={navItems} />
          </aside>
          <div className='flex w-full overflow-y-hidden p-1'>
            <Outlet />
          </div>
        </div>
    </>
  )
}

const sidebarNavItems = [
  {
    title: 'Profile',
    icon: <IconUser size={18} />,
    href: '/settings',
  },
  {
    title: 'Account',
    icon: <IconTool size={18} />,
    href: '/settings/account',
  },
  {
    title: 'Appearance',
    icon: <IconPalette size={18} />,
    href: '/settings/appearance',
  },
  {
    title: 'Notifications',
    icon: <IconNotification size={18} />,
    href: '/settings/notifications',
  },
  {
    title: 'Display',
    icon: <IconBrowserCheck size={18} />,
    href: '/settings/display',
  },
  {
    title: 'Offline Mode',
    icon: <IconCloudDownload size={18} />,
    href: '/settings/offline',
    desktopOnly: true,
  },
  {
    title: 'Synchronization',
    icon: <IconRefresh size={18} />,
    href: '/settings/sync',
    desktopOnly: true,
  },
  {
    title: 'Sync Conflicts',
    icon: <IconGitMerge size={18} />,
    href: '/settings/sync-conflicts',
    desktopOnly: true,
  },
  {
    title: 'Local Database',
    icon: <IconDatabase size={18} />,
    href: '/settings/local-database',
    desktopOnly: true,
  },
  {
    title: 'Backup & Restore',
    icon: <IconArchive size={18} />,
    href: '/settings/backup',
    desktopOnly: true,
  },
  {
    title: 'Cache Management',
    icon: <IconDatabaseCog size={18} />,
    href: '/settings/cache',
    desktopOnly: true,
  },
  {
    title: 'WhatsApp',
    icon: <IconBrandWhatsapp size={18} />,
    href: '/settings/whatsapp',
  },
]
