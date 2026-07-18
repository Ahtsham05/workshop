import { createFileRoute, Link } from '@tanstack/react-router'
import { Phone, Send, Inbox, CheckCheck, BadgeCheck, AlertCircle, MessagesSquare, ListOrdered } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useGetAnalyticsOverviewQuery, useGetCloudConnectionQuery } from '@/stores/whatsappCloud.api'
import { ConversationFunnelWidget } from '@/features/whatsapp/analytics/conversation-funnel-widget'
import { LiveActivityFeed } from '@/features/whatsapp/analytics/live-activity-feed'
import { ExpiringWindowsCard } from '@/features/whatsapp/analytics/expiring-windows-card'
import { StatTile } from '@/features/whatsapp/analytics/stat-tile'

function WhatsAppDashboardPage() {
  const { data: connection } = useGetCloudConnectionQuery()
  const { data: analytics } = useGetAnalyticsOverviewQuery()

  return (
    <div className='space-y-6 p-6'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='text-2xl font-semibold'>WhatsApp Analytics</h1>
          <p className='text-sm text-muted-foreground'>How your shared WhatsApp inbox is performing.</p>
        </div>
        <Button variant='outline' asChild>
          <Link to='/whatsapp/messages'>
            <ListOrdered className='h-4 w-4' />
            Message Log
          </Link>
        </Button>
      </div>

      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        <StatTile
          icon={<Phone className='h-5 w-5' />}
          label='Connected Number'
          value={<span className='text-lg'>{connection?.displayPhoneNumber || '—'}</span>}
          color='slate'
        />
        <StatTile
          icon={<Send className='h-5 w-5' />}
          label='Messages Sent'
          value={analytics?.messagesSent ?? 0}
          color='green'
        />
        <StatTile
          icon={<Inbox className='h-5 w-5' />}
          label='Messages Received'
          value={analytics?.messagesReceived ?? 0}
          color='amber'
        />
        <StatTile
          icon={<MessagesSquare className='h-5 w-5' />}
          label='Active Conversations'
          value={analytics?.activeConversations ?? 0}
          color='violet'
        />
        <StatTile
          icon={<CheckCheck className='h-5 w-5' />}
          label='Delivery Rate'
          value={`${analytics?.deliveryRate ?? 0}%`}
          color='blue'
        />
        <StatTile
          icon={<BadgeCheck className='h-5 w-5' />}
          label='Read Rate'
          value={`${analytics?.readRate ?? 0}%`}
          color='blue'
        />
        <StatTile
          icon={<AlertCircle className='h-5 w-5' />}
          label='Failed'
          value={analytics?.failedMessages ?? 0}
          color='red'
        />
      </div>

      <div className='grid gap-4 lg:grid-cols-3'>
        <div className='lg:col-span-2'>
          <ConversationFunnelWidget />
        </div>
        <ExpiringWindowsCard />
      </div>

      <LiveActivityFeed />
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/whatsapp/analytics')({
  component: WhatsAppDashboardPage,
})
