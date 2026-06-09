import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react'
import {
  getMarkedUnreadChats,
  setMarkedUnreadChats,
} from '@/hooks/useChatStorage'
import {
  getWebsocketStatusMeta,
  type WebsocketStatusMeta,
} from '@mochi/web'
import type { WebsocketConnectionStatus } from '@/lib/websocket-manager'

type SidebarContextValue = {
  chatId: string | null
  chatName: string | null
  setChat: (id: string | null, name?: string) => void
  newChatDialogOpen: boolean
  openNewChatDialog: () => void
  closeNewChatDialog: () => void
  websocketStatus: WebsocketConnectionStatus
  websocketStatusMeta: WebsocketStatusMeta
  setWebsocketStatus: (
    status: WebsocketConnectionStatus,
    retries?: number
  ) => void
  markedUnreadChatIds: ReadonlySet<string>
  isChatMarkedUnread: (chatId: string) => boolean
  markChatAsUnread: (chatId: string) => void
  clearMarkedUnread: (chatId: string) => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [chatId, setChatId] = useState<string | null>(null)
  const [chatName, setChatName] = useState<string | null>(null)
  const [newChatDialogOpen, setNewChatDialogOpen] = useState(false)
  const [websocketStatus, setWsStatus] =
    useState<WebsocketConnectionStatus>('idle')
  const [websocketRetries, setWebsocketRetries] = useState(0)
  const [markedUnreadChatIds, setMarkedUnreadChatIds] = useState<Set<string>>(
    () => new Set()
  )

  useEffect(() => {
    void getMarkedUnreadChats().then(setMarkedUnreadChatIds)
  }, [])

  const isChatMarkedUnread = useCallback(
    (chatId: string) => markedUnreadChatIds.has(chatId),
    [markedUnreadChatIds]
  )

  const markChatAsUnread = useCallback((chatId: string) => {
    setMarkedUnreadChatIds((prev) => {
      if (prev.has(chatId)) return prev
      const next = new Set(prev)
      next.add(chatId)
      setMarkedUnreadChats(next)
      return next
    })
  }, [])

  const clearMarkedUnread = useCallback((chatId: string) => {
    setMarkedUnreadChatIds((prev) => {
      if (!prev.has(chatId)) return prev
      const next = new Set(prev)
      next.delete(chatId)
      setMarkedUnreadChats(next)
      return next
    })
  }, [])

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

  const setWebsocketStatus = useCallback(
    (status: WebsocketConnectionStatus, retries = 0) => {
      setWsStatus(status)
      setWebsocketRetries(retries)
    },
    []
  )

  const websocketStatusMeta = getWebsocketStatusMeta(
    websocketStatus,
    websocketRetries
  )

  return (
    <SidebarContext.Provider
      value={{
        chatId,
        chatName,
        setChat,
        newChatDialogOpen,
        openNewChatDialog,
        closeNewChatDialog,
        websocketStatus,
        websocketStatusMeta,
        setWebsocketStatus,
        markedUnreadChatIds,
        isChatMarkedUnread,
        markChatAsUnread,
        clearMarkedUnread,
      }}
    >
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
