import { useEffect, useMemo, useRef, useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { useAuthStore, usePageTitle, PageHeader, Main, GeneralError, Button, Checkbox, ConfirmDialog, EntityAvatar, IconButton, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Label, toast, getErrorMessage } from '@mochi/web'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { ChatSkeleton } from './components/chat-skeleton'
import {
  MoreHorizontal,
  Settings,
  LogOut,
  Loader2,
  Trash2,
  MessageCircle,
} from 'lucide-react'
import { useSidebarContext } from '@/context/sidebar-context'
import { setLastChat } from '@/hooks/useChatStorage'
import { useChatWebsocket } from '@/hooks/useChatWebsocket'
import {
  useInfiniteMessagesQuery,
  useChatsQuery,
  useSendMessageMutation,
  useChatDetailQuery,
  useLeaveChatMutation,
  useDeleteChatMutation,
  useCreateChatMutation,
} from '@/hooks/useChats'
import { ChatEmptyState } from './components/chat-empty-state'
import { ChatInput } from './components/chat-input'
import { ChatMessageList } from './components/chat-message-list'
import {
  type PendingAttachment,
  createPendingAttachment,
  revokePendingAttachmentPreview,
} from './utils'

export function Chats() {
  const { t } = useLingui()
  usePageTitle(t`Chat`)

  const navigate = useNavigate()
  const { openNewChatDialog, setWebsocketStatus } = useSidebarContext()
  const [newMessage, setNewMessage] = useState('')
  const [showLeaveDialog, setShowLeaveDialog] = useState(false)
  const [deleteOnLeave, setDeleteOnLeave] = useState(false)

  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachment[]
  >([])

  const {
    identity: currentUserIdentity,
    name: currentUserName,
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
    deepLinkHandled.current = true

    const existing = chats.find(
      (c) => c.members === 2 && c.other === search.with && !c.left
    )
    if (existing) {
      void navigate({ to: '/$chatId', params: { chatId: existing.id }, replace: true })
      return
    }

    createChatMutation.mutate(
      { members: search.with, name: (search.name || 'Chat').trim() || 'Chat' },
      {
        onSuccess: (data) => {
          if (data?.id) {
            void navigate({
              to: '/$chatId',
              params: { chatId: data.fingerprint ?? data.id },
              replace: true,
            })
          }
        },
        onError: (error) => {
          deepLinkHandled.current = false
          toast.error(getErrorMessage(error, t`Failed to start chat`))
        },
      }
    )
  }, [search.with, search.name, selectedChatId, chats, chatsQuery.isLoading, createChatMutation, navigate])

  const selectedChat = useMemo(
    () =>
      chats.find(
        (c) => c.id === selectedChatId || c.fingerprint === selectedChatId
      ) ?? null,
    [chats, selectedChatId]
  )

  // Chat detail (members, names)
  const { data: chatDetail } = useChatDetailQuery(selectedChat?.id)

  const subtitle = useMemo(() => {
    if (!chatDetail?.chat.members || chatDetail.chat.members.length <= 2) return null

    const names = chatDetail.chat.members.map((m) => m.name)
    const myIndex = names.indexOf(currentUserName || '')

    let display = [...names]
    if (myIndex !== -1) {
      display[myIndex] = 'You'
      display = ['You', ...display.filter((_, i) => i !== myIndex)]
    }

    return display.join(', ')
  }, [chatDetail, currentUserName])

  // Messages
  const messagesQuery = useInfiniteMessagesQuery(selectedChat?.id)
  const chatMessages = useMemo(() => {
    if (!messagesQuery.data?.pages) return []
    return [...messagesQuery.data.pages].reverse().flatMap((p) => p.messages)
  }, [messagesQuery.data?.pages])

  // Send message
  const sendMessageMutation = useSendMessageMutation({
    onSuccess: () => {
      setNewMessage('')
      clearAttachments()
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
    onError: (error) => {
      toast.error(getErrorMessage(error, t`Failed to leave chat`))
    },
  })

  const handleLeaveChat = () => {
    if (!selectedChat) return
    leaveChatMutation.mutate({ chatId: selectedChat.id, delete: deleteOnLeave })
  }

  // Delete chat (for left chats)
  const deleteChatMutation = useDeleteChatMutation({
    onSuccess: () => {
      toast.success(t`Chat deleted`)
      void navigate({ to: '/' })
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t`Failed to delete chat`))
    },
  })

  const handleDeleteChat = () => {
    if (!selectedChat) return
    deleteChatMutation.mutate({ chatId: selectedChat.id })
  }

  // WebSocket
  const { status, retries } = useChatWebsocket(
    selectedChat?.id,
    selectedChat?.key
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

  const handleMoveAttachment = (id: string, direction: 'left' | 'right') => {
    setPendingAttachments((prev) => {
      const index = prev.findIndex((a) => a.id === id)
      if (index === -1) return prev

      const newAttachments = [...prev]
      const targetIndex = direction === 'left' ? index - 1 : index + 1

      if (targetIndex >= 0 && targetIndex < newAttachments.length) {
        ;[newAttachments[index], newAttachments[targetIndex]] = [
          newAttachments[targetIndex],
          newAttachments[index],
        ]
      }
      return newAttachments
    })
  }

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedChat || sendMessageMutation.isPending) return

    const body = newMessage.trim()
    if (!body && pendingAttachments.length === 0) {
      if (import.meta.env.DEV) {
        globalThis.console?.warn?.('[chat] blocked empty message submit')
      }
      return
    }

    sendMessageMutation.mutate({
      chatId: selectedChat.id,
      body,
      attachments: pendingAttachments.map((a) => a.file),
    })
  }

  const canSendMessage =
    !sendMessageMutation.isPending &&
    (Boolean(newMessage.trim()) || pendingAttachments.length > 0)

  // Loading state: show full skeleton (includes its own PageHeader + Main)
  if (selectedChatId && chatsQuery.isLoading) {
    return <ChatSkeleton />
  }

  if (!selectedChat) {
    return (
      <div className='flex h-full flex-col overflow-hidden'>
        <PageHeader title={t`Chat`} icon={<MessageCircle className='size-4 md:size-5' />} />
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
        <PageHeader
          title={selectedChat.name}
          icon={
            selectedChat.members === 2 && selectedChat.other ? (
              <EntityAvatar
                src={`/people/${selectedChat.other}/-/avatar`}
                styleUrl={`/people/${selectedChat.other}/-/style`}
                size="xl"
              />
            ) : (
              <MessageCircle className='size-4 md:size-5' />
            )
          }
          description={subtitle || undefined}
          menuAction={
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
                {selectedChat.left ? (
                  <DropdownMenuItem onClick={handleDeleteChat}>
                    <Trash2 className='mr-2 size-4' /> <Trans>Delete chat</Trans>
                  </DropdownMenuItem>
                ) : (
                  <>
                    <DropdownMenuItem
                      onClick={() => setShowLeaveDialog(true)}
                    >
                      <LogOut className='mr-2 size-4' /> <Trans>Leave chat</Trans>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        void navigate({
                          to: '/$chatId/settings',
                          params: { chatId: selectedChat.id },
                        })
                      }
                    >
                      <Settings className='mr-2 size-4' /> <Trans>Chat settings</Trans>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />

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
            messagesQuery={messagesQuery}
            chatMessages={chatMessages}
            isLoadingMessages={messagesQuery.isLoading}
            messagesError={messagesQuery.error}
            currentUserIdentity={currentUserIdentity}
            isGroupChat={(chatDetail?.chat.members?.length ?? 0) > 2}
          />

          {selectedChat.left ? (
            <div className='bg-muted/50 border-t p-4'>
              <div className='flex items-center justify-between'>
                <p className='text-muted-foreground text-sm'>
                  {selectedChat.left === 2
                    ? 'You were removed from this chat'
                    : 'You left this chat'}
                </p>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={handleDeleteChat}
                  disabled={deleteChatMutation.isPending}
                >
                  {deleteChatMutation.isPending ? (
                    <Loader2 className='mr-2 size-4 animate-spin' />
                  ) : (
                    <Trash2 className='mr-2 size-4' />
                  )}
                  Delete chat
                </Button>
              </div>
            </div>
          ) : (
            <ChatInput
              newMessage={newMessage}
              setNewMessage={setNewMessage}
              onSendMessage={handleSendMessage}
              isSending={sendMessageMutation.isPending}
              isSendDisabled={!canSendMessage}
              pendingAttachments={pendingAttachments}
              onRemoveAttachment={handleRemoveAttachment}
              onMoveAttachment={handleMoveAttachment}
              onAttachmentSelection={handleAttachmentSelection}
              sendMessageErrorMessage={
                sendMessageMutation.error
                  ? getErrorMessage(sendMessageMutation.error, t`Failed to send message`)
                  : null
              }
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
        desc={`Are you sure you want to leave "${selectedChat?.name}"? You can be added back by other members.`}
        confirmText={
          leaveChatMutation.isPending ? (
            <>
              <Loader2 className='mr-2 size-4 animate-spin' />
              <Trans>Leaving...</Trans>
            </>
          ) : (
            'Leave'
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
    </>
  )
}
