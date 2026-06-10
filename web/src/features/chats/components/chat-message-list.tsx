import {
  Fragment,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useFormat } from '@mochi/web'
import { plural } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import type {
  UseInfiniteQueryResult,
  InfiniteData,
} from '@tanstack/react-query'
import {
  Button,
  EntityAvatar,
  GeneralError,
  LoadMoreTrigger,
  cn,
  Skeleton,
  getChatBubbleToneClass,
  getAppPath,
} from '@mochi/web'
import { ChevronsDown, MessageCircle } from 'lucide-react'
import type { ChatMessage } from '@/api/chats'
import type { GetMessagesResponse } from '@/api/types/chats'
import { MessageAttachments } from './message-attachments'
import { MessageBody } from './message-body'
import { MessageHoverActions } from './message-hover-actions'
import { MessageQuote } from './message-quote'
import {
  MessageReactionPicker,
  MessageReactionSummary,
} from './message-reaction-bar'
import type { ReactionId } from '../constants/reactions'
import { highlightSearchText } from '../utils/highlight-search-text'

const BOTTOM_THRESHOLD_PX = 80

function checkIsAtBottom(el: HTMLDivElement) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD_PX
}

function pinToBottom(el: HTMLDivElement) {
  el.scrollTop = el.scrollHeight - el.clientHeight
}

interface ChatMessageListProps {
  messagesQuery: UseInfiniteQueryResult<
    InfiniteData<GetMessagesResponse>,
    unknown
  >
  chatMessages: ChatMessage[]
  isLoadingMessages: boolean
  messagesError: unknown
  currentUserIdentity: string
  isGroupChat: boolean
  searchActive?: boolean
  searchQuery?: string
  matchedMessageIds?: Set<string>
  activeMatchId?: string | null
  scrollToMessageId?: string | null
  scrollToMessageEnabled?: boolean
  highlightMessageId?: string | null
  onEnsureMatchVisible?: (messageId: string) => void | Promise<void>
  onScrollToMessageComplete?: (messageId: string) => void
  onReply?: (message: ChatMessage) => void
  onReact?: (messageId: string, reaction: ReactionId | '') => void
  onScrollToMessage?: (messageId: string) => void
}

export function ChatMessageList({
  messagesQuery,
  chatMessages,
  isLoadingMessages,
  messagesError,
  currentUserIdentity,
  isGroupChat,
  searchActive = false,
  searchQuery = '',
  matchedMessageIds,
  activeMatchId,
  scrollToMessageId,
  scrollToMessageEnabled = false,
  highlightMessageId,
  onEnsureMatchVisible,
  onScrollToMessageComplete,
  onReply,
  onReact,
  onScrollToMessage,
}: ChatMessageListProps) {
  const { t } = useLingui()
  const { formatDate, formatDateTime } = useFormat()
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const prevScrollHeightRef = useRef<number>(0)
  const isLoadingMoreRef = useRef(false)
  const skipNextAutoScrollRef = useRef(false)
  const isInitialLoadRef = useRef(true)
  const prevMessageCountRef = useRef<number>(0)
  const isAtBottomRef = useRef(true)
  const [isScrolledAwayFromBottom, setIsScrolledAwayFromBottom] = useState(false)
  const [newMessageCount, setNewMessageCount] = useState(0)

  const isCurrentUserMessage = (message: ChatMessage) => {
    if (!currentUserIdentity) return false
    return message.member === currentUserIdentity
  }

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return

    const atBottom = checkIsAtBottom(el)
    isAtBottomRef.current = atBottom
    setIsScrolledAwayFromBottom(!atBottom)

    if (atBottom) {
      setNewMessageCount(0)
    }
  }, [])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    setNewMessageCount(0)
    setIsScrolledAwayFromBottom(false)
    isAtBottomRef.current = true
  }, [])

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups: Record<string, ChatMessage[]> = {}
    chatMessages.forEach((message) => {
      const d = new Date(message.created * 1000)
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (!groups[date]) {
        groups[date] = []
      }
      groups[date].push(message)
    })
    return groups
  }, [chatMessages])

  const messagesById = useMemo(
    () => new Map(chatMessages.map((m) => [m.id, m])),
    [chatMessages]
  )

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

  // Scroll position: preserve on prepend, pin at bottom, or badge when scrolled up
  useLayoutEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return

    if (isLoadingMoreRef.current && !messagesQuery.isFetchingNextPage) {
      const newScrollHeight = el.scrollHeight
      const scrollDiff = newScrollHeight - prevScrollHeightRef.current
      el.scrollTop += scrollDiff
      skipNextAutoScrollRef.current = true
      isLoadingMoreRef.current = false
      prevMessageCountRef.current = chatMessages.length
      return
    }

    const prevCount = prevMessageCountRef.current
    const currentCount = chatMessages.length

    if (isInitialLoadRef.current && currentCount > 0) {
      pinToBottom(el)
      isInitialLoadRef.current = false
      isAtBottomRef.current = true
      prevMessageCountRef.current = currentCount
      return
    }

    if (skipNextAutoScrollRef.current) {
      skipNextAutoScrollRef.current = false
      prevMessageCountRef.current = currentCount
      return
    }

    if (!isLoadingMoreRef.current && currentCount > prevCount) {
      const added = currentCount - prevCount
      const newest = chatMessages[chatMessages.length - 1]
      const isOwn = newest?.member === currentUserIdentity

      if (isOwn) {
        if (isAtBottomRef.current) {
          pinToBottom(el)
        } else {
          requestAnimationFrame(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
          })
        }
        setNewMessageCount(0)
        setIsScrolledAwayFromBottom(false)
        isAtBottomRef.current = true
      } else if (isAtBottomRef.current) {
        pinToBottom(el)
        setNewMessageCount(0)
        isAtBottomRef.current = true
      } else {
        setNewMessageCount((c) => c + added)
      }
    }

    prevMessageCountRef.current = currentCount
  }, [chatMessages, currentUserIdentity, messagesQuery.isFetchingNextPage])

  useLayoutEffect(() => {
    if (!scrollToMessageId || !scrollToMessageEnabled) return

    const isLoaded = chatMessages.some((m) => m.id === scrollToMessageId)
    if (isLoaded) {
      const el = document.getElementById(`chat-message-${scrollToMessageId}`)
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      onScrollToMessageComplete?.(scrollToMessageId)
      return
    }

    if (
      messagesQuery.hasNextPage &&
      !messagesQuery.isFetchingNextPage &&
      onEnsureMatchVisible
    ) {
      void onEnsureMatchVisible(scrollToMessageId)
    }
  }, [
    scrollToMessageId,
    scrollToMessageEnabled,
    chatMessages,
    messagesQuery.hasNextPage,
    messagesQuery.isFetchingNextPage,
    onEnsureMatchVisible,
    onScrollToMessageComplete,
  ])

  if (isLoadingMessages) {
    return (
      <div className='flex flex-1 w-full flex-col justify-end gap-3 p-4'>
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
                i % 2 === 0 ? 'rounded-es-[4px]' : 'rounded-ee-[4px]'
              )}
            />
            <Skeleton className='h-3 w-12 rounded-full' />
          </div>
        ))}
      </div>
    )
  }

  if (messagesError) {
    return (
      <div className='flex w-full flex-1 flex-col items-center justify-center py-8'>
        <GeneralError
          error={messagesError}
          minimal
          mode='inline'
          reset={messagesQuery.refetch}
          className='w-full max-w-md'
        />
      </div>
    )
  }

  if (chatMessages.length === 0) {
    return (
      <div className='flex flex-1 flex-col items-center justify-center py-8 text-center'>
        <MessageCircle className='text-muted-foreground mb-2 h-8 w-8' />
        <p className='text-muted-foreground text-sm'><Trans>No messages yet</Trans></p>
      </div>
    )
  }

  return (
    <div className='relative flex min-h-0 flex-1 flex-col'>
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className='flex w-full flex-1 flex-col justify-start gap-4 overflow-y-auto px-4 py-2 pb-4'
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
              {/* eslint-disable-next-line lingui/no-unlocalized-strings -- 'T00:00:00' is an ISO-8601 time component, not a UI label */}
              <div className='text-muted-foreground text-xs'>{formatDate(new Date(key + 'T00:00:00'))}</div>
            </div>

            {groupedMessages[key].map((message) => {
              const isSent = isCurrentUserMessage(message)
              return (
                <div
                  key={message.id}
                  id={`chat-message-${message.id}`}
                  className={cn(
                    'group mb-3 flex w-full flex-col gap-1 rounded-lg transition-shadow',
                    isSent ? 'items-end' : 'items-start',
                    highlightMessageId === message.id &&
                    'ring-primary/60 bg-primary/5 ring-2'
                  )}
                >
                  {/* Message metadata: avatar + name (only for group chats) */}
                  {isGroupChat && !isSent && (
                    <div className='flex flex-row items-center gap-1.5 px-1 text-xs'>
                      <EntityAvatar
                        src={`${getAppPath()}/${message.chat}/-/${message.id}/asset/avatar`}
                        styleUrl={`${getAppPath()}/${message.chat}/-/${message.id}/asset/style`}
                        seed={message.member}
                        name={message.name}
                        size="xs"
                      />
                      <span className='text-muted-foreground font-medium'>
                        {message.name}
                      </span>
                    </div>
                  )}

                  {/* Message bubble + inline hover actions (react, menu, time) */}
                  <div className='flex max-w-full min-w-0 items-end gap-1'>
                    {isSent ? (
                      <div className='flex items-center gap-0.5'>
                        <span className='text-muted-foreground/70 text-[10px] opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100'>
                          {formatDateTime(new Date(message.created * 1000))}
                        </span>
                        {onReply ? (
                          <MessageHoverActions
                            message={message}
                            onReply={onReply}
                          />
                        ) : null}
                        {onReact ? (
                          <>
                            <MessageReactionPicker
                              activeReaction={message.my_reaction}
                              onSelect={(reaction) => onReact(message.id, reaction)}
                              isSent
                            />
                            <MessageReactionSummary
                              counts={message.reaction_counts ?? {}}
                              activeReaction={message.my_reaction}
                            />
                          </>
                        ) : null}
                      </div>
                    ) : null}

                    <div
                      className={cn(
                        'message-content relative min-w-0 max-w-[70%] px-2 py-2 wrap-break-word',
                        getChatBubbleToneClass(isSent)
                      )}
                    >
                      {message.reply_to && onScrollToMessage ? (
                        <MessageQuote
                          quoted={messagesById.get(message.reply_to)}
                          isSent={isSent}
                          onClick={() => onScrollToMessage(message.reply_to!)}
                        />
                      ) : null}

                      {message.attachments?.length ? (
                        <div className='space-y-2'>
                          <MessageAttachments
                            attachments={message.attachments}
                            chatId={message.chat}
                          />
                        </div>
                      ) : null}

                      {message.body ? (
                        <MessageBody
                          isSent={isSent}
                          className={
                            message.attachments?.length ? 'mt-2' : undefined
                          }
                        >
                          {searchActive &&
                            searchQuery.length >= 2 &&
                            matchedMessageIds?.has(message.id)
                            ? highlightSearchText(
                              message.body,
                              searchQuery,
                              activeMatchId === message.id
                            )
                            : message.body}
                        </MessageBody>
                      ) : null}
                    </div>

                    {!isSent ? (
                      <div className='flex items-center gap-0.5'>
                        {onReact ? (
                          <>
                            <MessageReactionSummary
                              counts={message.reaction_counts ?? {}}
                              activeReaction={message.my_reaction}
                            />
                            <MessageReactionPicker
                              activeReaction={message.my_reaction}
                              onSelect={(reaction) => onReact(message.id, reaction)}
                            />
                          </>
                        ) : null}
                        {onReply ? (
                          <MessageHoverActions
                            message={message}
                            onReply={onReply}
                          />
                        ) : null}
                        <span className='text-muted-foreground/70 text-[10px] opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100'>
                          {formatDateTime(new Date(message.created * 1000))}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </Fragment>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {isScrolledAwayFromBottom && !searchActive ? (
        <div className='absolute left-1/2 bottom-3 z-10'>
          <Button
            type='button'
            variant='outline'
            size='icon'
            className='bg-background relative size-10 rounded-full shadow-md'
            onClick={scrollToBottom}
            aria-label={
              newMessageCount > 0
                ? plural(newMessageCount, {
                  one: 'Jump to 1 new message',
                  other: 'Jump to # new messages',
                })
                : t`Jump to bottom`
            }
          >
            <ChevronsDown className='size-5' />
            {newMessageCount > 0 ? (
              <span className='bg-primary absolute -start-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white'>
                {newMessageCount > 99 ? '99+' : newMessageCount}
              </span>
            ) : null}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
