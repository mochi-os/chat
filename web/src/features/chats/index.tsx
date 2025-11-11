import { useEffect, useMemo, useState } from 'react'
import { Fragment } from 'react/jsx-runtime'
import { format } from 'date-fns'
import {
  ArrowLeft,
  MoreVertical,
  Edit,
  Paperclip,
  Phone,
  ImagePlus,
  Plus,
  Search as SearchIcon,
  Send,
  Video,
  MessagesSquare,
  Loader2,
  CheckCheck,
} from 'lucide-react'
import { type Chat, type ChatMessage } from '@/api/chats'
import {
  useChatMessagesQuery,
  useChatsQuery,
  useSendMessageMutation,
} from '@/hooks/useChats'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
// import { ConfigDrawer } from '@/components/config-drawer' // Commented for future use
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
// import { ProfileDropdown } from '@/components/profile-dropdown' // Commented for future use
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { NotificationsDropdown } from '@/components/notifications-dropdown'
import { NewChat } from './components/new-chat'

export function Chats() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null)
  const [mobileSelectedChat, setMobileSelectedChat] = useState<Chat | null>(
    null
  )
  const [createConversationDialogOpened, setCreateConversationDialog] =
    useState(false)
  const [newMessage, setNewMessage] = useState('')
  const [currentUserId] = useState<string>('shakeel') // Temporary: set current user ID

  const chatsQuery = useChatsQuery()
  const chats = useMemo(
    () => chatsQuery.data?.chats ?? [],
    [chatsQuery.data?.chats]
  )
  const messagesQuery = useChatMessagesQuery(selectedChat?.id ?? undefined)
  const chatMessages = useMemo(
    () => messagesQuery.data?.messages ?? [],
    [messagesQuery.data?.messages]
  )
  const sendMessageMutation = useSendMessageMutation({
    onSuccess: () => {
      setNewMessage('')
    },
  })
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

  // Get current user email from auth store
  const email = useAuthStore((state) => state.email)
  const currentUserEmail = email || ''

  // TODO: Update user loading logic for new auth flow
  // - Remove legacy cookie checking
  // - Implement new user data loading mechanism

  useEffect(() => {
    if (!chats.length) {
      setSelectedChat(null)
      setMobileSelectedChat(null)
      return
    }

    const urlParams = new URLSearchParams(window.location.search)
    const chatIdFromUrl = urlParams.get('chat')

    if (chatIdFromUrl) {
      const chatFromUrl = chats.find((chat) => chat.id === chatIdFromUrl)
      if (chatFromUrl && chatFromUrl.id !== selectedChat?.id) {
        setSelectedChat(chatFromUrl)
        setMobileSelectedChat(chatFromUrl)
        return
      }
    }

    if (!selectedChat) {
      const firstChat = chats[0] ?? null
      setSelectedChat(firstChat)
      setMobileSelectedChat(firstChat)
      return
    }

    const selectedChatStillExists = chats.some(
      (chat) => chat.id === selectedChat.id
    )

    if (!selectedChatStillExists) {
      const fallbackChat = chats[0] ?? null
      setSelectedChat(fallbackChat)
      setMobileSelectedChat(fallbackChat)
    }
  }, [chats, selectedChat])

  // Filtered data based on the search query
  const filteredChatList = useMemo(
    () =>
      chats.filter((chat) =>
        chat.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
      ),
    [chats, searchQuery]
  )

  // Group messages by date
  const groupedMessages = useMemo(
    () =>
      chatMessages.reduce(
        (acc: Record<string, ChatMessage[]>, message) => {
          const date = new Date(message.created * 1000) // Convert Unix timestamp to Date
          const key = format(date, 'd MMM, yyyy')

          if (!acc[key]) {
            acc[key] = []
          }
          acc[key].push(message)

          return acc
        },
        {}
      ),
    [chatMessages]
  )

  // Check if message is from current user
  const isCurrentUserMessage = (message: ChatMessage) => {
    // For now, use the temporary currentUserId state
    // This should be replaced with proper user identification from your auth system
    const isCurrentUser =
      message.name === currentUserId ||
      message.member === currentUserId ||
      message.name === 'You' ||
      message.name === currentUserEmail ||
      message.member === currentUserEmail

    return isCurrentUser
  }

  // Handle sending a new message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !selectedChat || isSending) return

    try {
      await sendMessageMutation.mutateAsync({
        chatId: selectedChat.id,
        body: newMessage.trim(),
      })
    } catch (_error) {
      // Error is surfaced via tanstack query mutation state
    }
  }

  return (
    <>
      {/* ===== Top Heading ===== */}
      <Header>
        <Search />
        <div className='ms-auto flex items-center space-x-4'>
          <NotificationsDropdown />
          <ThemeSwitch />
          {/* <ConfigDrawer /> */}
          {/* <ProfileDropdown /> */}
        </div>
      </Header>

      <Main fixed>
        <section className='flex h-full gap-6'>
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
                      <span className='text-muted-foreground col-start-2 row-span-2 row-start-2 line-clamp-1 block max-w-32 text-xs text-nowrap text-ellipsis lg:max-w-none lg:text-sm'>
                        {selectedChat.identity}
                      </span>
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
              <div className='flex flex-1 flex-col gap-2 rounded-md px-4 pt-0 pb-4'>
                <div className='flex size-full flex-1'>
                  <div className='chat-text-container relative -me-4 flex flex-1 flex-col overflow-y-hidden'>
                    <ScrollArea className='flex h-full w-full grow flex-col justify-start gap-4 py-2 pe-4 pb-4'>
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
                    </ScrollArea>
                  </div>
                </div>
                {/* Message Input */}
                <form
                  onSubmit={handleSendMessage}
                  className='flex w-full flex-none gap-2'
                >
                  <div className='border-input bg-card focus-within:ring-ring flex flex-1 items-center gap-2 rounded-full border px-4 py-2 focus-within:ring-1 focus-within:outline-hidden'>
                    <div className='flex items-center gap-1'>
                      <Button
                        size='icon'
                        type='button'
                        variant='ghost'
                        className='h-8 w-8 rounded-full'
                      >
                        <Plus size={16} className='stroke-muted-foreground' />
                      </Button>
                      <Button
                        size='icon'
                        type='button'
                        variant='ghost'
                        className='h-8 w-8 rounded-full'
                      >
                        <ImagePlus
                          size={16}
                          className='stroke-muted-foreground'
                        />
                      </Button>
                      <Button
                        size='icon'
                        type='button'
                        variant='ghost'
                        className='h-8 w-8 rounded-full'
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
                      disabled={!newMessage.trim() || isSending}
                    >
                      {isSending ? (
                        <Loader2 size={16} className='animate-spin' />
                      ) : (
                        <Send size={16} />
                      )}
                    </Button>
                  </div>
                  {sendMessageErrorMessage && (
                    <p className='text-destructive text-xs text-right w-full pe-2'>
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
      </Main>
    </>
  )
}
