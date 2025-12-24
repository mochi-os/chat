import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react'
import { format, isToday } from 'date-fns'
import type {
  UseInfiniteQueryResult,
  InfiniteData,
} from '@tanstack/react-query'
import { Button, LoadMoreTrigger, cn } from '@mochi/common'
import { Loader2, MessagesSquare, RotateCcw } from 'lucide-react'
import type { ChatMessage } from '@/api/chats'
import type { GetMessagesResponse } from '@/api/types/chats'
import { MessageAttachments } from './message-attachments'

interface ChatMessageListProps {
  messagesQuery: UseInfiniteQueryResult<
    InfiniteData<GetMessagesResponse>,
    unknown
  >
  chatMessages: ChatMessage[]
  isLoadingMessages: boolean
  messagesErrorMessage: string | null
  currentUserEmail: string
  currentUserName: string
}

export function ChatMessageList({
  messagesQuery,
  chatMessages,
  isLoadingMessages,
  messagesErrorMessage,
  currentUserEmail,
  currentUserName,
}: ChatMessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const prevScrollHeightRef = useRef<number>(0)
  const isLoadingMoreRef = useRef(false)
  const isInitialLoadRef = useRef(true)
  const prevMessageCountRef = useRef<number>(0)

  const isCurrentUserMessage = (message: ChatMessage) => {
    // Check if the message belongs to the current user by comparing
    // email, name, or member ID against the current user's credentials
    if (!currentUserEmail && !currentUserName) return false
    return (
      (currentUserEmail && message.email === currentUserEmail) ||
      (currentUserName && message.name === currentUserName) ||
      (currentUserEmail && message.member === currentUserEmail)
    )
  }

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups: Record<string, ChatMessage[]> = {}
    chatMessages.forEach((message) => {
      const date = format(new Date(message.created * 1000), 'yyyy-MM-dd')
      if (!groups[date]) {
        groups[date] = []
      }
      groups[date].push(message)
    })
    return groups
  }, [chatMessages])

  // Handle loading more (older) messages
  const handleLoadMore = useCallback(() => {
    if (messagesQuery.isFetchingNextPage || !messagesQuery.hasNextPage) return

    // Store current scroll height before loading
    if (scrollContainerRef.current) {
      prevScrollHeightRef.current = scrollContainerRef.current.scrollHeight
      isLoadingMoreRef.current = true
    }

    messagesQuery.fetchNextPage()
  }, [messagesQuery])

  // Preserve scroll position when older messages are prepended
  useLayoutEffect(() => {
    if (
      isLoadingMoreRef.current &&
      scrollContainerRef.current &&
      !messagesQuery.isFetchingNextPage
    ) {
      const newScrollHeight = scrollContainerRef.current.scrollHeight
      const scrollDiff = newScrollHeight - prevScrollHeightRef.current
      scrollContainerRef.current.scrollTop += scrollDiff
      isLoadingMoreRef.current = false
    }
  }, [chatMessages, messagesQuery.isFetchingNextPage])

  // Scroll to bottom on initial load or when new message is added at end
  useEffect(() => {
    const prevCount = prevMessageCountRef.current
    const currentCount = chatMessages.length

    if (isInitialLoadRef.current && currentCount > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
      isInitialLoadRef.current = false
    } else if (!isLoadingMoreRef.current && currentCount > prevCount) {
      // New message added - scroll to bottom
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      })
    }

    prevMessageCountRef.current = currentCount
  }, [chatMessages])

  if (isLoadingMessages) {
    return (
      <div className='flex items-center justify-center py-8'>
        <Loader2 className='h-6 w-6 animate-spin' />
        <span className='text-muted-foreground ml-2 text-sm'>
          Loading messages...
        </span>
      </div>
    )
  }

  if (messagesErrorMessage) {
    return (
      <div className='flex flex-col items-center justify-center py-8 text-center'>
        <MessagesSquare className='text-muted-foreground mb-2 h-8 w-8' />
        <p className='text-muted-foreground text-sm'>{messagesErrorMessage}</p>
        <Button
          variant='outline'
          size='sm'
          className='mt-2'
          onClick={() => void messagesQuery.refetch()}
        >
          <RotateCcw className='mr-1.5 h-4 w-4' />
          Retry
        </Button>
      </div>
    )
  }

  if (chatMessages.length === 0) {
    return (
      <div className='flex flex-col items-center justify-center py-8 text-center'>
        <MessagesSquare className='text-muted-foreground mb-2 h-8 w-8' />
        <p className='text-muted-foreground text-sm'>No messages yet</p>
      </div>
    )
  }

  return (
    <div
      ref={scrollContainerRef}
      className='flex h-full w-full flex-1 flex-col justify-start gap-4 overflow-y-auto py-2 pe-4 pb-4'
    >
      {/* Load more trigger at top for older messages */}
      <LoadMoreTrigger
        onLoadMore={handleLoadMore}
        hasMore={messagesQuery.hasNextPage ?? false}
        isLoading={messagesQuery.isFetchingNextPage}
        rootMargin='100px'
      />

      {Object.keys(groupedMessages).map((key) => (
        <Fragment key={key}>
          {/* Date separator */}
          <div className='my-4 flex items-center justify-center'>
            <div className='text-muted-foreground text-xs'>{key}</div>
          </div>

          {groupedMessages[key].map((message, index) => {
            const isSent = isCurrentUserMessage(message)
            return (
              <div
                key={`${message.id}-${index}`}
                className={cn(
                  'mb-1.5 flex w-full',
                  isSent ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'message-content relative max-w-[70%] px-3.5 py-2 wrap-break-word',
                    'bg-highlight rounded-2xl',
                    isSent ? 'rounded-br-sm' : 'rounded-bl-sm'
                  )}
                >
                  {/* Sender name for received messages */}
                  {!isSent && (
                    <div className='text-muted-foreground mb-0.5 text-xs font-medium'>
                      {message.name}
                    </div>
                  )}

                  {/* Message content */}
                  <p className='text-sm leading-relaxed whitespace-pre-wrap'>
                    {message.body}
                  </p>

                  {message.attachments?.length ? (
                    <div className='mt-2 space-y-2'>
                      <MessageAttachments
                        attachments={message.attachments}
                        chatId={message.chat}
                      />
                    </div>
                  ) : null}

                  {/* Timestamp - shown on hover, positioned beside bubble */}
                  {(() => {
                    const date = new Date(message.created * 1000)
                    const today = isToday(date)
                    return (
                      <span
                        className={cn(
                          'message-meta text-muted-foreground absolute bottom-0.5 text-[11px] whitespace-nowrap transition-opacity',
                          isSent
                            ? today
                              ? '-left-14'
                              : '-left-32'
                            : today
                              ? '-right-14'
                              : '-right-32'
                        )}
                      >
                        {today
                          ? format(date, 'HH:mm')
                          : format(date, 'yyyy-MM-dd HH:mm')}
                      </span>
                    )
                  })()}
                </div>
              </div>
            )
          })}
        </Fragment>
      ))}
      <div ref={messagesEndRef} />
    </div>
  )
}
