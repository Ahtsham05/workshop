/**
 * Notifications Management (admin)
 * Compose and broadcast notifications to teachers / students / parents, and
 * review previously sent notifications.
 */
import { useState } from 'react'
import { toast } from 'sonner'
import {
  useSendNotificationMutation,
  useGetSentNotificationsQuery,
  useDeleteNotificationMutation,
} from '@/stores/school.api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Bell, Send, Trash2, Users, GraduationCap, Megaphone } from 'lucide-react'

const AUDIENCES = [
  { id: 'teacher', label: 'Teachers', icon: GraduationCap },
  { id: 'student', label: 'Students', icon: Users },
  { id: 'parent', label: 'Parents', icon: Users },
] as const

const TYPES = [
  { value: 'general', label: 'General' },
  { value: 'fee', label: 'Fee' },
  { value: 'exam', label: 'Exam' },
  { value: 'event', label: 'Event' },
  { value: 'urgent', label: 'Urgent' },
]

const TYPE_BADGE: Record<string, string> = {
  general: 'bg-blue-100 text-blue-700',
  fee: 'bg-emerald-100 text-emerald-700',
  exam: 'bg-violet-100 text-violet-700',
  event: 'bg-amber-100 text-amber-700',
  urgent: 'bg-red-100 text-red-700',
}

export default function NotificationsManagement() {
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [audience, setAudience] = useState<string[]>(['teacher', 'student'])
  const [type, setType] = useState('general')

  const [sendNotification, { isLoading: sending }] = useSendNotificationMutation()
  const [deleteNotification] = useDeleteNotificationMutation()
  const { data: sentData, isLoading } = useGetSentNotificationsQuery({ limit: 50 })

  const sent = (sentData as any)?.results || []

  const toggleAudience = (id: string) => {
    setAudience((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]))
  }

  const handleSend = async () => {
    if (!title.trim()) return toast.error('Enter a title')
    if (!message.trim()) return toast.error('Enter a message')
    if (!audience.length) return toast.error('Select at least one audience')
    try {
      await sendNotification({ title: title.trim(), message: message.trim(), audience, type }).unwrap()
      toast.success('Notification sent')
      setTitle('')
      setMessage('')
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to send notification')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteNotification(id).unwrap()
      toast.success('Notification deleted')
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to delete')
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
          <Bell className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground text-sm">Send announcements to teachers, students and parents</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Compose */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-blue-500" /> New Notification
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Parent-teacher meeting" />
            </div>
            <div className="space-y-1.5">
              <Label>Message</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write your announcement…" rows={4} className="resize-y" />
            </div>
            <div className="space-y-1.5">
              <Label>Send To</Label>
              <div className="flex flex-col gap-2">
                {AUDIENCES.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={audience.includes(a.id)} onCheckedChange={() => toggleAudience(a.id)} />
                    <a.icon className="h-4 w-4 text-muted-foreground" />
                    {a.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={handleSend} disabled={sending}>
              <Send className="mr-2 h-4 w-4" /> {sending ? 'Sending…' : 'Send Notification'}
            </Button>
          </CardContent>
        </Card>

        {/* Sent history */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sent Notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
            ) : sent.length === 0 ? (
              <div className="py-12 text-center">
                <Bell className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No notifications sent yet</p>
              </div>
            ) : (
              sent.map((n: any) => (
                <div key={n.id || n._id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{n.title}</p>
                        <Badge className={`text-[10px] ${TYPE_BADGE[n.type] || TYPE_BADGE.general}`}>{n.type}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap break-words">{n.message}</p>
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        {(n.audience || []).map((a: string) => (
                          <Badge key={a} variant="outline" className="text-[10px] capitalize">{a}s</Badge>
                        ))}
                        <span className="text-[10px] text-muted-foreground/70">
                          {n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}
                        </span>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive flex-shrink-0" onClick={() => handleDelete(n.id || n._id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
