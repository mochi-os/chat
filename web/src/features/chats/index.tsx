import { useEffect, useMemo, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import {
  useAuthStore,
  usePageTitle,
  Header,
  Main,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@mochi/common'
import { MoreVertical, Search, User, Users, Info } from 'lucide-react'
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

export function Chats() {
  usePageTitle('Chat')
  const { openNewChatDialog, setWebsocketStatus } = useSidebarContext()
  const [newMessage, setNewMessage] = useState('')

  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachment[]
  >([])

  const {
    email: currentUserEmail,
    name: currentUserName,
    initialize: initializeAuth,
  } = useAuthStore()

  useEffect(() => {
    initializeAuth()
  }, [initializeAuth])

  // Get selected chat from URL path
  const params = useParams({ strict: false }) as { chatId?: string }
  const selectedChatId = params?.chatId

  const chatsQuery = useChatsQuery()
  const chats = useMemo(
    () => chatsQuery.data?.chats ?? [],
    [chatsQuery.data?.chats]
  )

  // Find selected chat object from ID
  const selectedChat = useMemo(
    () => chats.find((c) => c.id === selectedChatId) ?? null,
    [chats, selectedChatId]
  )

  const messagesQuery = useInfiniteMessagesQuery(selectedChat?.id ?? undefined)

  const { data: chatDetail } = useChatDetailQuery(selectedChat?.id)

  const subtitle = useMemo(() => {
    if (!chatDetail?.members || chatDetail.members.length <= 2) return null

    // Sort names to put "You" first if found
    const names = chatDetail.members.map((m) => m.name)
    // Try to find current user by name since ID might not be easily available for comparison
    // If we had IDs, mapping would be more robust
    const myNameIndex = names.indexOf(currentUserName || '')

    let displayNames = [...names]
    if (myNameIndex !== -1) {
      displayNames[myNameIndex] = 'You'
      // Move to front
      displayNames = [
        'You',
        ...displayNames.filter((_, i) => i !== myNameIndex),
      ]
    }

    return displayNames.join(', ')
  }, [chatDetail, currentUserName])

  const chatMessages = useMemo(() => {
    if (!messagesQuery.data?.pages) return []
    // Pages are loaded newest-first, so reverse to get chronological order
    // (older messages from later pages should appear first)
    const reversedPages = [...messagesQuery.data.pages].reverse()
    return reversedPages.flatMap((page) => page.messages)
  }, [messagesQuery.data?.pages])

  const sendMessageMutation = useSendMessageMutation({
    onSuccess: () => {
      setNewMessage('')
      clearAttachments()
    },
  })

  const { status: websocketStatus, retries: websocketRetries } =
    useChatWebsocket(selectedChat?.id, selectedChat?.key)

  // Update websocket status in sidebar context
  useEffect(() => {
    setWebsocketStatus(websocketStatus, websocketRetries)
  }, [websocketStatus, websocketRetries, setWebsocketStatus])

  const isLoadingMessages = messagesQuery.isLoading
  const isSending = sendMessageMutation.isPending
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

  const handleAttachmentSelection = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
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

  const handleMoveAttachment = (id: string, direction: 'left' | 'right') => {
    setPendingAttachments((prev) => {
      const index = prev.findIndex((a) => a.id === id)
      if (index === -1) return prev
      const newIndex = direction === 'left' ? index - 1 : index + 1
      if (newIndex < 0 || newIndex >= prev.length) return prev
      const newArr = [...prev]
      ;[newArr[index], newArr[newIndex]] = [newArr[newIndex], newArr[index]]
      return newArr
    })
  }

  // Show loading state while chats are loading and we have a chatId in URL
  if (selectedChatId && chatsQuery.isLoading) {
    return (
      <div className='flex h-full flex-1 items-center justify-center'>
        <div className='text-muted-foreground text-sm'>Loading...</div>
      </div>
    )
  }

  // Show empty state if no chat selected
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
      <Header>
        <div className='flex w-full items-center justify-between gap-4'>
          <div className='flex min-w-0 flex-col'>
            <h1 className='truncate text-lg font-semibold'>
              {selectedChat.name}
            </h1>
            {subtitle && (
              <span className='text-muted-foreground truncate text-xs'>
                {subtitle}
              </span>
            )}
          </div>

          <div className='flex shrink-0 items-center'>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='ghost' size='icon'>
                  <MoreVertical className='size-5' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' className='w-56'>
                {selectedChat.members > 2 && (
                  <DropdownMenuItem disabled>
                    <Users className='mr-2 size-4' />
                    <span>Add members</span>
                  </DropdownMenuItem>
                )}

                <DropdownMenuItem disabled>
                  {selectedChat.members > 2 ? (
                    <Info className='mr-2 size-4' />
                  ) : (
                    <User className='mr-2 size-4' />
                  )}
                  <span>
                    {selectedChat.members > 2 ? 'Group info' : 'View profile'}
                  </span>
                </DropdownMenuItem>

                <DropdownMenuItem disabled>
                  <Search className='mr-2 size-4' />
                  <span>Search</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </Header>
      <Main className='flex h-full flex-1 flex-col overflow-hidden'>
        {/* Conversation */}
        <div className='flex size-full min-h-0 flex-1'>
          <div className='chat-text-container relative -me-4 flex min-h-0 flex-1 flex-col overflow-y-hidden'>
            <ChatMessageList
              messagesQuery={messagesQuery}
              chatMessages={chatMessages}
              isLoadingMessages={isLoadingMessages}
              messagesErrorMessage={messagesErrorMessage}
              currentUserEmail={currentUserEmail}
              currentUserName={currentUserName}
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
          onMoveAttachment={handleMoveAttachment}
          onAttachmentSelection={handleAttachmentSelection}
          sendMessageErrorMessage={sendMessageErrorMessage}
        />
      </Main>
    </>
  )
}
