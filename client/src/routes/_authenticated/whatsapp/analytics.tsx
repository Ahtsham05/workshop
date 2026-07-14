import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useGetAnalyticsOverviewQuery, useGetCloudConnectionQuery } from '@/stores/whatsappCloud.api'
import { ConversationFunnelWidget } from '@/features/whatsapp/analytics/conversation-funnel-widget'
import { LiveActivityFeed } from '@/features/whatsapp/analytics/live-activity-feed'
import { ExpiringWindowsCard } from '@/features/whatsapp/analytics/expiring-windows-card'

function WhatsAppDashboardPage() {
  const { data: connection } = useGetCloudConnectionQuery()
  const { data: analytics } = useGetAnalyticsOverviewQuery()

  return (
    <div className='p-6 space-y-6'>
      <h1 className='text-2xl font-semibold'>WhatsApp Analytics</h1>
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>Connected Number</CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-lg font-semibold'>{connection?.displayPhoneNumber || '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>Messages Sent</CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-2xl font-bold'>{analytics?.messagesSent ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>Delivery Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-2xl font-bold'>{analytics?.deliveryRate ?? 0}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>Read Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-2xl font-bold'>{analytics?.readRate ?? 0}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-2xl font-bold text-destructive'>{analytics?.failedMessages ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>Active Conversations</CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-2xl font-bold'>{analytics?.activeConversations ?? 0}</p>
          </CardContent>
        </Card>
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
