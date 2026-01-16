import { useEffect, useMemo, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  useAuthStore,
  usePageTitle,
  PageHeader,
  Main,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SubscribeDialog,
  requestHelpers,
} from '@mochi/common'
import { MoreVertical, Search, User, Users, Info, MessageSquare } from 'lucide-react'

import { useSidebarContext } from '@/context/sidebar-context'
import useChatWebsocket from '@/hooks/useChatWebsocket'
import {
  useInfiniteMessagesQuery,
  useChatsQuery,
  useSendMessageMutation,
  useChatDetailQuery,
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

  const { openNewChatDialog, setWebsocketStatus } = useSidebarContext()
  const [newMessage, setNewMessage] = useState('')
  const [subscribeOpen, setSubscribeOpen] = useState(false)

  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([])

  const {
    email: currentUserEmail,
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
      requestHelpers.get<SubscriptionCheckResponse>('/chat/-/notifications/check'),
    staleTime: Infinity,
  })

  useEffect(() => {
    if (selectedChatId && subscriptionData?.exists === false) {
      setSubscribeOpen(true)
    }
  }, [selectedChatId, subscriptionData?.exists])

  // Chats list
  const chatsQuery = useChatsQuery()
  const chats = useMemo(() => chatsQuery.data?.chats ?? [], [chatsQuery.data?.chats])

  const selectedChat = useMemo(
    () => chats.find((c) => c.id === selectedChatId) ?? null,
    [chats, selectedChatId]
  )

  // Chat detail (members, names)
  const { data: chatDetail } = useChatDetailQuery(selectedChat?.id)

  const subtitle = useMemo(() => {
    if (!chatDetail?.members || chatDetail.members.length <= 2) return null

    const names = chatDetail.members.map((m) => m.name)
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

  // WebSocket
  const { status, retries } = useChatWebsocket(selectedChat?.id, selectedChat?.key)
  useEffect(() => {
    setWebsocketStatus(status, retries)
  }, [status, retries, setWebsocketStatus])

  const clearAttachments = () => {
    pendingAttachments.forEach(revokePendingAttachmentPreview)
    setPendingAttachments([])
  }

  const handleAttachmentSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
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
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading…</div>
  }

  if (!selectedChat) {
    return <ChatEmptyState onNewChat={openNewChatDialog} hasExistingChats={chats.length > 0} />
  }

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden">
        <PageHeader
          title={selectedChat.name}
          icon={<MessageSquare className="size-4 md:size-5" />}
          description={subtitle || undefined}
          actions={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="size-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {selectedChat.members > 2 && (
                  <DropdownMenuItem disabled>
                    <Users className="mr-2 size-4" /> Add members
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem disabled>
                  {selectedChat.members > 2 ? <Info className="mr-2 size-4" /> : <User className="mr-2 size-4" />}
                  {selectedChat.members > 2 ? 'Group info' : 'View profile'}
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <Search className="mr-2 size-4" /> Search
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />

        <Main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ChatMessageList
            messagesQuery={messagesQuery}
            chatMessages={chatMessages}
            isLoadingMessages={messagesQuery.isLoading}
            messagesErrorMessage={messagesQuery.error?.message ?? null}
            currentUserEmail={currentUserEmail}
            currentUserName={currentUserName}
            isGroupChat={selectedChat ? selectedChat.members > 2 : false}
          />

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
            sendMessageErrorMessage={sendMessageMutation.error?.message ?? null}
          />
        </Main>
      </div>

      <SubscribeDialog
        open={subscribeOpen}
        onOpenChange={setSubscribeOpen}
        app="chat"
        label="Chat messages"
        appBase="/chat"
        onResult={() => refetchSubscription()}
      />
    </>
  )
}
