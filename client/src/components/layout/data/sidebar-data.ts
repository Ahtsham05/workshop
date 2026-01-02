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
  IconShield,
  // IconRefresh,
  IconCalendar,
  IconCalendarEvent,
  IconCash,
  IconBuilding,
  IconSettings,
} from '@tabler/icons-react'
import { Command } from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  user: {
    name: 'admin',
    email: 'admin@gmail.com',
    avatar: '/avatars/shadcn.jpg',
  },
  teams: [
    {
      name: 'Jhulelal',
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
          permission: 'viewSuppliers',
        },
        {
          title: 'Customers',
          url: '/customers',
          icon: IconUsers,
          permission: 'viewCustomers',
        },
        {
          title: 'Categories',
          url: '/categories',
          icon: IconCategory,
          permission: 'viewCategories',
        },
        {
          title: 'Products',
          url: '/products',
          icon: IconPackages,
          permission: 'viewProducts',
        },
        {
          title: 'Purchases',
          url: '/purchase-invoice',
          icon: IconPackages,
          permission: 'viewPurchases',
        },
        {
          title: 'Invoices',
          url: '/invoice',
          icon: IconPackages,
          permission: 'viewInvoices',
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
          // No specific permission for accounting - will always show if user is authenticated
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
      title: 'Human Resources',
      items: [
        {
          title: 'HR Dashboard',
          url: '/hr',
          icon: IconLayoutDashboard,
        },
        {
          title: 'Employees',
          url: '/hr/employees',
          icon: IconUsers,
        },
        {
          title: 'Departments',
          url: '/hr/departments',
          icon: IconBuilding,
        },
        {
          title: 'Attendance',
          url: '/hr/attendance',
          icon: IconCalendar,
        },
        {
          title: 'Leave Management',
          url: '/hr/leaves',
          icon: IconCalendarEvent,
        },
        {
          title: 'Payroll',
          url: '/hr/payroll',
          icon: IconCash,
        },
        {
          title: 'HR Settings',
          url: '/hr/settings',
          icon: IconSettings,
        },
      ],
    },
    {
      title: 'Administration',
      items: [
        {
          title: 'Users Management',
          url: '/users-management',
          icon: IconUsers,
          permission: 'viewUsers',
        },
        {
          title: 'Roles & Permissions',
          url: '/roles',
          icon: IconShield,
          permission: 'viewRoles',
        },
      ],
    },
    {
      title: 'Reports',
      items: [
        {
          title: 'Reports',
          url: '/reports',
          icon: IconLockAccess,
          permission: 'viewReports',
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
