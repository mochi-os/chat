import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import useChatWebsocket from '@/hooks/useChatWebsocket'
import {
  useInfiniteMessagesQuery,
  useChatsQuery,
  useSendMessageMutation,
} from '@/hooks/useChats'
import type {
  Chat,
} from '@/api/chats'
import {
  NewChat,
} from './components/new-chat'
import { cn } from '@/lib/utils'
import { TopBar } from '@/components/layout/top-bar'
import { ChatSidebar } from './components/chat-sidebar'
import { ChatEmptyState } from './components/chat-empty-state'
import { ChatHeader } from './components/chat-header'
import { ChatMessageList } from './components/chat-message-list'
import { ChatInput } from './components/chat-input'
import {
  createPendingAttachment,
  type PendingAttachment,
  revokePendingAttachmentPreview,
} from './utils'

export function Chats() {
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
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const pendingAttachmentsRef = useRef<PendingAttachment[]>([])

  // Keep ref in sync
  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments
  }, [pendingAttachments])

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
      
      // We rely on the message list component to handle scroll on new messages
      // via `isLoading` state or length change if needed, but since optimistic update
      // happens inside mutation hooks (if implemented there?) or re-fetch.
      // Current implementation in useChats.ts does optimistic update of *chat list* preview, 
      // but only invalidates messages. 
      // So we wait for re-fetch.
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

  const handleSelectChat = (chat: Chat) => {
    setSelectedChat(chat)
    setMobileSelectedChat(chat)
    setNewMessage('')
    clearAttachments()
  }

  const clearAttachments = () => {
    pendingAttachments.forEach(revokePendingAttachmentPreview)
    setPendingAttachments([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
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
      return { label: 'Disconnected', color: 'bg-slate-500' }
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
    <>
      <div className='flex h-screen flex-col overflow-hidden bg-slate-50 dark:bg-black'>
        <TopBar />
        <main className='flex flex-1 gap-4 overflow-hidden p-4 pt-1'>
          {/* Chat List Sidebar */}
          <section
            className={cn(
               'flex w-full shrink-0 flex-col sm:w-auto',
               mobileSelectedChat ? 'hidden sm:flex' : 'flex'
            )}
          >
             <ChatSidebar
               chats={chats}
               isLoading={isLoadingChats}
               error={chatsErrorMessage}
               searchQuery={searchQuery}
               setSearchQuery={setSearchQuery}
               selectedChat={selectedChat}
               onSelectChat={handleSelectChat}
               onNewChat={() => setCreateConversationDialog(true)}
               onRetry={() => chatsQuery.refetch()}
             />
          </section>

          {/* Chat Area */}
          <section className='bg-background flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border shadow-sm'>
             {!selectedChat ? (
               <ChatEmptyState onNewChat={() => setCreateConversationDialog(true)} />
             ) : (
                <div 
                   className={cn(
                      'flex h-full flex-col',
                      !mobileSelectedChat ? 'hidden sm:flex' : 'flex'
                   )}
                >
                   <ChatHeader
                     selectedChat={selectedChat}
                     onBack={() => setMobileSelectedChat(null)}
                     websocketStatus={websocketStatus}
                     websocketStatusMeta={websocketStatusMeta}
                     onReconnect={forceWebsocketReconnect}
                   />
                   
                   <div className='flex min-h-0 flex-1 flex-col gap-2 rounded-md px-4 pt-0 pb-4'>
                      <div className='flex size-full min-h-0 flex-1'>
                         <div className='relative -me-4 flex min-h-0 flex-1 flex-col overflow-y-hidden'>
                            <ChatMessageList
                               messagesQuery={messagesQuery}
                               chatMessages={chatMessages}
                               isLoadingMessages={isLoadingMessages}
                               messagesErrorMessage={messagesErrorMessage}
                               currentUserEmail={currentUserEmail}
                            />
                         </div>
                      </div>
                      
                      <ChatInput
                        newMessage={newMessage}
                        setNewMessage={setNewMessage}
                        onSendMessage={handleSendMessage}
                        isSending={isSending}
                        fileInputRef={fileInputRef}
                        pendingAttachments={pendingAttachments}
                        onRemoveAttachment={handleRemoveAttachment}
                        onAttachClick={() => fileInputRef.current?.click()}
                        onFileSelect={handleAttachmentSelection}
                      />
                   </div>
                </div>
             )}
          </section>
        </main>
      </div>
      <NewChat
        onOpenChange={setCreateConversationDialog}
        open={createConversationDialogOpened}
      />
    </>
  )
}
