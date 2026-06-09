import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  useGetWhatsAppStatusQuery,
  useDisconnectWhatsAppMutation,
  useSendWhatsAppMessageMutation,
  useSendInvoicePdfWhatsAppMutation,
} from '@/stores/whatsapp.api'
import { WhatsAppConnectionDialog } from '@/components/whatsapp/whatsapp-connection-dialog'
import { WhatsAppComposeDialog } from '@/components/whatsapp/whatsapp-compose-dialog'
import { toast } from 'sonner'
import { WHATSAPP_UI_ENABLED } from '@/config/whatsapp-ui'

type ComposeTarget = {
  phone: string
  name?: string
  defaultMessage?: string
}

type WhatsAppContextValue = {
  isReady: boolean
  connection: {
    displayPhoneNumber?: string
    verifiedName?: string
    webhookSubscribed?: boolean
    status?: string
  } | null
  openConnectionDialog: () => void
  openComposeDialog: (target: ComposeTarget) => void
  sendMessage: (phone: string, message: string) => Promise<boolean>
  sendInvoicePdf: (payload: {
    phone: string
    pdfBase64: string
    filename?: string
    caption?: string
    invoiceNumber?: string
  }) => Promise<boolean>
}

const WhatsAppContext = createContext<WhatsAppContextValue | null>(null)

export function WhatsAppProvider({ children }: { children: ReactNode }) {
  const [connectionOpen, setConnectionOpen] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeTarget, setComposeTarget] = useState<ComposeTarget | null>(null)

  const { data: status, refetch } = useGetWhatsAppStatusQuery(undefined, {
    skip: !WHATSAPP_UI_ENABLED,
    refetchOnFocus: true,
  })

  const [disconnect, { isLoading: disconnecting }] = useDisconnectWhatsAppMutation()
  const [sendWhatsAppMessage] = useSendWhatsAppMessageMutation()
  const [sendInvoicePdfMutation] = useSendInvoicePdfWhatsAppMutation()

  const isReady = Boolean(status?.connected ?? status?.state === 'READY')
  const connection = status?.branchConnection ?? null

  const openConnectionDialog = useCallback(() => setConnectionOpen(true), [])
  const openComposeDialog = useCallback((target: ComposeTarget) => {
    setComposeTarget(target)
    setComposeOpen(true)
  }, [])

  const sendMessage = useCallback(
    async (phone: string, message: string) => {
      if (!isReady) {
        toast.error('WhatsApp is not connected')
        openConnectionDialog()
        return false
      }
      try {
        await sendWhatsAppMessage({ phone, message }).unwrap()
        toast.success('Message sent on WhatsApp')
        return true
      } catch (err: unknown) {
        const e = err as { data?: { message?: string } }
        toast.error(e.data?.message || 'Failed to send WhatsApp message')
        return false
      }
    },
    [isReady, sendWhatsAppMessage, openConnectionDialog],
  )

  const sendInvoicePdf = useCallback(
    async (payload: {
      phone: string
      pdfBase64: string
      filename?: string
      caption?: string
      invoiceNumber?: string
    }) => {
      if (!isReady) {
        toast.error('WhatsApp is not connected')
        openConnectionDialog()
        return false
      }
      try {
        await sendInvoicePdfMutation(payload).unwrap()
        toast.success('Invoice sent on WhatsApp')
        return true
      } catch (err: unknown) {
        const e = err as { data?: { message?: string } }
        toast.error(e.data?.message || 'Failed to send invoice on WhatsApp')
        return false
      }
    },
    [isReady, sendInvoicePdfMutation, openConnectionDialog],
  )

  const handleDisconnect = useCallback(() => {
    disconnect()
      .unwrap()
      .then(() => {
        toast.success('WhatsApp disconnected')
        refetch()
      })
      .catch(() => toast.error('Disconnect failed'))
  }, [disconnect, refetch])

  const value = useMemo(
    () => ({
      isReady,
      connection,
      openConnectionDialog,
      openComposeDialog,
      sendMessage,
      sendInvoicePdf,
    }),
    [isReady, connection, openConnectionDialog, openComposeDialog, sendMessage, sendInvoicePdf],
  )

  return (
    <WhatsAppContext.Provider value={value}>
      {children}
      {WHATSAPP_UI_ENABLED && (
        <>
          <WhatsAppConnectionDialog
            open={connectionOpen}
            onOpenChange={setConnectionOpen}
            isReady={isReady}
            connection={connection}
            onDisconnect={handleDisconnect}
            disconnecting={disconnecting}
          />
          <WhatsAppComposeDialog
            open={composeOpen}
            onOpenChange={setComposeOpen}
            phone={composeTarget?.phone ?? ''}
            name={composeTarget?.name}
            defaultMessage={composeTarget?.defaultMessage ?? ''}
            onSend={sendMessage}
            isReady={isReady}
            onConnect={openConnectionDialog}
          />
        </>
      )}
    </WhatsAppContext.Provider>
  )
}

export function useWhatsApp() {
  const ctx = useContext(WhatsAppContext)
  if (!ctx) throw new Error('useWhatsApp must be used within WhatsAppProvider')
  return ctx
}

export function useWhatsAppOptional() {
  return useContext(WhatsAppContext)
}
