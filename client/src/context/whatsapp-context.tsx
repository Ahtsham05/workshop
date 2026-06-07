import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  useGetWhatsAppStatusQuery,
  useConnectWhatsAppMutation,
  useDisconnectWhatsAppMutation,
  useClearWhatsAppSessionMutation,
  useTestWhatsAppMutation,
  useSendWhatsAppMessageMutation,
  useSendInvoicePdfWhatsAppMutation,
  type WhatsAppConnectionState,
} from '@/stores/whatsapp.api'
import { WhatsAppConnectionDialog } from '@/components/whatsapp/whatsapp-connection-dialog'
import { WhatsAppComposeDialog } from '@/components/whatsapp/whatsapp-compose-dialog'
import { toast } from 'sonner'

type ComposeTarget = {
  phone: string
  name?: string
  defaultMessage?: string
}

type WhatsAppContextValue = {
  state: WhatsAppConnectionState
  isReady: boolean
  qrImage: string | null
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
  const [pollInterval, setPollInterval] = useState(3000)
  const [connectionOpen, setConnectionOpen] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeTarget, setComposeTarget] = useState<ComposeTarget | null>(null)

  const { data: status } = useGetWhatsAppStatusQuery(undefined, { pollingInterval: pollInterval })
  const [connect] = useConnectWhatsAppMutation()
  const [disconnect] = useDisconnectWhatsAppMutation()
  const [clearSession] = useClearWhatsAppSessionMutation()
  const [testWhatsApp] = useTestWhatsAppMutation()
  const [sendWhatsAppMessage] = useSendWhatsAppMessageMutation()
  const [sendInvoicePdfMutation] = useSendInvoicePdfWhatsAppMutation()

  const state = (status?.state ?? 'DISCONNECTED') as WhatsAppConnectionState
  const isReady = state === 'READY'
  const qrImage = status?.qrImage ?? null

  useEffect(() => {
    if (state === 'READY' || state === 'AUTH_FAILURE' || state === 'SERVERLESS_UNSUPPORTED') {
      setPollInterval(0)
    } else if (connectionOpen || state === 'QR_READY' || state === 'LOADING') {
      setPollInterval(3000)
    }
  }, [state, connectionOpen])

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
      } catch (err: any) {
        toast.error(err?.data?.message || 'Failed to send WhatsApp message')
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
      } catch (err: any) {
        toast.error(err?.data?.message || 'Failed to send invoice on WhatsApp')
        return false
      }
    },
    [isReady, sendInvoicePdfMutation, openConnectionDialog],
  )

  const handleConnect = useCallback(() => {
    connect()
      .unwrap()
      .catch((e: any) => toast.error(e?.data?.message || 'Connect failed'))
  }, [connect])

  const handleDisconnect = useCallback(() => {
    disconnect()
      .unwrap()
      .then(() => toast.success('Disconnected'))
      .catch(() => {})
  }, [disconnect])

  const handleClearSession = useCallback(() => {
    clearSession()
      .unwrap()
      .then(() => toast.success('Session cleared'))
      .catch(() => {})
  }, [clearSession])

  const handleRefresh = useCallback(() => {
    disconnect()
      .unwrap()
      .catch(() => {})
      .finally(() => {
        connect()
          .unwrap()
          .catch(() => {})
      })
  }, [disconnect, connect])

  const handleTest = useCallback(() => {
    testWhatsApp({})
      .unwrap()
      .then((r) => toast.success(r.message))
      .catch((e: any) => toast.error(e?.data?.message || 'Test failed'))
  }, [testWhatsApp])

  const value = useMemo(
    () => ({
      state,
      isReady,
      qrImage,
      openConnectionDialog,
      openComposeDialog,
      sendMessage,
      sendInvoicePdf,
    }),
    [state, isReady, qrImage, openConnectionDialog, openComposeDialog, sendMessage, sendInvoicePdf],
  )

  return (
    <WhatsAppContext.Provider value={value}>
      {children}
      <WhatsAppConnectionDialog
        open={connectionOpen}
        onOpenChange={setConnectionOpen}
        state={state}
        qrImage={qrImage}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onClearSession={handleClearSession}
        onRefresh={handleRefresh}
        onTest={handleTest}
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
