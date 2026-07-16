// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { plural } from '@lingui/core/macro'
import { useLingui as useLinguiRuntime } from '@lingui/react'
import { useAuthStore, usePageTitle, PageHeader, Main, GeneralError, Button, Checkbox, ConfirmDialog, EntityAvatar, IconButton, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Label, toast, toastAction, getErrorMessage, shellClipboardWrite, getSendAttachmentErrorMessage, isAttachmentPayloadTooLargeError } from '@mochi/web'
import { useMessageSelection } from '@/hooks/use-message-selection'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { ChatSkeleton } from './components/chat-skeleton'
import {
  Copy,
  Forward,
  MoreHorizontal,
  Settings,
  Inbox,
  LogOut,
  Loader2,
  Trash2,
  MessageCircle,
  Search,
  Users,
} from 'lucide-react'
import { useSidebarContext } from '@/context/sidebar-context'
import {
  setLastChat,
  setDraft,
  getDraft,
  clearDraft,
  isReadTimestampsMigrated,
  getLegacyReadTimestamps,
  markReadTimestampsMigrated,
} from '@/hooks/useChatStorage'
import { chatsApi } from '@/api/chats'
import { useChatWebsocket } from '@/hooks/useChatWebsocket'
import { useReactToMessageMutation } from '@/hooks/use-message-reactions'
import type { ReactionId } from '@/features/chats/constants/reactions'
import {
  chatKeys,
  useInfiniteMessagesQuery,
  useChatsQuery,
  useSendMessageMutation,
  useChatDetailQuery,
  useLeaveChatMutation,
  useDeleteChatMutation,
  useCreateChatMutation,
  useMarkChatReadMutation,
  useDeleteMessagesMutation,
} from '@/hooks/useChats'
import type { GetMessagesResponse } from '@/api/types/chats'
import { chatActive } from '@/api/types/chats'
import { ChatEmptyState } from './components/chat-empty-state'
import { ChatSettingsDialog } from './components/chat-settings-dialog'
import { ChatInput, type ChatInputHandle } from './components/chat-input'
import { ChatMessageList } from './components/chat-message-list'
import { ChatSearchHeader } from './components/chat-search-header'
import { ForwardDialog } from './components/forward-dialog'
import { useChatMessageSearch } from './hooks/use-chat-message-search'
import {
  type PendingAttachment,
  createPendingAttachment,
  revokePendingAttachmentPreview,
} from './utils'
import {
  type ReplyTarget,
  messageToReplyTarget,
} from './utils/reply'
import type { ChatMessage } from '@/api/chats'

export function Chats() {
  const { t } = useLingui()
  const { _ } = useLinguiRuntime()
  usePageTitle(t`Chat`)

  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { openNewChatDialog, setWebsocketStatus, clearMarkedUnread } =
    useSidebarContext()
  const [newMessage, setNewMessage] = useState('')
  const [showLeaveDialog, setShowLeaveDialog] = useState(false)
  const [chatSettingsOpen, setChatSettingsOpen] = useState(false)
  const [deleteOnLeave, setDeleteOnLeave] = useState(false)

  const {
    selectedIds,
    isSelecting,
    toggle: toggleMessageSelection,
    selectOne,
    selectAll: selectAllMessages,
    clear: clearSelection,
  } = useMessageSelection()

  // Delete confirm + forward dialog targets (ids the action will operate on)
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[] | null>(null)
  const [forwardTargetIds, setForwardTargetIds] = useState<string[] | null>(null)

  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachment[]
  >([])
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null)
  const [scrollToMessageId, setScrollToMessageId] = useState<string | null>(
    null
  )
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(
    null
  )
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chatInputRef = useRef<ChatInputHandle>(null)

  const {
    identity: currentUserIdentity,
    initialize: initializeAuth,
  } = useAuthStore()

  useEffect(() => {
    initializeAuth()
  }, [initializeAuth])

  // URL param
  const params = useParams({ strict: false }) as { chatId?: string }
  const selectedChatId = params?.chatId
  // Search params (only present on the index route, never on /$chatId)
  const search = useSearch({ strict: false }) as { with?: string; name?: string }

  // Store last visited chat for restoration on next entry
  useEffect(() => {
    if (selectedChatId) {
      setLastChat(selectedChatId)
    }
  }, [selectedChatId])

  // Reset input, selection, and restore draft when selected chat changes
  useEffect(() => {
    setNewMessage('')
    setReplyTo(null)
    setScrollToMessageId(null)
    setHighlightMessageId(null)
    clearSelection()
    setDeleteTargetIds(null)
    setForwardTargetIds(null)
    if (!selectedChatId) return
    getDraft(selectedChatId).then((draft) => {
      if (draft) setNewMessage(draft)
    })
  }, [selectedChatId])

  // Debounced draft save on every keystroke
  useEffect(() => {
    if (!selectedChatId) return
    const timer = setTimeout(() => {
      if (newMessage) {
        setDraft(selectedChatId, newMessage)
      } else {
        clearDraft(selectedChatId)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [newMessage, selectedChatId])

  // Chats list
  const chatsQuery = useChatsQuery()
  const chats = useMemo(
    () => chatsQuery.data?.chats ?? [],
    [chatsQuery.data?.chats]
  )

  // Deep-link from another app: ?with=<friend-id>&name=<chat-name>
  // Find or create a 1-on-1 chat with that friend, then jump straight in.
  const createChatMutation = useCreateChatMutation()
  const deepLinkHandled = useRef(false)
  useEffect(() => {
    if (selectedChatId) return // already viewing a chat
    if (!search.with || deepLinkHandled.current) return
    if (chatsQuery.isLoading) return // wait until we know existing chats
    const memberId = search.with
    deepLinkHandled.current = true

    const existing = chats.find(
      (c) => c.members === 2 && c.other === memberId && chatActive(c)
    )
    if (existing) {
      void navigate({ to: '/$chatId', params: { chatId: existing.id }, replace: true })
      return
    }

    void (async () => {
      try {
        const data = await toastAction(
          createChatMutation.mutateAsync({
            members: memberId,
            name: (search.name || t`Chat`).trim() || t`Chat`,
          }),
          {
            loading: t`Starting chat...`,
            success: false,
            error: (error) =>
              getErrorMessage(error, t`Failed to start chat`),
          }
        )
        if (data?.id) {
          void navigate({
            to: '/$chatId',
            params: { chatId: data.fingerprint ?? data.id },
            replace: true,
          })
        }
      } catch {
        deepLinkHandled.current = false
        // toastAction already showed error
      }
    })()
  }, [
    search.with,
    search.name,
    selectedChatId,
    chats,
    chatsQuery.isLoading,
    createChatMutation,
    navigate,
    t,
  ])

  const selectedChat = useMemo(
    () =>
      chats.find(
        (c) => c.id === selectedChatId || c.fingerprint === selectedChatId
      ) ?? null,
    [chats, selectedChatId]
  )

  const { mutate: markChatRead } = useMarkChatReadMutation()
  const readMigrationStarted = useRef(false)
  const markedChatIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (readMigrationStarted.current) return
    readMigrationStarted.current = true

    void (async () => {
      if (await isReadTimestampsMigrated()) return
      const legacy = await getLegacyReadTimestamps()
      const entries = Object.entries(legacy)
      if (entries.length > 0) {
        await Promise.all(
          entries.map(([chatId, readAt]) =>
            chatsApi.markRead(chatId, { read: readAt }).catch(() => undefined)
          )
        )
      }
      markReadTimestampsMigrated()
    })()
  }, [])

  useEffect(() => {
    if (!selectedChat?.id) {
      markedChatIdRef.current = null
      return
    }
    if (!chatActive(selectedChat)) return
    if (markedChatIdRef.current === selectedChat.id) return
    markedChatIdRef.current = selectedChat.id
    clearMarkedUnread(selectedChat.id)
    markChatRead({ chatId: selectedChat.id })
  }, [selectedChat?.id, selectedChat?.status, clearMarkedUnread, markChatRead])

  // Chat detail (members, names)
  const { data: chatDetail } = useChatDetailQuery(selectedChat?.id)

  const subtitle = useMemo(() => {
    if (!chatDetail?.chat.members || chatDetail.chat.members.length <= 2) return null

    const members = chatDetail.chat.members
    const myIndex = members.findIndex((m) => m.id === currentUserIdentity)

    let display = members.map((m) => m.name)
    if (myIndex !== -1) {
      display = [t`You`, ...display.filter((_, i) => i !== myIndex)]
    }

    return display.join(', ')
  }, [chatDetail, currentUserIdentity, t])

  // Messages
  const messagesQuery = useInfiniteMessagesQuery(selectedChat?.id)
  const chatMessages = useMemo(() => {
    if (!messagesQuery.data?.pages) return []
    return [...messagesQuery.data.pages].reverse().flatMap((p) => p.messages)
  }, [messagesQuery.data?.pages])

  const messageSearch = useChatMessageSearch(
    selectedChat?.id,
    Boolean(selectedChat && chatActive(selectedChat))
  )

  const ensureMatchVisible = useCallback(
    async (targetId: string) => {
      if (!selectedChat?.id) return false

      const key = chatKeys.messages(selectedChat.id)
      let hasMore = messagesQuery.hasNextPage ?? false

      for (let i = 0; i < 20 && hasMore; i++) {
        const data = queryClient.getQueryData<InfiniteData<GetMessagesResponse>>(
          key
        )
        const loaded = data?.pages
          ? [...data.pages].reverse().flatMap((p) => p.messages)
          : []
        if (loaded.some((m) => m.id === targetId)) return true

        const result = await messagesQuery.fetchNextPage()
        hasMore = result.hasNextPage ?? false
      }

      const data = queryClient.getQueryData<InfiniteData<GetMessagesResponse>>(
        key
      )
      const loaded = data?.pages
        ? [...data.pages].reverse().flatMap((p) => p.messages)
        : []
      return loaded.some((m) => m.id === targetId)
    },
    [selectedChat?.id, queryClient, messagesQuery]
  )

  const flashHighlight = useCallback((messageId: string) => {
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current)
    }
    setHighlightMessageId(messageId)
    highlightTimerRef.current = setTimeout(() => {
      setHighlightMessageId(null)
      highlightTimerRef.current = null
    }, 2000)
  }, [])

  const handleReply = useCallback((message: ChatMessage) => {
    setReplyTo(messageToReplyTarget(message))
    chatInputRef.current?.focusInput()
  }, [])

  const reactToMessageMutation = useReactToMessageMutation()

  const handleReact = useCallback(
    (messageId: string, reaction: ReactionId | '') => {
      if (!selectedChat) return
      reactToMessageMutation.mutate({
        chatId: selectedChat.id,
        messageId,
        reaction,
      })
    },
    [selectedChat, reactToMessageMutation]
  )

  const handleCopySelected = useCallback(async () => {
    const bodies = chatMessages
      .filter((m) => selectedIds.has(m.id) && m.body?.trim())
      .map((m) => m.body!.trim())
    if (bodies.length === 0) {
      toast.error(t`Nothing to copy`)
      return
    }
    const ok = await shellClipboardWrite(bodies.join('\n\n'))
    if (ok) toast.success(t`Copied`)
    else toast.error(t`Failed to copy`)
  }, [chatMessages, selectedIds, t])

  const deleteMessagesMutation = useDeleteMessagesMutation()

  // Only the user's own messages can be deleted; others are skipped server-side.
  const requestDelete = useCallback(
    (ids: string[]) => {
      const ownIds = chatMessages
        .filter((m) => ids.includes(m.id) && m.member === currentUserIdentity)
        .map((m) => m.id)
      if (ownIds.length === 0) {
        toast.error(t`You can only delete your own messages`)
        return
      }
      setDeleteTargetIds(ownIds)
    },
    [chatMessages, currentUserIdentity, t]
  )

  const confirmDelete = async () => {
    if (!selectedChat || !deleteTargetIds?.length) return
    try {
      await toastAction(
        deleteMessagesMutation.mutateAsync({
          chatId: selectedChat.id,
          messageIds: deleteTargetIds,
        }),
        {
          loading: t`Deleting...`,
          success: t`Message deleted`,
          error: (error) => getErrorMessage(error, t`Failed to delete`),
        }
      )
      setDeleteTargetIds(null)
      clearSelection()
    } catch {
      // toastAction already showed error
    }
  }

  const requestForward = useCallback((ids: string[]) => {
    if (ids.length === 0) return
    setForwardTargetIds(ids)
  }, [])

  const handleScrollToMessage = useCallback(
    async (messageId: string) => {
      setScrollToMessageId(messageId)
      const found = await ensureMatchVisible(messageId)
      if (!found) {
        toast.error(t`Message not available`)
        setScrollToMessageId(null)
        return
      }
      flashHighlight(messageId)
    },
    [ensureMatchVisible, flashHighlight, t]
  )

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current)
      }
    }
  }, [])

  const activeScrollTargetId =
    messageSearch.isSearchOpen && messageSearch.activeMatchId
      ? messageSearch.activeMatchId
      : scrollToMessageId

  const scrollToMessageEnabled = Boolean(
    (messageSearch.isSearchOpen && messageSearch.activeMatchId) ||
      scrollToMessageId
  )

  useEffect(() => {
    if (!messageSearch.isSearchOpen || !messageSearch.activeMatchId) return
    void ensureMatchVisible(messageSearch.activeMatchId)
  }, [
    messageSearch.isSearchOpen,
    messageSearch.activeMatchId,
    ensureMatchVisible,
  ])

  const openSearch = messageSearch.openSearch
  const isChatActive = Boolean(selectedChat && chatActive(selectedChat))
  useEffect(() => {
    if (!isChatActive) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        openSearch()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // Depend on a derived boolean + the memoized openSearch — not the whole
    // messageSearch/selectedChat objects (their identity churns every render).
  }, [isChatActive, openSearch])

  // Send message
  const sendAttachmentErrorMessages = {
    fallback: t`Failed to send message`,
    tooLargeForServer: t`Attachments are too large to upload. Remove or shrink files and try again.`,
    networkMaybeTooLarge: t`Message could not be sent. Attachments may be too large, or your connection failed. Try smaller files.`,
  }

  const sendMessageMutation = useSendMessageMutation({
    onSuccess: () => {
      setNewMessage('')
      setReplyTo(null)
      clearAttachments()
      if (selectedChat) clearDraft(selectedChat.id)
    },
    onError: (error) => {
      if (!isAttachmentPayloadTooLargeError(error)) return
      toast.error(
        getSendAttachmentErrorMessage(error, sendAttachmentErrorMessages)
      )
    },
  })

  // Leave chat
  const leaveChatMutation = useLeaveChatMutation({
    onSuccess: (_data, variables) => {
      setShowLeaveDialog(false)
      // Navigate away only if deleting locally (chat won't exist anymore)
      if (variables.delete) {
        void navigate({ to: '/' })
      }
    },
  })

  const handleLeaveChat = async () => {
    if (!selectedChat) return
    try {
      await toastAction(
        leaveChatMutation.mutateAsync({
          chatId: selectedChat.id,
          delete: deleteOnLeave,
        }),
        {
          loading: t`Leaving chat...`,
          success: t`Left chat`,
          error: (error) => getErrorMessage(error, t`Failed to leave chat`),
        }
      )
    } catch {
      // toastAction already showed error
    }
  }

  // Delete chat (for left chats)
  const deleteChatMutation = useDeleteChatMutation()

  const handleDeleteChat = async () => {
    if (!selectedChat) return
    try {
      await toastAction(
        deleteChatMutation.mutateAsync({ chatId: selectedChat.id }),
        {
          loading: t`Deleting chat...`,
          success: t`Chat deleted`,
          error: (error) => getErrorMessage(error, t`Failed to delete chat`),
        }
      )
      void navigate({ to: '/' })
    } catch {
      // toastAction already showed error
    }
  }

  // WebSocket
  const { status, retries } = useChatWebsocket(
    selectedChat?.id,
    selectedChat?.key,
    currentUserIdentity
  )
  useEffect(() => {
    setWebsocketStatus(status, retries)
  }, [status, retries, setWebsocketStatus])

  const clearAttachments = () => {
    pendingAttachments.forEach(revokePendingAttachmentPreview)
    setPendingAttachments([])
  }

  const handleAttachmentSelection = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    const newAttachments = files.map(createPendingAttachment)
    setPendingAttachments((prev) => [...prev, ...newAttachments])
  }

  const handleRemoveAttachment = (id: string) => {
    setPendingAttachments((prev) => {
      const attachment = prev.find((a) => a.id === id)
      if (attachment) {
        revokePendingAttachmentPreview(attachment)
      }
      return prev.filter((a) => a.id !== id)
    })
  }

  const handleReorderAttachments = (fromIndex: number, toIndex: number) => {
    setPendingAttachments((prev) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= prev.length ||
        toIndex >= prev.length
      ) {
        return prev
      }
      const next = [...prev]
      const [item] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, item)
      return next
    })
  }

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedChat || sendMessageMutation.isPending) return

    const body = newMessage.trim()
    if (!body && pendingAttachments.length === 0) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line lingui/no-unlocalized-strings -- dev-only diagnostic log, not user-facing
        globalThis.console?.warn?.('[chat] blocked empty message submit')
      }
      return
    }

    sendMessageMutation.mutate({
      chatId: selectedChat.id,
      body,
      reply_to: replyTo?.id,
      attachments: pendingAttachments.map((a) => a.file),
    })
  }

  const canSendMessage =
    !sendMessageMutation.isPending &&
    (Boolean(newMessage.trim()) || pendingAttachments.length > 0)

  const sendAttachmentErrorMessage = sendMessageMutation.error
    ? getSendAttachmentErrorMessage(
        sendMessageMutation.error,
        sendAttachmentErrorMessages
      )
    : null

  // Loading state: show full skeleton (includes its own PageHeader + Main)
  if (selectedChatId && chatsQuery.isLoading) {
    return <ChatSkeleton />
  }

  if (!selectedChat) {
    return (
      <div className='flex h-full flex-col overflow-hidden'>
        <PageHeader
          title={t`Chat`}
          icon={<MessageCircle className='size-4 md:size-5' />}
          menuAction={
            <IconButton
              variant='ghost'
              label={t`Chat settings`}
              onClick={() => setChatSettingsOpen(true)}
            >
              <Settings className='size-5' />
            </IconButton>
          }
        />
        <ChatSettingsDialog open={chatSettingsOpen} onOpenChange={setChatSettingsOpen} />
        <Main className='flex min-h-0 flex-1 flex-col gap-4 overflow-hidden'>
          {chatsQuery.error ? (
            <GeneralError
              error={chatsQuery.error}
              minimal
              mode='inline'
              reset={chatsQuery.refetch}
            />
          ) : (
            <ChatEmptyState
              onNewChat={openNewChatDialog}
              hasExistingChats={chats.length > 0}
            />
          )}
        </Main>
      </div>
    )
  }

  return (
    <>
      <div className='flex h-full flex-col overflow-hidden'>
        {messageSearch.isSearchOpen ? (
          <ChatSearchHeader
            query={messageSearch.query}
            onQueryChange={messageSearch.setQuery}
            activeIndex={messageSearch.activeIndex}
            totalMatches={messageSearch.matches.length}
            isSearching={messageSearch.isSearching}
            onNewer={messageSearch.goNewer}
            onOlder={messageSearch.goOlder}
            onClose={messageSearch.closeSearch}
          />
        ) : (
        <PageHeader
          title={selectedChat.name}
          icon={
            selectedChat.members === 2 && selectedChat.other ? (
              <EntityAvatar
                src={`/people/${selectedChat.other}/-/avatar`}
                styleUrl={`/people/${selectedChat.other}/-/style`}
                name={selectedChat.name}
                size="xl"
              />
            ) : (
              <EntityAvatar size="xl" icon={Users} />
            )
          }
          description={subtitle || undefined}
          menuAction={
            <div className='flex items-center gap-1'>
              {chatActive(selectedChat) ? (
                <IconButton
                  variant='ghost'
                  label={t`Search messages`}
                  onClick={messageSearch.openSearch}
                >
                  <Search className='size-5' />
                </IconButton>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton
                    variant='ghost'
                    label={t`Open chat actions`}
                  >
                    <MoreHorizontal className='size-5' />
                  </IconButton>
                </DropdownMenuTrigger>
              <DropdownMenuContent align='end' className='w-56'>
                {!chatActive(selectedChat) ? (
                  <DropdownMenuItem onClick={handleDeleteChat}>
                    <Trash2 className='me-2 size-4' /> <Trans>Delete chat</Trans>
                  </DropdownMenuItem>
                ) : (
                  <>
                    <DropdownMenuItem
                      onClick={() => setShowLeaveDialog(true)}
                    >
                      <LogOut className='me-2 size-4' /> <Trans>Leave chat</Trans>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        void navigate({
                          to: '/$chatId/settings',
                          params: { chatId: selectedChat.id },
                        })
                      }
                    >
                      <Settings className='me-2 size-4' /> <Trans>Chat settings</Trans>
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setChatSettingsOpen(true)}>
                  <Inbox className='me-2 size-4' /> <Trans>Incoming chats</Trans>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
          }
        />
        )}

        <Main className='flex min-h-0 flex-1 flex-col overflow-hidden'>
          {chatsQuery.error ? (
            <GeneralError
              error={chatsQuery.error}
              minimal
              mode='inline'
              reset={chatsQuery.refetch}
              className='pb-4'
            />
          ) : null}
          <ChatMessageList
            chatId={selectedChat?.id}
            messagesQuery={messagesQuery}
            chatMessages={chatMessages}
            isLoadingMessages={messagesQuery.isLoading}
            messagesError={messagesQuery.error}
            currentUserIdentity={currentUserIdentity}
            isGroupChat={(chatDetail?.chat.members?.length ?? 0) > 2}
            searchActive={messageSearch.isSearchOpen}
            searchQuery={messageSearch.debouncedQuery}
            matchedMessageIds={messageSearch.matchedMessageIds}
            activeMatchId={messageSearch.activeMatchId}
            scrollToMessageId={activeScrollTargetId}
            scrollToMessageEnabled={scrollToMessageEnabled}
            highlightMessageId={
              messageSearch.isSearchOpen
                ? messageSearch.activeMatchId
                : highlightMessageId
            }
            onEnsureMatchVisible={(id) => {
              void ensureMatchVisible(id)
            }}
            onScrollToMessageComplete={(id) => {
              if (!messageSearch.isSearchOpen) {
                setScrollToMessageId((current) =>
                  current === id ? null : current
                )
              }
            }}
            onReply={chatActive(selectedChat) ? handleReply : undefined}
            onReact={chatActive(selectedChat) ? handleReact : undefined}
            onScrollToMessage={handleScrollToMessage}
            onForward={chatActive(selectedChat) ? (m) => requestForward([m.id]) : undefined}
            onDelete={chatActive(selectedChat) ? (m) => requestDelete([m.id]) : undefined}
            isSelecting={isSelecting}
            selectedIds={selectedIds}
            onToggleSelect={toggleMessageSelection}
            onSelectMessage={(message) => selectOne(message.id)}
            onSelectAll={(ids) => selectAllMessages(ids)}
            onClearSelection={clearSelection}
          />

          {isSelecting ? (
            <div className='border-t px-4 py-3'>
              <div className='flex items-center justify-between gap-2'>
                <span className='text-muted-foreground text-sm'>
                  <Trans>{selectedIds.size} selected</Trans>
                </span>
                <div className='flex items-center gap-1'>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => void handleCopySelected()}
                  >
                    <Copy className='me-1.5 size-4' />
                    <Trans>Copy</Trans>
                  </Button>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => requestForward([...selectedIds])}
                  >
                    <Forward className='me-1.5 size-4' />
                    <Trans>Forward</Trans>
                  </Button>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => requestDelete([...selectedIds])}
                    className='text-destructive hover:text-destructive'
                  >
                    <Trash2 className='me-1.5 size-4' />
                    <Trans>Delete</Trans>
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={clearSelection}
                  >
                    <Trans>Cancel</Trans>
                  </Button>
                </div>
              </div>
            </div>
          ) : !chatActive(selectedChat) ? (
            <div className='bg-muted/50 border-t p-4'>
              <div className='flex items-center justify-between'>
                <p className='text-muted-foreground text-sm'>
                  {selectedChat.status === 'removed'
                    ? <Trans>You were removed from this chat</Trans>
                    : <Trans>You left this chat</Trans>}
                </p>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={handleDeleteChat}
                  disabled={deleteChatMutation.isPending}
                >
                  {deleteChatMutation.isPending ? (
                    <Loader2 className='me-2 size-4 animate-spin' />
                  ) : (
                    <Trash2 className='me-2 size-4' />
                  )}
                  <Trans>Delete chat</Trans>
                </Button>
              </div>
            </div>
          ) : (
            <ChatInput
              ref={chatInputRef}
              newMessage={newMessage}
              setNewMessage={setNewMessage}
              onSendMessage={handleSendMessage}
              isSending={sendMessageMutation.isPending}
              isSendDisabled={!canSendMessage}
              pendingAttachments={pendingAttachments}
              onRemoveAttachment={handleRemoveAttachment}
              onReorderAttachments={handleReorderAttachments}
              onAttachmentSelection={handleAttachmentSelection}
              replyTo={replyTo}
              onClearReply={() => setReplyTo(null)}
              sendMessageErrorMessage={sendAttachmentErrorMessage}
            />
          )}
        </Main>
      </div>

      <ConfirmDialog
        open={showLeaveDialog}
        onOpenChange={(open) => {
          setShowLeaveDialog(open)
          if (!open) setDeleteOnLeave(false)
        }}
        title={t`Leave chat?`}
        desc={t`Are you sure you want to leave "${selectedChat?.name}"? You can be added back by other members.`}
        confirmText={
          leaveChatMutation.isPending ? (
            <>
              <Loader2 className='me-2 size-4 animate-spin' />
              <Trans>Leaving...</Trans>
            </>
          ) : (
            t`Leave`
          )
        }
        destructive
        handleConfirm={handleLeaveChat}
        isLoading={leaveChatMutation.isPending}
      >
        <div className='flex items-center space-x-2 py-2'>
          <Checkbox
            id='delete-on-leave'
            checked={deleteOnLeave}
            onCheckedChange={(checked) => setDeleteOnLeave(checked === true)}
          />
          <Label htmlFor='delete-on-leave' className='text-sm'>
            <Trans>Delete chat history</Trans>
          </Label>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={deleteTargetIds !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetIds(null)
        }}
        title={_(plural(deleteTargetIds?.length ?? 0, {
          one: 'Delete message?',
          other: 'Delete # messages?',
        }))}
        desc={t`This deletes the message for everyone and cannot be undone.`}
        confirmText={
          deleteMessagesMutation.isPending ? (
            <>
              <Loader2 className='me-2 size-4 animate-spin' />
              <Trans>Deleting...</Trans>
            </>
          ) : (
            t`Delete`
          )
        }
        destructive
        handleConfirm={confirmDelete}
        isLoading={deleteMessagesMutation.isPending}
      />

      {selectedChat ? (
        <ForwardDialog
          open={forwardTargetIds !== null}
          onOpenChange={(open) => {
            if (!open) setForwardTargetIds(null)
          }}
          sourceChatId={selectedChat.id}
          messageIds={forwardTargetIds ?? []}
          onForwarded={() => {
            setForwardTargetIds(null)
            clearSelection()
          }}
        />
      ) : null}
      <ChatSettingsDialog open={chatSettingsOpen} onOpenChange={setChatSettingsOpen} />
    </>
  )
}
