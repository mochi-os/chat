import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { WebsocketConnectionStatus } from '@/lib/websocket-manager'

type WebsocketStatusMeta = {
  label: string
  color: string
}

type SidebarContextValue = {
  chatId: string | null
  chatName: string | null
  setChat: (id: string | null, name?: string) => void
  newChatDialogOpen: boolean
  openNewChatDialog: () => void
  closeNewChatDialog: () => void
  websocketStatus: WebsocketConnectionStatus
  websocketStatusMeta: WebsocketStatusMeta
  setWebsocketStatus: (status: WebsocketConnectionStatus, retries?: number) => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

function getWebsocketStatusMeta(status: WebsocketConnectionStatus, retries: number): WebsocketStatusMeta {
  switch (status) {
    case 'ready':
      return { label: 'Connected', color: 'bg-green-500' }
    case 'connecting':
      return {
        label: retries > 0 ? `Reconnecting (${retries})...` : 'Connecting...',
        color: 'bg-yellow-500',
      }
    case 'error':
      return { label: 'Disconnected', color: 'bg-red-500' }
    case 'idle':
    case 'closing':
    default:
      return { label: 'Disconnected', color: 'bg-slate-500' }
  }
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [chatId, setChatId] = useState<string | null>(null)
  const [chatName, setChatName] = useState<string | null>(null)
  const [newChatDialogOpen, setNewChatDialogOpen] = useState(false)
  const [websocketStatus, setWsStatus] = useState<WebsocketConnectionStatus>('idle')
  const [websocketRetries, setWebsocketRetries] = useState(0)

  const setChat = useCallback((id: string | null, name?: string) => {
    setChatId(id)
    setChatName(name ?? null)
  }, [])

  const openNewChatDialog = useCallback(() => {
    setNewChatDialogOpen(true)
  }, [])

  const closeNewChatDialog = useCallback(() => {
    setNewChatDialogOpen(false)
  }, [])

  const setWebsocketStatus = useCallback((status: WebsocketConnectionStatus, retries = 0) => {
    setWsStatus(status)
    setWebsocketRetries(retries)
  }, [])

  const websocketStatusMeta = getWebsocketStatusMeta(websocketStatus, websocketRetries)

  return (
    <SidebarContext.Provider value={{
      chatId,
      chatName,
      setChat,
      newChatDialogOpen,
      openNewChatDialog,
      closeNewChatDialog,
      websocketStatus,
      websocketStatusMeta,
      setWebsocketStatus,
    }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebarContext() {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebarContext must be used within a SidebarProvider')
  }
  return context
}
