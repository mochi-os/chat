import { Fragment, useEffect, useMemo, useRef } from 'react'
import { format } from 'date-fns'
import { CheckCheck, Loader2, MessagesSquare, RotateCcw } from 'lucide-react'
import type { ChatMessage } from '@/api/chats'
import type { UseInfiniteQueryResult, InfiniteData } from '@tanstack/react-query'
import type { GetMessagesResponse } from '@/api/types/chats'
import { Button } from '@mochi/common'
import { ScrollArea } from '@mochi/common'
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
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
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
    <ScrollArea className='flex h-full w-full flex-1 flex-col justify-start gap-4 py-2 pe-4 pb-4'>
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
    </ScrollArea>
  )
}
