import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import {
  useAuthStore,
  usePageTitle,
  PageHeader,
  Main,
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Label,
  SubscribeDialog,
  requestHelpers,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  getErrorMessage,
  toast,
  Skeleton,
} from '@mochi/common'
import {
  MoreVertical,
  Settings,
  LogOut,
  Loader2,
  Trash2,
  MessageSquare,
} from 'lucide-react'
import { useSidebarContext } from '@/context/sidebar-context'
import { setLastChat } from '@/hooks/useChatStorage'
import useChatWebsocket from '@/hooks/useChatWebsocket'
import {
  useInfiniteMessagesQuery,
  useChatsQuery,
  useSendMessageMutation,
  useChatDetailQuery,
  useLeaveChatMutation,
  useDeleteChatMutation,
} from '@/hooks/useChats'
import { ChatEmptyState } from './components/chat-empty-state'
import { ChatInput } from './components/chat-input'
import { ChatMessageList } from './components/chat-message-list'
import {
  type PendingAttachment,
  createPendingAttachment,
  revokePendingAttachmentPreview,
} from './utils'

interface SubscriptionCheckResponse {
  exists: boolean
}

export function Chats() {
  usePageTitle('Chat')

  const navigate = useNavigate()
  const { openNewChatDialog, setWebsocketStatus } = useSidebarContext()
  const [newMessage, setNewMessage] = useState('')
  const [subscribeOpen, setSubscribeOpen] = useState(false)
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

  // Subscription check
  const { data: subscriptionData, refetch: refetchSubscription } = useQuery({
    queryKey: ['subscription-check', 'chat'],
    queryFn: async () =>
      requestHelpers.get<SubscriptionCheckResponse>(
        '/chat/-/notifications/check'
      ),
    staleTime: Infinity,
  })

  useEffect(() => {
    if (selectedChatId && subscriptionData?.exists === false) {
      setSubscribeOpen(true)
    }
  }, [selectedChatId, subscriptionData?.exists])

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

  const selectedChat = useMemo(
    () => chats.find((c) => c.id === selectedChatId) ?? null,
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
      toast.error(getErrorMessage(error, 'Failed to leave chat'))
    },
  })

  const handleLeaveChat = () => {
    if (!selectedChat) return
    leaveChatMutation.mutate({ chatId: selectedChat.id, delete: deleteOnLeave })
  }

  // Delete chat (for left chats)
  const deleteChatMutation = useDeleteChatMutation({
    onSuccess: () => {
      toast.success('Chat deleted')
      void navigate({ to: '/' })
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to delete chat'))
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
    if (!selectedChat) return

    const body = newMessage.trim()
    if (!body && pendingAttachments.length === 0) return

    sendMessageMutation.mutate({
      chatId: selectedChat.id,
      body,
      attachments: pendingAttachments.map((a) => a.file),
    })
  }

  // Loading / empty
  if (selectedChatId && chatsQuery.isLoading) {
    return (
      <div className='flex h-full flex-col overflow-hidden'>
        <PageHeader
          title={<Skeleton className='h-6 w-32' />}
          icon={<Skeleton className='size-5 rounded-md' />}
        />
        <Main className='flex min-h-0 flex-1 flex-col overflow-hidden'>
           <div className='flex w-full flex-col justify-end gap-3 p-4 flex-1'>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={`flex w-full flex-col gap-1 ${i % 2 === 0 ? 'items-start' : 'items-end'}`}>
                  <Skeleton className={`h-10 w-[60%] rounded-[16px] ${i % 2 === 0 ? 'rounded-bl-[4px]' : 'rounded-br-[4px]'}`} />
                  <Skeleton className='h-3 w-12 rounded-full' />
                </div>
              ))}
           </div>
           <div className="p-4 border-t">
              <Skeleton className="h-10 w-full rounded-md" />
           </div>
        </Main>
      </div>
    )
  }

  if (!selectedChat) {
    return (
      <ChatEmptyState
        onNewChat={openNewChatDialog}
        hasExistingChats={chats.length > 0}
      />
    )
  }

  return (
    <>
      <div className='flex h-full flex-col overflow-hidden'>
        <PageHeader
          title={selectedChat.name}
          icon={<MessageSquare className='size-4 md:size-5' />}
          description={subtitle || undefined}
          actions={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='ghost' size='icon'>
                  <MoreVertical className='size-5' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' className='w-56'>
                {selectedChat.left ? (
                  <DropdownMenuItem onClick={handleDeleteChat}>
                    <Trash2 className='mr-2 size-4' /> Delete chat
                  </DropdownMenuItem>
                ) : (
                  <>
                    <DropdownMenuItem
                      onClick={() => setShowLeaveDialog(true)}
                    >
                      <LogOut className='mr-2 size-4' /> Leave chat
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        void navigate({
                          to: '/$chatId/settings',
                          params: { chatId: selectedChat.id },
                        })
                      }
                    >
                      <Settings className='mr-2 size-4' /> Chat settings
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />

        <Main className='flex min-h-0 flex-1 flex-col overflow-hidden'>
          <ChatMessageList
            messagesQuery={messagesQuery}
            chatMessages={chatMessages}
            isLoadingMessages={messagesQuery.isLoading}
            messagesErrorMessage={messagesQuery.error?.message ?? null}
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
              isSendDisabled={sendMessageMutation.isPending}
              pendingAttachments={pendingAttachments}
              onRemoveAttachment={handleRemoveAttachment}
              onMoveAttachment={handleMoveAttachment}
              onAttachmentSelection={handleAttachmentSelection}
              sendMessageErrorMessage={
                sendMessageMutation.error?.message ?? null
              }
            />
          )}
        </Main>
      </div>

      <SubscribeDialog
        open={subscribeOpen}
        onOpenChange={setSubscribeOpen}
        app='chat'
        label='Chat messages'
        appBase='/chat'
        onResult={() => refetchSubscription()}
      />

      <AlertDialog
        open={showLeaveDialog}
        onOpenChange={(open) => {
          setShowLeaveDialog(open)
          if (!open) setDeleteOnLeave(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave chat?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to leave "{selectedChat?.name}"? You can be
              added back by other members.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='flex items-center space-x-2 py-2'>
            <Checkbox
              id='delete-on-leave'
              checked={deleteOnLeave}
              onCheckedChange={(checked) => setDeleteOnLeave(checked === true)}
            />
            <Label htmlFor='delete-on-leave' className='text-sm'>
              Delete chat history
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={leaveChatMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={handleLeaveChat}
              disabled={leaveChatMutation.isPending}
            >
              {leaveChatMutation.isPending ? (
                <>
                  <Loader2 className='mr-2 size-4 animate-spin' />
                  Leaving...
                </>
              ) : (
                'Leave'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
