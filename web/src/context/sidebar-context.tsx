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
  useRef,
  type ReactNode,
} from 'react'
import { getWebsocketStatusMeta, type WebsocketStatusMeta } from '@mochi/web'
import type { WebsocketConnectionStatus } from '@/lib/websocket-manager'
import {
  getDraftChatIds,
  getMarkedUnreadChats,
  getPinnedChats,
  setDraftChatIds,
  setMarkedUnreadChats,
  setPinnedChats,
} from '@/hooks/useChatStorage'

/**
 * Whom a link proposes chatting with: a friend, or an address on another
 * network with the user's account that reaches it.
 */
export interface NewChatProposal {
  friend?: string
  account?: string
  address?: string
  name?: string
}

type SidebarContextValue = {
  chatId: string | null
  chatName: string | null
  setChat: (id: string | null, name?: string) => void
  newChatDialogOpen: boolean
  openNewChatDialog: () => void
  /**
   * The new chat dialog filled in with what a link proposes, which only the
   * user's Create chat makes.
   */
  openNewChatWith: (proposal: NewChatProposal) => void
  /** What the dialog was opened with, if a link opened it. */
  newChatProposal: NewChatProposal | null
  /**
   * The new chat dialog, for a chat that wants something of whichever chat it
   * ends on before that chat opens: Share fills its message box.
   */
  openNewChatFor: (chosen: (chatId: string) => Promise<void>) => void
  /** The dialog ends on a chat, which opens once this answers. */
  newChatChosen: (chatId: string) => Promise<void>
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

  const setChatDraftPresent = useCallback(
    (chatId: string, present: boolean) => {
      setDraftChatIdsState((prev) => {
        const has = prev.has(chatId)
        if (present === has) return prev
        const next = new Set(prev)
        if (present) next.add(chatId)
        else next.delete(chatId)
        setDraftChatIds(next)
        return next
      })
    },
    []
  )

  const setChat = useCallback((id: string | null, name?: string) => {
    setChatId(id)
    setChatName(name ?? null)
  }, [])

  // What the dialog's opener wants of the chat it ends on, until it is next
  // opened.
  const chosen = useRef<((chatId: string) => Promise<void>) | null>(null)
  const [newChatProposal, setNewChatProposal] =
    useState<NewChatProposal | null>(null)

  const openNewChatDialog = useCallback(() => {
    chosen.current = null
    setNewChatProposal(null)
    setNewChatDialogOpen(true)
  }, [])

  const openNewChatWith = useCallback((proposal: NewChatProposal) => {
    chosen.current = null
    setNewChatProposal(proposal)
    setNewChatDialogOpen(true)
  }, [])

  const openNewChatFor = useCallback(
    (wanted: (chatId: string) => Promise<void>) => {
      chosen.current = wanted
      setNewChatProposal(null)
      setNewChatDialogOpen(true)
    },
    []
  )

  const newChatChosen = useCallback(async (chatId: string) => {
    const wanted = chosen.current
    chosen.current = null
    await wanted?.(chatId)
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
        openNewChatWith,
        newChatProposal,
        openNewChatFor,
        newChatChosen,
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
