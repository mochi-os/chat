// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react'
import {
  getDraftChatIds,
  getMarkedUnreadChats,
  getPinnedChats,
  setDraftChatIds,
  setMarkedUnreadChats,
  setPinnedChats,
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
  pinnedChatIds: ReadonlySet<string>
  isChatPinned: (chatId: string) => boolean
  pinChat: (chatId: string) => void
  unpinChat: (chatId: string) => void
  draftChatIds: ReadonlySet<string>
  hasChatDraft: (chatId: string) => boolean
  setChatDraftPresent: (chatId: string, present: boolean) => void
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
  const [pinnedChatIds, setPinnedChatIds] = useState<Set<string>>(
    () => new Set()
  )
  const [draftChatIds, setDraftChatIdsState] = useState<Set<string>>(
    () => new Set()
  )

  useEffect(() => {
    void getMarkedUnreadChats().then(setMarkedUnreadChatIds)
    void getPinnedChats().then(setPinnedChatIds)
    void getDraftChatIds().then(setDraftChatIdsState)
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

  const isChatPinned = useCallback(
    (chatId: string) => pinnedChatIds.has(chatId),
    [pinnedChatIds]
  )

  const pinChat = useCallback((chatId: string) => {
    setPinnedChatIds((prev) => {
      if (prev.has(chatId)) return prev
      const next = new Set(prev)
      next.add(chatId)
      setPinnedChats(next)
      return next
    })
  }, [])

  const unpinChat = useCallback((chatId: string) => {
    setPinnedChatIds((prev) => {
      if (!prev.has(chatId)) return prev
      const next = new Set(prev)
      next.delete(chatId)
      setPinnedChats(next)
      return next
    })
  }, [])

  const hasChatDraft = useCallback(
    (chatId: string) => draftChatIds.has(chatId),
    [draftChatIds]
  )

  const setChatDraftPresent = useCallback((chatId: string, present: boolean) => {
    setDraftChatIdsState((prev) => {
      const has = prev.has(chatId)
      if (present === has) return prev
      const next = new Set(prev)
      if (present) next.add(chatId)
      else next.delete(chatId)
      setDraftChatIds(next)
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
        pinnedChatIds,
        isChatPinned,
        pinChat,
        unpinChat,
        draftChatIds,
        hasChatDraft,
        setChatDraftPresent,
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
