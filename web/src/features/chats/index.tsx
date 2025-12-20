import { useEffect, useMemo, useState } from 'react'
import type { Chat } from '@/api/chats'
import { useAuthStore } from '@mochi/common'
import { usePageTitle } from '@/hooks/usePageTitle'
import { cn } from '@mochi/common'
import useChatWebsocket from '@/hooks/useChatWebsocket'
import {
  useInfiniteMessagesQuery,
  useChatsQuery,
  useSendMessageMutation,
} from '@/hooks/useChats'
import { NewChat } from './components/new-chat'
import { ChatSidebar } from './components/chat-sidebar'
import { ChatHeader } from './components/chat-header'
import { ChatMessageList } from './components/chat-message-list'
import { ChatInput } from './components/chat-input'
import { ChatEmptyState } from './components/chat-empty-state'
import {
  type PendingAttachment,
  createPendingAttachment,
  revokePendingAttachmentPreview,
} from './utils'

export function Chats() {
  usePageTitle('Chat')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null)
  const [mobileSelectedChat, setMobileSelectedChat] = useState<Chat | null>(
    null
  )
  const [createConversationDialogOpened, setCreateConversationDialog] =
    useState(false)
  const [newMessage, setNewMessage] = useState('')

  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachment[]
  >([])

  const {
    email: currentUserEmail,
    initialize: initializeAuth,
  } = useAuthStore()

  useEffect(() => {
    initializeAuth()
  }, [initializeAuth])

  const chatsQuery = useChatsQuery()
  const chats = useMemo(
    () => chatsQuery.data?.chats ?? [],
    [chatsQuery.data?.chats]
  )

  const messagesQuery = useInfiniteMessagesQuery(selectedChat?.id ?? undefined)
  const chatMessages = useMemo(
    () => messagesQuery.data?.pages.flatMap((page) => page.messages) ?? [],
    [messagesQuery.data?.pages]
  )

  const sendMessageMutation = useSendMessageMutation({
    onSuccess: () => {
      setNewMessage('')
      clearAttachments()
    },
  })

  const {
    status: websocketStatus,
    retries: websocketRetries,
    forceReconnect: forceWebsocketReconnect,
  } = useChatWebsocket(selectedChat?.id, selectedChat?.key)

  const isLoadingChats = chatsQuery.isLoading
  const isLoadingMessages = messagesQuery.isLoading
  const isSending = sendMessageMutation.isPending
  const chatsErrorMessage =
    chatsQuery.error instanceof Error
      ? chatsQuery.error.message
      : chatsQuery.error
        ? 'Failed to load chats. Please try again.'
        : null
  const messagesErrorMessage =
    messagesQuery.error instanceof Error
      ? messagesQuery.error.message
      : messagesQuery.error
        ? 'Failed to load messages. Please try again.'
        : null
  const sendMessageErrorMessage =
    sendMessageMutation.error instanceof Error
      ? sendMessageMutation.error.message
      : sendMessageMutation.error
        ? 'Failed to send message. Please try again.'
        : null

  const isSendDisabled =
    isSending || (!newMessage.trim() && pendingAttachments.length === 0)

  const clearAttachments = () => {
    pendingAttachments.forEach(revokePendingAttachmentPreview)
    setPendingAttachments([])
  }

  const handleSelectChat = (chat: Chat) => {
    setSelectedChat(chat)
    setMobileSelectedChat(chat)
    setNewMessage('')
    clearAttachments()
    // Update URL with chat ID
    const url = new URL(window.location.href)
    url.searchParams.set('chat', chat.id)
    window.history.pushState({}, '', url.toString())
  }

  const handleBackFromChat = () => {
    setMobileSelectedChat(null)
    // Clear chat from URL
    const url = new URL(window.location.href)
    url.searchParams.delete('chat')
    window.history.pushState({}, '', url.toString())
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedChat) return
    const trimmedMessage = newMessage.trim()
    if (!trimmedMessage && pendingAttachments.length === 0) return

    sendMessageMutation.mutate({
      chatId: selectedChat.id,
      body: trimmedMessage,
      attachments: pendingAttachments.map((a) => a.file),
    })
  }

  const handleAttachmentSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files)
      const newAttachments = files.map(createPendingAttachment)
      setPendingAttachments((prev) => [...prev, ...newAttachments])
    }
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

  const websocketStatusMeta = useMemo(() => {
    if (!selectedChat) {
      return {
        label: 'Realtime idle',
        dotClass: 'bg-muted-foreground',
        textClass: 'text-muted-foreground',
      }
    }

    switch (websocketStatus) {
      case 'ready':
        return { label: 'Live', color: 'bg-green-500' }
      case 'connecting':
        return {
          label:
            websocketRetries > 0
              ? `Reconnecting (${websocketRetries})...`
              : 'Connecting...',
          color: 'bg-yellow-500',
          showSpinner: true,
        }
      case 'error':
        return { label: 'Offline', color: 'bg-red-500' }
      case 'idle':
      case 'closing':
      default:
        return { label: 'Disconnected', color: 'bg-slate-500' }
    }
  }, [selectedChat, websocketStatus, websocketRetries])

  return (
    <main className='flex h-full flex-1 overflow-hidden p-4'>
      <section className='flex h-full min-h-0 w-full gap-4'>
        {/* Left Side - Chat List */}
        <ChatSidebar
          chats={chats}
          isLoading={isLoadingChats}
          error={chatsErrorMessage}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          selectedChat={selectedChat}
          onSelectChat={handleSelectChat}
          onNewChat={() => setCreateConversationDialog(true)}
          onRetry={() => void chatsQuery.refetch()}
        />

        {/* Right Side - Chat Messages */}
        {selectedChat ? (
          <div
            className={cn(
              'border-border bg-card absolute inset-0 start-full z-50 hidden h-full w-full flex-1 flex-col rounded-lg border shadow-sm sm:static sm:z-auto sm:flex',
              mobileSelectedChat && 'start-0 flex'
            )}
          >
            {/* Chat Header */}
            <ChatHeader
              selectedChat={selectedChat}
              onBack={handleBackFromChat}
              websocketStatus={websocketStatus}
              websocketStatusMeta={websocketStatusMeta}
              onReconnect={forceWebsocketReconnect}
            />

            {/* Conversation */}
            <div className='flex min-h-0 flex-1 flex-col gap-2 rounded-md px-4 pt-0 pb-4'>
              <div className='flex size-full min-h-0 flex-1'>
                <div className='chat-text-container relative -me-4 flex min-h-0 flex-1 flex-col overflow-y-hidden'>
                  <ChatMessageList
                    messagesQuery={messagesQuery}
                    chatMessages={chatMessages}
                    isLoadingMessages={isLoadingMessages}
                    messagesErrorMessage={messagesErrorMessage}
                    currentUserEmail={currentUserEmail}
                  />
                </div>
              </div>
              
              {/* Message Input */}
              <ChatInput
                newMessage={newMessage}
                setNewMessage={setNewMessage}
                onSendMessage={handleSendMessage}
                isSending={isSending}
                isSendDisabled={isSendDisabled}
                pendingAttachments={pendingAttachments}
                onRemoveAttachment={handleRemoveAttachment}
                onAttachmentSelection={handleAttachmentSelection}
                sendMessageErrorMessage={sendMessageErrorMessage}
              />
            </div>
          </div>
        ) : (
          <ChatEmptyState onNewChat={() => setCreateConversationDialog(true)} />
        )}
      </section>
      <NewChat
        onOpenChange={setCreateConversationDialog}
        open={createConversationDialogOpened}
      />
    </main>
  )
}
