import { useEffect, useMemo, useRef, useState } from 'react'
import { Fragment } from 'react/jsx-runtime'
import { format } from 'date-fns'
import {
  ArrowLeft,
  MoreVertical,
  Edit,
  Paperclip,
  Phone,
  Search as SearchIcon,
  Send,
  Video,
  MessagesSquare,
  Loader2,
  CheckCheck,
  FileText,
  X,
  RotateCcw,
  MessageSquarePlus,
} from 'lucide-react'
import {
  type Chat,
  type ChatMessageAttachment,
} from '@/api/chats'
import { useAuthStore } from '@mochi/common'
import { cn } from '@mochi/common'
import useChatWebsocket from '@/hooks/useChatWebsocket'
import {
  useInfiniteMessagesQuery,
  useChatsQuery,
  useSendMessageMutation,
} from '@/hooks/useChats'
import { Avatar, AvatarFallback } from '@mochi/common'
import { Button } from '@mochi/common'
import { ScrollArea } from '@mochi/common'
import { Separator } from '@mochi/common'
import { NewChat } from './components/new-chat'

type AttachmentKind = 'image' | 'video' | 'file'

interface PendingAttachment {
  id: string
  file: File
  kind: AttachmentKind
  previewUrl?: string
}

const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'bmp',
  'svg',
  'webp',
  'heic',
  'avif',
])
const VIDEO_EXTENSIONS = new Set([
  'mp4',
  'mov',
  'mkv',
  'avi',
  'webm',
  'm4v',
  'mpeg',
  'mpg',
])

const getFileExtension = (value?: string) => {
  if (!value) return undefined
  const withoutQuery = value.split('?')[0]
  const parts = withoutQuery.split('.')
  if (parts.length < 2) return undefined
  return parts.pop()?.toLowerCase()
}

const detectAttachmentKind = (
  mime?: string,
  fallbackName?: string
): AttachmentKind => {
  const normalizedMime = mime?.toLowerCase() ?? ''
  if (normalizedMime.startsWith('image/')) {
    return 'image'
  }
  if (normalizedMime.startsWith('video/')) {
    return 'video'
  }
  const extension = getFileExtension(fallbackName)
  if (extension) {
    if (IMAGE_EXTENSIONS.has(extension)) {
      return 'image'
    }
    if (VIDEO_EXTENSIONS.has(extension)) {
      return 'video'
    }
  }
  return 'file'
}

const createPendingAttachment = (file: File): PendingAttachment => {
  const kind = detectAttachmentKind(file.type, file.name)
  return {
    id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    kind,
    previewUrl: kind === 'file' ? undefined : URL.createObjectURL(file),
  }
}

const revokePendingAttachmentPreview = (attachment: PendingAttachment) => {
  if (attachment.previewUrl) {
    URL.revokeObjectURL(attachment.previewUrl)
  }
}

const detectRemoteAttachmentKind = (
  attachment: ChatMessageAttachment
): AttachmentKind =>
  detectAttachmentKind(attachment.type, attachment.name ?? attachment.url)

interface MessageAttachmentPreviewProps {
  attachment: ChatMessageAttachment
  index: number
}

const MessageAttachmentPreview = ({
  attachment,
  index,
}: MessageAttachmentPreviewProps) => {
  const kind = detectRemoteAttachmentKind(attachment)
  const sizeLabel = formatFileSize(attachment.size)

  if (kind === 'image') {
    return (
      <a
        href={attachment.url}
        target='_blank'
        rel='noopener noreferrer'
        className='block'
      >
        <img
          src={attachment.url}
          alt={attachment.name ?? `Attachment ${index + 1}`}
          className='max-h-48 max-w-full rounded-lg object-cover'
        />
      </a>
    )
  }

  if (kind === 'video') {
    return (
      <video
        src={attachment.url}
        controls
        className='max-h-48 max-w-full rounded-lg'
      />
    )
  }

  return (
    <a
      href={attachment.url}
      target='_blank'
      rel='noopener noreferrer'
      className='bg-muted/50 hover:bg-muted flex items-center gap-2 rounded-lg px-3 py-2 transition-colors'
    >
      <FileText className='text-muted-foreground h-5 w-5' />
      <div className='min-w-0 flex-1'>
        <p className='truncate text-xs font-medium'>
          {attachment.name ?? 'File'}
        </p>
        {sizeLabel && (
          <p className='text-muted-foreground text-[10px]'>{sizeLabel}</p>
        )}
      </div>
    </a>
  )
}

const formatFileSize = (bytes?: number): string | undefined => {
  if (bytes === undefined) {
    return undefined
  }
  if (bytes === 0) {
    return '0 B'
  }
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

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

  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    initializeAuth()
  }, [initializeAuth])

  const chatsQuery = useChatsQuery()
  const chats = useMemo(
    () => chatsQuery.data?.chats ?? [],
    [chatsQuery.data?.chats]
  )

  const filteredChatList = useMemo(() => {
    if (!searchQuery.trim()) return chats
    const query = searchQuery.toLowerCase()
    return chats.filter(
      (chat) =>
        chat.name.toLowerCase().includes(query) ||
        (chat.key && chat.key.toLowerCase().includes(query))
    )
  }, [chats, searchQuery])
  
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
  const sendMessageErrorMessage =
    sendMessageMutation.error instanceof Error
      ? sendMessageMutation.error.message
      : sendMessageMutation.error
        ? 'Failed to send message. Please try again.'
        : null

  const isCurrentUserMessage = (message: { email?: string }) =>
    message.email === currentUserEmail

  const groupedMessages = useMemo(() => {
    const groups: Record<string, typeof chatMessages> = {}
    chatMessages.forEach((message) => {
      const date = format(new Date(message.created * 1000), 'MMMM d, yyyy')
      if (!groups[date]) {
        groups[date] = []
      }
      groups[date].push(message)
    })
    return groups
  }, [chatMessages])

  const hasPendingAttachments = pendingAttachments.length > 0
  const isSendDisabled =
    isSending || (!newMessage.trim() && pendingAttachments.length === 0)

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

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
    <main className='flex-1 overflow-hidden px-4 py-4 sm:px-6'>
        <section className='flex h-full min-h-0 gap-6'>
          {/* Left Side */}
          <div className='flex w-full flex-col gap-2 sm:w-56 lg:w-72 2xl:w-80'>
            <div className='bg-background sticky top-0 z-10 -mx-4 px-4 pb-3 shadow-md sm:static sm:z-auto sm:mx-0 sm:p-0 sm:shadow-none'>
              <div className='flex items-center justify-between py-2'>
                <div className='flex gap-2'>
                  <h1 className='text-2xl font-bold'>Inbox</h1>
                  <MessagesSquare size={20} />
                </div>

                <Button
                  size='icon'
                  variant='ghost'
                  onClick={() => setCreateConversationDialog(true)}
                  className='rounded-lg'
                >
                  <Edit size={24} className='stroke-muted-foreground' />
                </Button>
              </div>

              <label
                className={cn(
                  'focus-within:ring-ring focus-within:ring-1 focus-within:outline-hidden',
                  'border-border flex h-10 w-full items-center space-x-0 rounded-md border ps-2'
                )}
              >
                <SearchIcon size={15} className='me-2 stroke-slate-500' />
                <span className='sr-only'>Search</span>
                <input
                  type='text'
                  className='w-full flex-1 bg-inherit text-sm focus-visible:outline-hidden'
                  placeholder='Search chat...'
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </label>
            </div>

            <ScrollArea className='-mx-3 h-full overflow-scroll p-3'>
              {isLoadingChats ? (
                <div className='flex items-center justify-center py-8'>
                  <Loader2 className='h-6 w-6 animate-spin' />
                  <span className='text-muted-foreground ml-2 text-sm'>
                    Loading chats...
                  </span>
                </div>
              ) : chatsErrorMessage ? (
                <div className='flex flex-col items-center justify-center py-8 text-center'>
                  <MessagesSquare className='text-muted-foreground mb-2 h-8 w-8' />
                  <p className='text-muted-foreground text-sm'>
                    {chatsErrorMessage}
                  </p>
                      <Button
                        variant='outline'
                        size='sm'
                        className='mt-2'
                        onClick={() => {
                          void chatsQuery.refetch()
                        }}
                      >
                        <RotateCcw className='mr-1.5 h-4 w-4' />
                        Retry
                      </Button>
                </div>
              ) : filteredChatList.length === 0 ? (
                <div className='flex flex-col items-center justify-center py-8 text-center'>
                  <MessagesSquare className='text-muted-foreground mb-2 h-8 w-8' />
                  <p className='text-muted-foreground text-sm'>
                    {searchQuery
                      ? 'No chats found matching your search.'
                      : 'No chats available.'}
                  </p>
                    {!searchQuery && (
                      <Button
                        variant='outline'
                        size='sm'
                        className='mt-2'
                        onClick={() => setCreateConversationDialog(true)}
                      >
                        <MessageSquarePlus className='mr-1.5 h-4 w-4' />
                        Start a conversation
                      </Button>
                    )}
                </div>
              ) : (
                filteredChatList.map((chat) => {
                  return (
                    <Fragment key={chat.id}>
                      <button
                        type='button'
                        className={cn(
                          'group hover:bg-accent hover:text-accent-foreground',
                          `flex w-full rounded-md px-2 py-2 text-start text-sm`,
                          selectedChat?.id === chat.id && 'sm:bg-muted'
                        )}
                        onClick={() => {
                          setSelectedChat(chat)
                          setMobileSelectedChat(chat)
                          // Update URL with chat ID
                          const url = new URL(window.location.href)
                          url.searchParams.set('chat', chat.id)
                          window.history.pushState({}, '', url.toString())
                        }}
                      >
                        <div className='flex gap-2'>
                          <Avatar>
                            <AvatarFallback>
                              {chat.name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className='min-w-0 flex-1'>
                            <span className='col-start-2 row-span-2 truncate font-medium'>
                              {chat.name}
                            </span>
                            <span className='text-muted-foreground group-hover:text-accent-foreground/90 col-start-2 row-span-2 row-start-2 line-clamp-2 text-ellipsis'>
                              {chat.key || 'No recent messages'}
                            </span>
                          </div>
                        </div>
                      </button>
                      <Separator className='my-1' />
                    </Fragment>
                  )
                })
              )}
            </ScrollArea>
          </div>

          {/* Right Side */}
          {selectedChat ? (
            <div
              className={cn(
                'bg-background absolute inset-0 start-full z-50 hidden w-full flex-1 flex-col border shadow-xs sm:static sm:z-auto sm:flex sm:rounded-md',
                'min-h-0',
                mobileSelectedChat && 'start-0 flex'
              )}
            >
              {/* Top Part */}
              <div className='bg-card mb-1 flex flex-none justify-between p-4 shadow-lg sm:rounded-t-md'>
                {/* Left */}
                <div className='flex gap-3'>
                  <Button
                    size='icon'
                    variant='ghost'
                    className='-ms-2 h-full sm:hidden'
                    onClick={() => {
                      setMobileSelectedChat(null)
                      // Clear chat from URL
                      const url = new URL(window.location.href)
                      url.searchParams.delete('chat')
                      window.history.pushState({}, '', url.toString())
                    }}
                  >
                    <ArrowLeft className='rtl:rotate-180' />
                  </Button>
                  <div className='flex items-center gap-2 lg:gap-4'>
                    <Avatar className='size-9 lg:size-11'>
                      <AvatarFallback>
                        {selectedChat.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <span className='col-start-2 row-span-2 text-sm font-medium lg:text-base'>
                        {selectedChat.name}
                      </span>
                      {/* <span className='text-muted-foreground col-start-2 row-span-2 row-start-2 line-clamp-1 block max-w-32 text-xs text-nowrap text-ellipsis lg:max-w-none lg:text-sm'>
                        {selectedChat.identity}
                      </span> */}
                      <div className='mt-1 flex flex-wrap items-center gap-2 text-xs'>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1',
                            websocketStatusMeta.textClass
                          )}
                        >
                          <span
                            className={cn(
                              'h-2 w-2 rounded-full',
                              websocketStatusMeta.dotClass
                            )}
                          />
                          {websocketStatusMeta.label}
                        </span>
                        {websocketStatus === 'error' && (
                          <button
                            type='button'
                            className='text-muted-foreground hover:text-foreground underline decoration-dotted underline-offset-2 transition'
                            onClick={() => forceWebsocketReconnect()}
                          >
                            Retry
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right */}
                <div className='-me-1 flex items-center gap-1 lg:gap-2'>
                  <Button
                    size='icon'
                    variant='ghost'
                    className='hidden size-8 rounded-full sm:inline-flex lg:size-10'
                  >
                    <Video size={22} className='stroke-muted-foreground' />
                  </Button>
                  <Button
                    size='icon'
                    variant='ghost'
                    className='hidden size-8 rounded-full sm:inline-flex lg:size-10'
                  >
                    <Phone size={22} className='stroke-muted-foreground' />
                  </Button>
                  <Button
                    size='icon'
                    variant='ghost'
                    className='h-10 rounded-md sm:h-8 sm:w-4 lg:h-10 lg:w-6'
                  >
                    <MoreVertical className='stroke-muted-foreground sm:size-5' />
                  </Button>
                </div>
              </div>

              {/* Conversation */}
              <div className='flex min-h-0 flex-1 flex-col gap-2 rounded-md px-4 pt-0 pb-4'>
                <div className='flex size-full min-h-0 flex-1'>
                  <div className='chat-text-container relative -me-4 flex min-h-0 flex-1 flex-col overflow-y-hidden'>
                    <ScrollArea className='flex h-full w-full flex-1 flex-col justify-start gap-4 py-2 pe-4 pb-4'>
                      {isLoadingMessages ? (
                        <div className='flex items-center justify-center py-8'>
                          <Loader2 className='h-6 w-6 animate-spin' />
                          <span className='text-muted-foreground ml-2 text-sm'>
                            Loading messages...
                          </span>
                        </div>
                      ) : messagesErrorMessage ? (
                        <div className='flex flex-col items-center justify-center py-8 text-center'>
                          <MessagesSquare className='text-muted-foreground mb-2 h-8 w-8' />
                          <p className='text-muted-foreground text-sm'>
                            {messagesErrorMessage}
                          </p>
                          <Button
                            variant='outline'
                            size='sm'
                            className='mt-2'
                            onClick={() => {
                              void messagesQuery.refetch()
                            }}
                          >
                            <RotateCcw className='mr-1.5 h-4 w-4' />
                            Retry
                          </Button>
                        </div>
                      ) : chatMessages.length === 0 ? (
                        <div className='flex flex-col items-center justify-center py-8 text-center'>
                          <MessagesSquare className='text-muted-foreground mb-2 h-8 w-8' />
                          <p className='text-muted-foreground text-sm'>
                            No messages yet
                          </p>
                          <p className='text-muted-foreground text-xs'>
                            Start the conversation!
                          </p>
                        </div>
                      ) : (
                        Object.keys(groupedMessages).map((key) => (
                          <Fragment key={key}>
                            {/* Date separator */}
                            <div className='my-4 flex items-center justify-center'>
                              <div className='bg-muted text-muted-foreground rounded-full px-3 py-1 text-xs font-medium'>
                                {key}
                              </div>
                            </div>

                            {groupedMessages[key].map((message, index) => {
                              const isSent = isCurrentUserMessage(message)
                              return (
                                <div
                                  key={`${message.id}-${index}`}
                                  className={cn(
                                    'mb-1 flex w-full',
                                    isSent ? 'justify-end' : 'justify-start'
                                  )}
                                >
                                  <div
                                    className={cn(
                                      'max-w-[70%] px-4 py-3 break-words shadow-sm',
                                      'rounded-2xl',
                                      isSent
                                        ? 'rounded-br-md bg-blue-500 text-white dark:bg-blue-600'
                                        : 'rounded-bl-md bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100'
                                    )}
                                  >
                                    {/* Sender name for received messages */}
                                    {!isSent && (
                                      <div className='text-muted-foreground mb-1 text-xs font-medium'>
                                        {message.name}
                                      </div>
                                    )}

                                    {/* Message content */}
                                    <div className='text-sm leading-relaxed'>
                                      {message.body}
                                    </div>

                                    {message.attachments?.length ? (
                                      <div className='mt-3 flex flex-wrap gap-3'>
                                        {message.attachments.map(
                                          (attachment, attachmentIndex) => (
                                            <MessageAttachmentPreview
                                              key={
                                                attachment.id ??
                                                `${message.id}-attachment-${attachmentIndex}`
                                              }
                                              attachment={attachment}
                                              index={attachmentIndex}
                                            />
                                          )
                                        )}
                                      </div>
                                    ) : null}

                                    {/* Timestamp and read receipts */}
                                    <div
                                      className={cn(
                                        'mt-2 flex items-center justify-end gap-1 text-xs',
                                        isSent
                                          ? 'text-white/70'
                                          : 'text-gray-600 dark:text-gray-300'
                                      )}
                                    >
                                      <span>
                                        {format(
                                          new Date(message.created * 1000),
                                          'h:mm a'
                                        )}
                                      </span>
                                      {isSent && (
                                        <div className='flex items-center'>
                                          <CheckCheck
                                            size={12}
                                            className='text-green-500'
                                          />
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </Fragment>
                        ))
                      )}
                      <div ref={messagesEndRef} />
                    </ScrollArea>
                  </div>
                </div>
                {/* Message Input */}
                <form
                  onSubmit={handleSendMessage}
                  className='flex w-full flex-none flex-col gap-2'
                >
                  {hasPendingAttachments && (
                    <div className='border-muted bg-muted/40 text-foreground flex w-full flex-wrap gap-3 rounded-3xl border border-dashed px-4 py-3'>
                      {pendingAttachments.map((attachment) => {
                        const sizeLabel = formatFileSize(attachment.file.size)
                        return (
                          <div
                            key={attachment.id}
                            className='border-input bg-background/80 flex min-w-0 items-center gap-3 rounded-2xl border px-3 py-2 shadow-sm'
                          >
                            {attachment.previewUrl &&
                            attachment.kind === 'image' ? (
                              <img
                                src={attachment.previewUrl}
                                alt={attachment.file.name}
                                className='h-12 w-12 rounded-xl object-cover'
                              />
                            ) : attachment.previewUrl &&
                              attachment.kind === 'video' ? (
                              <video
                                src={attachment.previewUrl}
                                className='h-12 w-12 rounded-xl object-cover'
                                muted
                                loop
                                playsInline
                              />
                            ) : (
                              <div className='bg-muted text-muted-foreground flex h-12 w-12 items-center justify-center rounded-xl'>
                                <FileText className='h-5 w-5' />
                              </div>
                            )}
                            <div className='min-w-0 flex-1'>
                              <p className='truncate text-xs font-medium'>
                                {attachment.file.name}
                              </p>
                              {sizeLabel && (
                                <p className='text-muted-foreground text-[10px]'>
                                  {sizeLabel}
                                </p>
                              )}
                            </div>
                            <Button
                              type='button'
                              variant='ghost'
                              size='icon'
                              className='hover:bg-destructive/10 text-muted-foreground h-6 w-6 rounded-full'
                              onClick={() =>
                                handleRemoveAttachment(attachment.id)
                              }
                            >
                              <X className='h-3.5 w-3.5' />
                              <span className='sr-only'>
                                Remove {attachment.file.name}
                              </span>
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <div className='border-input bg-card focus-within:ring-ring flex w-full items-center gap-2 rounded-full border px-4 py-2 focus-within:ring-1 focus-within:outline-hidden'>
                    <div className='flex items-center'>
                      <Button
                        size='icon'
                        type='button'
                        variant='ghost'
                        className='h-8 w-8 rounded-full'
                        onClick={() => fileInputRef.current?.click()}
                        aria-label='Add attachment'
                      >
                        <Paperclip
                          size={16}
                          className='stroke-muted-foreground'
                        />
                      </Button>
                    </div>
                    <label className='flex-1'>
                      <span className='sr-only'>Chat Text Box</span>
                      <input
                        type='text'
                        placeholder='Type your messages...'
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        className='w-full bg-inherit text-sm focus-visible:outline-hidden'
                      />
                    </label>
                    <Button
                      type='submit'
                      size='icon'
                      className='bg-primary hover:bg-primary/90 h-8 w-8 rounded-full'
                      disabled={isSendDisabled}
                    >
                      {isSending ? (
                        <Loader2 size={16} className='animate-spin' />
                      ) : (
                        <Send size={16} />
                      )}
                    </Button>
                    <input
                      ref={fileInputRef}
                      type='file'
                      multiple
                      className='hidden'
                      onChange={handleAttachmentSelection}
                    />
                  </div>
                  {sendMessageErrorMessage && (
                    <p className='text-destructive w-full pe-2 text-right text-xs'>
                      {sendMessageErrorMessage}
                    </p>
                  )}
                </form>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                'bg-card absolute inset-0 start-full z-50 hidden w-full flex-1 flex-col justify-center rounded-md border shadow-xs sm:static sm:z-auto sm:flex'
              )}
            >
              <div className='flex flex-col items-center space-y-6'>
                <div className='border-border flex size-16 items-center justify-center rounded-full border-2'>
                  <MessagesSquare className='size-8' />
                </div>
                <div className='space-y-2 text-center'>
                  <h1 className='text-xl font-semibold'>Your messages</h1>
                  <p className='text-muted-foreground text-sm'>
                    Send a message to start a chat.
                  </p>
                </div>
                <Button onClick={() => setCreateConversationDialog(true)}>
                  <MessageSquarePlus className='mr-2 h-4 w-4' />
                  Send message
                </Button>
              </div>
            </div>
          )}
        </section>
        <NewChat
          onOpenChange={setCreateConversationDialog}
          open={createConversationDialogOpened}
        />
    </main>
  )
}
