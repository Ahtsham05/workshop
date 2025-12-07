import {
  // IconBrowserCheck,
  IconChecklist,
  // IconHelp,
  IconLayoutDashboard,
  IconLockAccess,
  // IconMessages,
  IconPackages,
  // IconPalette,
  // IconSettings,
  // IconTool,
  // IconUserCog,
  IconUsers,
  IconCategory,
  // IconRefresh,
} from '@tabler/icons-react'
import { AudioWaveform, Command, GalleryVerticalEnd } from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  user: {
    name: 'admin',
    email: 'admin@gmail.com',
    avatar: '/avatars/shadcn.jpg',
  },
  teams: [
    {
      name: '786 Engineering Works',
      logo: Command,
      plan: 'Admin Dashboard',
    },
  ],
  navGroups: [
    {
      title: 'General',
      items: [
        {
          title: 'Dashboard',
          url: '/',
          icon: IconLayoutDashboard,
        },
        // {
        //   title: 'Users',
        //   url: '/users',
        //   icon: IconUsers,
        // },
        {
          title: 'Suppliers',
          url: '/suppliers',
          icon: IconUsers,
        },
        {
          title: 'Customers',
          url: '/customers',
          icon: IconUsers,
        },
        {
          title: 'Categories',
          url: '/categories',
          icon: IconCategory,
        },
        {
          title: 'Products',
          url: '/products',
          icon: IconPackages,
        },
        {
          title: 'PURCHASES',
          url: '/purchase-invoice',
          icon: IconPackages,
        },
        {
          title: 'INVOICES',
          url: '/invoice',
          icon: IconPackages,
        },
        // {
        //   title: 'Returns',
        //   url: '/returns',
        //   icon: IconRefresh,
        // },
        {
          title: 'Accounts',
          url: '/accounting',
          icon: IconChecklist,
        },
        // {
        //   title: 'Chats',
        //   url: '/chats',
        //   badge: '3',
        //   icon: IconMessages,
        // },
      ],
    },
    {
      title: 'Reports',
      items: [
        {
          title: 'Reports',
          url: '/reports',
          icon: IconLockAccess,
        },
        // {
        //   title: 'Errors',
        //   icon: IconBug,
        //   items: [
        //     {
        //       title: 'Unauthorized',
        //       url: '/401',
        //       icon: IconLock,
        //     },
        //     {
        //       title: 'Forbidden',
        //       url: '/403',
        //       icon: IconUserOff,
        //     },
        //     {
        //       title: 'Not Found',
        //       url: '/404',
        //       icon: IconError404,
        //     },
        //     {
        //       title: 'Internal Server Error',
        //       url: '/500',
        //       icon: IconServerOff,
        //     },
        //     {
        //       title: 'Maintenance Error',
        //       url: '/503',
        //       icon: IconBarrierBlock,
        //     },
        //   ],
        // },
      ],
    },
    // {
    //   title: 'Other',
    //   items: [
    //     {
    //       title: 'Settings',
    //       icon: IconSettings,
    //       items: [
    //         {
    //           title: 'Profile',
    //           url: '/settings',
    //           icon: IconUserCog,
    //         },
    //         {
    //           title: 'Account',
    //           url: '/settings/account',
    //           icon: IconTool,
    //         },
    //         {
    //           title: 'Appearance',
    //           url: '/settings/appearance',
    //           icon: IconPalette,
    //         },
    //         {
    //           title: 'Notifications',
    //           url: '/settings/notifications',
    //           icon: IconNotification,
    //         },
    //         {
    //           title: 'Display',
    //           url: '/settings/display',
    //           icon: IconBrowserCheck,
    //         },
    //       ],
    //     },
    //     {
    //       title: 'Help Center',
    //       url: '/help-center',
    //       icon: IconHelp,
    //     },
    //   ],
    // },
  ],
}
