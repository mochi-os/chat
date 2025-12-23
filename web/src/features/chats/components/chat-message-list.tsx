import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { format } from 'date-fns'
import { CheckCheck, Loader2, MessagesSquare, RotateCcw } from 'lucide-react'
import type { ChatMessage } from '@/api/chats'
import type { UseInfiniteQueryResult, InfiniteData } from '@tanstack/react-query'
import type { GetMessagesResponse } from '@/api/types/chats'
import { Button, LoadMoreTrigger } from '@mochi/common'
import { cn } from '@mochi/common'
import { MessageAttachmentPreview } from './message-attachment-preview'

interface ChatMessageListProps {
  messagesQuery: UseInfiniteQueryResult<InfiniteData<GetMessagesResponse>, unknown>
  chatMessages: ChatMessage[]
  isLoadingMessages: boolean
  messagesErrorMessage: string | null
  currentUserEmail: string
}

export function ChatMessageList({
  messagesQuery,
  chatMessages,
  isLoadingMessages,
  messagesErrorMessage,
  currentUserEmail,
}: ChatMessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const prevScrollHeightRef = useRef<number>(0)
  const isLoadingMoreRef = useRef(false)
  const isInitialLoadRef = useRef(true)

  const isCurrentUserMessage = (message: ChatMessage) => {
    if (!currentUserEmail) return false
    return (
      message.email === currentUserEmail ||
      message.name === currentUserEmail ||
      message.member === currentUserEmail
    )
  }

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups: Record<string, ChatMessage[]> = {}
    chatMessages.forEach((message) => {
      const date = format(new Date(message.created * 1000), 'MMMM d, yyyy')
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
    if (isLoadingMoreRef.current && scrollContainerRef.current && !messagesQuery.isFetchingNextPage) {
      const newScrollHeight = scrollContainerRef.current.scrollHeight
      const scrollDiff = newScrollHeight - prevScrollHeightRef.current
      scrollContainerRef.current.scrollTop += scrollDiff
      isLoadingMoreRef.current = false
    }
  }, [chatMessages, messagesQuery.isFetchingNextPage])

  // Scroll to bottom on initial load or when new message is added at end
  useEffect(() => {
    if (isInitialLoadRef.current && chatMessages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
      isInitialLoadRef.current = false
    } else if (!isLoadingMoreRef.current && chatMessages.length > 0) {
      // Only auto-scroll for new messages if user is near the bottom
      const container = scrollContainerRef.current
      if (container) {
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100
        if (isNearBottom) {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }
      }
    }
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
        <p className='text-muted-foreground text-xs'>
          Start the conversation!
        </p>
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
                    'max-w-[70%] px-4 py-3 wrap-break-word shadow-sm',
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
      ))}
      <div ref={messagesEndRef} />
    </div>
  )
}
