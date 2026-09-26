import type { JSX } from 'react'
import { Outlet } from '@tanstack/react-router'
import {
  IconCloudDownload,
  IconRefresh,
  IconGitMerge,
  IconDatabase,
  IconArchive,
  IconDatabaseCog,
  IconBrandWhatsapp,
  IconDeviceMobile,
  IconPrinter,
  IconBuilding,
  IconWorld,
  IconCurrencyDollar,
  IconReceiptTax,
  IconShieldCheck,
  IconArrowsExchange,
  IconMapPin,
  IconFlask,
  IconListNumbers,
  IconPalette,
  IconTextSize,
  IconCreditCard,
} from '@tabler/icons-react'
import { Separator } from '@/components/ui/separator'
import SidebarNav, { type SettingsNavGroup } from './components/sidebar-nav'
import { WHATSAPP_UI_ENABLED } from '@/config/whatsapp-ui'
import { isElectronApp } from '@/lib/sync/electron'
import { usePermissions } from '@/context/permission-context'
import type { PermissionKey } from '@/lib/permission-registry'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'

export default function Settings() {
  const { hasAnyPermission } = usePermissions()
  const { data: organization } = useGetMyOrganizationQuery()
  const isTrial = Boolean(organization?.subscription?.isTrial)
  const isVisible = (item: SettingsNavItem) => {
    if (!WHATSAPP_UI_ENABLED && item.href === '/settings/whatsapp') return false
    if (item.desktopOnly && !isElectronApp()) return false
    if (item.anyPermission && !hasAnyPermission(...item.anyPermission)) return false
    if (item.trialOnly && !isTrial) return false
    return true
  }

  // A group whose every page is hidden (no permission, web build, not on trial)
  // must not leave an empty heading behind.
  const navGroups: SettingsNavGroup[] = sidebarNavGroups
    .map((group) => ({ ...group, items: group.items.filter(isVisible) }))
    .filter((group) => group.items.length > 0)

  return (
    <div className='-my-6 flex h-[calc(100vh-4rem)] flex-col overflow-hidden'>
      <div className='shrink-0 space-y-0.5 pt-6'>
        <h1 className='text-2xl font-bold tracking-tight md:text-3xl'>
          Settings
        </h1>
        <p className='text-muted-foreground'>
          Manage your app settings and integrations.
        </p>
      </div>
      <Separator className='my-4 shrink-0 lg:my-6' />
      <div className='flex min-h-0 flex-1 flex-col space-y-2 overflow-hidden pb-6 md:space-y-2 lg:flex-row lg:space-y-0 lg:space-x-12'>
        <aside className='min-h-0 shrink-0 lg:w-1/5'>
          <SidebarNav groups={navGroups} />
        </aside>
        <div className='flex w-full min-h-0 flex-1 overflow-hidden p-1'>
          <Outlet />
        </div>
      </div>
    </div>
  )
}

interface SettingsNavItem {
  title: string
  icon: JSX.Element
  href: string
  desktopOnly?: boolean
  anyPermission?: PermissionKey[]
  trialOnly?: boolean
}

const sidebarNavGroups: { label: string; items: SettingsNavItem[] }[] = [
  {
    label: 'Personal',
    items: [
      {
        title: 'Appearance',
        icon: <IconPalette size={18} />,
        href: '/settings/appearance',
      },
      {
        title: 'Display',
        icon: <IconTextSize size={18} />,
        href: '/settings/display',
      },
    ],
  },
  {
    label: 'Business',
    items: [
      {
        title: 'Billing & Plan',
        icon: <IconCreditCard size={18} />,
        href: '/settings/billing',
      },
      {
        title: 'Business Profile',
        icon: <IconBuilding size={18} />,
        href: '/settings/business-profile',
        anyPermission: ['viewBusinessProfile'],
      },
      {
        title: 'Document Numbering',
        icon: <IconListNumbers size={18} />,
        href: '/settings/document-numbering',
        anyPermission: ['viewLocalizationSettings'],
      },
      {
        title: 'Localization',
        icon: <IconWorld size={18} />,
        href: '/settings/localization',
        anyPermission: ['viewLocalizationSettings'],
      },
      {
        title: 'Currency',
        icon: <IconCurrencyDollar size={18} />,
        href: '/settings/currency',
        anyPermission: ['viewLocalizationSettings'],
      },
      {
        title: 'Exchange Rates',
        icon: <IconArrowsExchange size={18} />,
        href: '/settings/exchange-rates',
        anyPermission: ['viewExchangeRates'],
      },
    ],
  },
  {
    label: 'Tax',
    items: [
      {
        title: 'Tax Categories',
        icon: <IconReceiptTax size={18} />,
        href: '/settings/tax-categories',
        anyPermission: ['viewTaxCategories'],
      },
      {
        title: 'Tax Rates',
        icon: <IconReceiptTax size={18} />,
        href: '/settings/tax-rates',
        anyPermission: ['viewTaxRates'],
      },
      {
        title: 'Tax Jurisdictions',
        icon: <IconMapPin size={18} />,
        href: '/settings/tax-jurisdictions',
        anyPermission: ['viewTaxJurisdictions'],
      },
      {
        title: 'Tax Exemptions',
        icon: <IconShieldCheck size={18} />,
        href: '/settings/tax-exemptions',
        anyPermission: ['viewTaxExemptions'],
      },
    ],
  },
  {
    label: 'Connections',
    items: [
      {
        title: 'WhatsApp',
        icon: <IconBrandWhatsapp size={18} />,
        href: '/settings/whatsapp',
      },
      {
        title: 'SMS Gateway',
        icon: <IconDeviceMobile size={18} />,
        href: '/settings/sms-gateway',
      },
      {
        title: 'Printing',
        icon: <IconPrinter size={18} />,
        href: '/settings/printing',
      },
    ],
  },
  {
    label: 'Data & Offline',
    items: [
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
        title: 'Demo Data',
        icon: <IconFlask size={18} />,
        href: '/settings/demo-data',
        trialOnly: true,
      },
    ],
  },
]
