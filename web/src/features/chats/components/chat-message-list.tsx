import { Fragment, useEffect, useMemo, useRef } from 'react'
import { format } from 'date-fns'
import { CheckCheck, ChevronUp, Loader2, MessagesSquare, RotateCcw } from 'lucide-react'
import type { ChatMessage } from '@/api/chats'
import type { UseInfiniteQueryResult, InfiniteData } from '@tanstack/react-query'
import type { GetMessagesResponse } from '@/api/types/chats'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
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
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const hasMoreMessages = messagesQuery.hasNextPage
  const isFetchingMore = messagesQuery.isFetchingNextPage

  const isCurrentUserMessage = (message: ChatMessage) => {
    if (!currentUserEmail) return false
    return (
      message.name === currentUserEmail ||
      message.member === currentUserEmail ||
      message.name === 'You'
    )
  }

  // Group messages by date
  const groupedMessages = useMemo(
    () =>
      chatMessages.reduce((acc: Record<string, ChatMessage[]>, message) => {
        const date = new Date(message.created * 1000)
        const key = format(date, 'd MMM, yyyy')

        if (!acc[key]) {
          acc[key] = []
        }
        acc[key].push(message)

        return acc
      }, {}),
    [chatMessages]
  )

  useEffect(() => {
    // Scroll to bottom on initial load or if we are not fetching history
    // This is a naive implementation to approximate previous behavior
    if (!isFetchingMore && chatMessages.length > 0) {
       messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatMessages.length, isFetchingMore])

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
    <ScrollArea className='flex h-full w-full flex-1 flex-col justify-start gap-4 py-2 pe-4 pb-4'>
      {hasMoreMessages && (
        <div className='flex justify-center py-4'>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => void messagesQuery.fetchNextPage()}
            disabled={isFetchingMore}
            className='text-muted-foreground'
          >
            {isFetchingMore ? (
              <>
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                Loading...
              </>
            ) : (
              <>
                <ChevronUp className='mr-2 h-4 w-4' />
                Load older messages
              </>
            )}
          </Button>
        </div>
      )}

      {Object.keys(groupedMessages).map((key) => (
        <Fragment key={key}>
          <div className='my-4 flex items-center justify-center'>
            <div className='bg-muted text-muted-foreground rounded-full px-3 py-1 text-xs font-medium'>
              {key}
            </div>
          </div>

          {groupedMessages[key].map((message) => {
            const isSent = isCurrentUserMessage(message)
            return (
              <div
                key={message.id}
                className={cn(
                  'flex w-full',
                  isSent ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'flex max-w-[80%] flex-col gap-1',
                    isSent ? 'items-end' : 'items-start'
                  )}
                >
                  <div className='flex items-end gap-2'>
                    <div
                      className={cn(
                        'rounded-2xl px-4 py-2 text-sm shadow-sm',
                        isSent
                          ? 'bg-blue-600 text-white rounded-br-none'
                          : 'bg-white dark:bg-gray-800 border text-gray-900 dark:text-gray-100 rounded-bl-none'
                      )}
                    >
                      {!isSent && (
                        <p className='mb-1 text-xs font-medium opacity-70'>
                          {message.name || message.member}
                        </p>
                      )}
                      <p className='leading-relaxed whitespace-pre-wrap break-words'>
                        {message.body}
                      </p>

                      {message.attachments &&
                        message.attachments.length > 0 && (
                          <div className='mt-2 flex flex-col gap-2'>
                            {message.attachments.map((attachment, index) => (
                              <MessageAttachmentPreview
                                key={index}
                                attachment={attachment}
                                index={index}
                              />
                            ))}
                          </div>
                        )}
                    </div>
                  </div>

                  <div
                    className={cn(
                      'mt-1 flex items-center gap-1 text-xs',
                      isSent
                        ? 'text-muted-foreground' // Changed from white/70 because it's outside bubble now? No it was inside/outside logic was specific.
                        // Wait, previous code puts timestamp inside? No, outside.
                        // Actually in previous code:
                        /*
                        <div className={cn('mt-2 flex items-center justify-end gap-1 text-xs', ...)}>
                        */
                        // It was inside the `bg-blue-600` div? 
                        // Let's re-read line 761 in index.tsx.
                        : 'text-muted-foreground'
                    )}
                  >
                    <span>
                      {format(new Date(message.created * 1000), 'h:mm a')}
                    </span>
                    {isSent && (
                      <CheckCheck size={12} className='text-green-500' />
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </Fragment>
      ))}
      <div ref={messagesEndRef} />
    </ScrollArea>
  )
}
