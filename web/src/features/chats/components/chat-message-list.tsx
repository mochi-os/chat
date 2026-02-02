import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react'
import { format } from 'date-fns'
import type {
  UseInfiniteQueryResult,
  InfiniteData,
} from '@tanstack/react-query'
import { Button, LoadMoreTrigger, cn, Skeleton } from '@mochi/common'
import { MessagesSquare, RotateCcw } from 'lucide-react'
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
  currentUserIdentity: string
  isGroupChat: boolean
}

export function ChatMessageList({
  messagesQuery,
  chatMessages,
  isLoadingMessages,
  messagesErrorMessage,
  currentUserIdentity,
  isGroupChat,
}: ChatMessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const prevScrollHeightRef = useRef<number>(0)
  const isLoadingMoreRef = useRef(false)
  const isInitialLoadRef = useRef(true)
  const prevMessageCountRef = useRef<number>(0)

  const isCurrentUserMessage = (message: ChatMessage) => {
    if (!currentUserIdentity) return false
    return message.member === currentUserIdentity
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
      <div className='flex w-full flex-1 flex-col justify-end gap-3 p-4'>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'flex w-full flex-col gap-1',
              i % 2 === 0 ? 'items-start' : 'items-end'
            )}
          >
            <Skeleton
              className={cn(
                'h-10 w-[60%] rounded-[16px]',
                i % 2 === 0 ? 'rounded-bl-[4px]' : 'rounded-br-[4px]'
              )}
            />
            <Skeleton className='h-3 w-12 rounded-full' />
          </div>
        ))}
      </div>
    )
  }

  if (messagesErrorMessage) {
    return (
      <div className='flex flex-1 w-full flex-col items-center justify-center py-8 text-center'>
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
      <div className='flex flex-1 w-full flex-col items-center justify-center py-8 text-center'>
        <MessagesSquare className='text-muted-foreground mb-2 h-8 w-8' />
        <p className='text-muted-foreground text-sm'>No messages yet</p>
      </div>
    )
  }

  return (
    <div
      ref={scrollContainerRef}
      className='flex w-full flex-1 flex-col justify-start gap-4 overflow-y-auto py-2 pe-4 pb-4'
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
                  'group mb-3 flex w-full flex-col gap-1',
                  isSent ? 'items-end' : 'items-start'
                )}
              >
                {/* Message metadata: name (only for group chats) */}
                {isGroupChat && !isSent && (
                  <div className='flex flex-row items-center gap-2 px-1 text-xs'>
                    <span className='text-muted-foreground font-medium'>
                      {message.name}
                    </span>
                  </div>
                )}

                {/* Message bubble + Inline Time */}
                <div className='flex items-end gap-2'>
                  {isSent && (
                    <span className='text-muted-foreground/70 opacity-0 transition-opacity group-hover:opacity-100 text-[10px]'>
                      {format(new Date(message.created * 1000), 'HH:mm:ss')}
                    </span>
                  )}

                  <div
                    className={cn(
                      'message-content relative max-w-[70%] px-3.5 py-2 wrap-break-word',
                      isSent
                        ? 'rounded-[16px] rounded-br-[4px] bg-blue-500 text-white dark:bg-blue-600'
                        : 'rounded-[16px] rounded-bl-[4px] bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100'
                    )}
                  >
                    {/* Message content */}
                    <p className='text-sm leading-relaxed whitespace-pre-wrap'>
                      {message.body}
                    </p>

                    {message.attachments?.length ? (
                      <div className='mt-2 space-y-2'>
                        <MessageAttachments
                          attachments={message.attachments}
                          chatId={message.chatFingerprint ?? message.chat}
                        />
                      </div>
                    ) : null}
                  </div>

                  {!isSent && (
                    <span className='text-muted-foreground/70 opacity-0 transition-opacity group-hover:opacity-100 text-[10px]'>
                      {format(new Date(message.created * 1000), 'HH:mm:ss')}
                    </span>
                  )}
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
