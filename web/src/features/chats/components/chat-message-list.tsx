// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useFormat } from '@mochi/web'
import { plural } from '@lingui/core/macro'
import { useLingui as useLinguiRuntime } from '@lingui/react'
import { Trans, useLingui } from '@lingui/react/macro'
import type {
  UseInfiniteQueryResult,
  InfiniteData,
} from '@tanstack/react-query'
import {
  Button,
  Checkbox,
  EmptyState,
  EntityAvatar,
  GeneralError,
  LoadMoreTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  Skeleton,
  getAppPath,
  actionPillExpandMaxWidthMap,
  actionPillExpandOpacityMap,
} from '@mochi/web'
import { ChevronsDown, MessageCircle } from 'lucide-react'
import type { ChatMessage } from '@/api/chats'
import type { GetMessagesResponse } from '@/api/types/chats'
import { Bubble, BubbleContent, BubbleReactions, BubbleGroup } from '@mochi/web'
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
const MESSAGE_ENTER_MS = 200


function groupMessagesBySender(messages: ChatMessage[]) {
  const groups: ChatMessage[][] = []
  let currentGroup: ChatMessage[] = []
  let currentSenderId: string | null = null

  for (const msg of messages) {
    if (msg.member !== currentSenderId) {
      if (currentGroup.length > 0) groups.push(currentGroup)
      currentGroup = [msg]
      currentSenderId = msg.member
    } else {
      currentGroup.push(msg)
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup)
  return groups
}

function checkIsAtBottom(el: HTMLDivElement) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD_PX
}

function pinToBottom(el: HTMLDivElement) {
  el.scrollTop = el.scrollHeight - el.clientHeight
}

interface ChatMessageListProps {
  chatId?: string
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
  onForward?: (message: ChatMessage) => void
  onDelete?: (message: ChatMessage) => void
  isSelecting?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  onSelectMessage?: (message: ChatMessage) => void
  onSelectAll?: (ids: string[]) => void
  onClearSelection?: () => void
}

export function ChatMessageList({
  chatId,
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
  onForward,
  onDelete,
  isSelecting = false,
  selectedIds,
  onToggleSelect,
  onSelectMessage,
  onSelectAll,
  onClearSelection,
}: ChatMessageListProps) {
  const { t } = useLingui()
  const { _ } = useLinguiRuntime()
  const { formatDate, formatTime, formatNumber } = useFormat()
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
  const [suppressHistoryReveal, setSuppressHistoryReveal] = useState(false)
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null)
  const [enteringMessageIds, setEnteringMessageIds] = useState<Set<string>>(
    () => new Set()
  )
  const prevMessageIdsRef = useRef<Set<string>>(new Set())

  useLayoutEffect(() => {
    if (suppressHistoryReveal || messagesQuery.isFetchingNextPage) {
      prevMessageIdsRef.current = new Set(chatMessages.map((m) => m.id))
      setEnteringMessageIds(new Set())
      return
    }

    if (isInitialLoadRef.current) {
      prevMessageIdsRef.current = new Set(chatMessages.map((m) => m.id))
      return
    }

    const prevIds = prevMessageIdsRef.current
    const last = chatMessages[chatMessages.length - 1]

    if (last && !prevIds.has(last.id)) {
      const toAnimate = new Set<string>()
      for (let i = chatMessages.length - 1; i >= 0; i--) {
        const message = chatMessages[i]
        if (prevIds.has(message.id)) break
        toAnimate.add(message.id)
      }
      if (toAnimate.size > 0) {
        setEnteringMessageIds(toAnimate)
      }
    }

    prevMessageIdsRef.current = new Set(chatMessages.map((m) => m.id))
  }, [chatMessages, suppressHistoryReveal, messagesQuery.isFetchingNextPage])

  useEffect(() => {
    if (enteringMessageIds.size === 0) return
    const id = window.setTimeout(
      () => setEnteringMessageIds(new Set()),
      MESSAGE_ENTER_MS
    )
    return () => window.clearTimeout(id)
  }, [enteringMessageIds])

  useEffect(() => {
    isInitialLoadRef.current = true
    prevMessageCountRef.current = 0
    prevMessageIdsRef.current = new Set()
    isAtBottomRef.current = true
    skipNextAutoScrollRef.current = false
    isLoadingMoreRef.current = false
    setSuppressHistoryReveal(false)
    setEnteringMessageIds(new Set())
    setNewMessageCount(0)
    setIsScrolledAwayFromBottom(false)
  }, [chatId])

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
      setSuppressHistoryReveal(true)
      requestAnimationFrame(() => setSuppressHistoryReveal(false))
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

  if (isLoadingMessages || messagesQuery.isPending) {
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
      <div className='flex flex-1 flex-col items-center justify-center'>
        <EmptyState
          icon={MessageCircle}
          title={t`No messages yet`}
          description={t`Be the first to say something!`}
        />
      </div>
    )
  }

  return (
    <div className='relative flex min-h-0 flex-1 flex-col'>
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onClick={() => !isSelecting && setActiveMessageId(null)}
        className='flex w-full flex-1 flex-col justify-start gap-4 overflow-y-auto px-4 py-2 pb-4'
      >
        {/* Load more trigger at top for older messages */}
        <LoadMoreTrigger
          onLoadMore={handleLoadMore}
          hasMore={messagesQuery.hasNextPage ?? false}
          isLoading={messagesQuery.isFetchingNextPage}
          rootMargin='100px'
        />

        <div className='flex flex-col gap-4'>
        {Object.keys(groupedMessages).map((key) => (
          <Fragment key={key}>
            {/* Date separator */}
            <div className='my-4 flex items-center justify-center'>
              {/* eslint-disable-next-line lingui/no-unlocalized-strings -- 'T00:00:00' is an ISO-8601 time component, not a UI label */}
              <div className='text-muted-foreground text-xs'>{formatDate(new Date(key + 'T00:00:00'))}</div>
            </div>

            {groupMessagesBySender(groupedMessages[key]).map((messageGroup) => {
              const isSentGroup = isCurrentUserMessage(messageGroup[0])
              return (
                <BubbleGroup key={messageGroup[0].id} className={cn("w-full mb-3", isSentGroup ? 'items-end' : 'items-start')}>
                  {messageGroup.map((message) => {
              const isSent = isCurrentUserMessage(message)
              const isSelected = selectedIds?.has(message.id) ?? false
              const isDeleted = message.deleted === true
              return (
                <div
                  key={message.id}
                  className={cn(
                    'flex w-full items-start gap-2 rounded-lg transition-colors',
                    isSelecting && 'cursor-pointer select-none',
                    isSelecting && isSelected && 'bg-primary/8'
                  )}
                  onClick={(e) => {
                    if (isSelecting) {
                      onToggleSelect?.(message.id)
                    } else {
                      e.stopPropagation()
                      setActiveMessageId((prev) => (prev === message.id ? null : message.id))
                    }
                  }}
                >
                  {/* Checkbox column — slides in when selection mode is active */}
                  <div
                    className={cn(
                      'flex shrink-0 items-center pt-3 transition-all duration-150',
                      isSelecting ? 'w-5 opacity-100' : 'w-0 overflow-hidden opacity-0'
                    )}
                  >
                    <Checkbox
                      checked={isSelected}
                      onClick={(e) => e.stopPropagation()}
                      onCheckedChange={() => onToggleSelect?.(message.id)}
                      aria-label={t`Select message`}
                    />
                  </div>

                  {/* Message content */}
                  <div
                    id={`chat-message-${message.id}`}
                    className={cn(
                      'group flex flex-1 flex-col gap-1 rounded-lg transition-shadow',
                      isSent ? 'items-end' : 'items-start',
                      highlightMessageId === message.id &&
                      'ring-primary/60 bg-primary/5 ring-2',
                      isSelecting && 'pointer-events-none'
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
                    <div
                      className={cn(
                        'flex w-full min-w-0 items-end gap-1',
                        isSent ? 'justify-end' : 'justify-start'
                      )}
                    >
                      {/* Hover actions moved to BubbleReactions */}

                      <Bubble
                        variant={isSent ? 'default' : 'muted'}
                        align={isSent ? 'end' : 'start'}
                        data-active={activeMessageId === message.id}
                        className={cn(
                          'transition-[opacity,transform,max-height] duration-300 ease-out',
                          isDeleted && 'scale-[0.97] opacity-60',
                          enteringMessageIds.has(message.id) &&
                            'animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-backwards duration-200 ease-out',
                          (!isSelecting && !isDeleted && message.reaction_counts && Object.keys(message.reaction_counts).length > 0) && 'mb-4'
                        )}
                      >
                        <BubbleContent
                          className={cn(
                            isDeleted &&
                              'bg-transparent text-muted-foreground italic border-dashed',
                            message.attachments?.length &&
                              'w-full max-w-full',
                            message.attachments?.length &&
                              !message.body &&
                              'px-1.5 py-1.5'
                          )}
                        >
                        {isDeleted ? (
                          <p className='text-muted-foreground text-sm italic'>
                            <Trans>This message was deleted</Trans>
                          </p>
                        ) : (
                          <>
                            {message.reply_to && onScrollToMessage ? (
                              <MessageQuote
                                quoted={messagesById.get(message.reply_to)}
                                isSent={isSent}
                                onClick={() => onScrollToMessage(message.reply_to!)}
                              />
                            ) : null}

                            {message.attachments?.length ? (
                              <MessageAttachments
                                attachments={message.attachments}
                                chatId={message.chat}
                                isSent={isSent}
                              />
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
                          </>
                        )}
                        </BubbleContent>
                        
                        {!isSelecting && !isDeleted ? (
                          <BubbleReactions
                            align={isSent ? 'end' : 'start'}
                            className={cn(
                              isSent ? "flex-row-reverse" : "flex-row",
                              (!message.reaction_counts || Object.keys(message.reaction_counts).length === 0)
                                ? actionPillExpandOpacityMap.bubble
                                : ""
                            )}
                          >
                            {(message.reaction_counts && Object.keys(message.reaction_counts).length > 0) && (
                              <MessageReactionSummary
                                counts={message.reaction_counts ?? {}}
                                activeReaction={message.my_reaction}
                              />
                            )}
                            
                            <div className={cn(
                              "flex items-center gap-0.5",
                              isSent ? "flex-row-reverse" : "flex-row",
                              (message.reaction_counts && Object.keys(message.reaction_counts).length > 0)
                                ? actionPillExpandMaxWidthMap.bubble[200]
                                : ""
                            )}>
                              {onReact && (
                                <MessageReactionPicker
                                  activeReaction={message.my_reaction}
                                  onSelect={(reaction) => onReact(message.id, reaction)}
                                  isSent={isSent}
                                  className="!opacity-100"
                                />
                              )}
                              {onReply && (
                                <MessageHoverActions
                                  message={message}
                                  onReply={onReply}
                                  onSelect={onSelectMessage ? () => onSelectMessage(message) : undefined}
                                  onForward={onForward ? () => onForward(message) : undefined}
                                  onDelete={onDelete ? () => onDelete(message) : undefined}
                                  canDelete={isSent}
                                  className="!opacity-100"
                                />
                              )}
                              <span className="text-muted-foreground/70 text-[10px] whitespace-nowrap px-1">
                                {formatTime(new Date(message.created * 1000))}
                              </span>
                            </div>
                          </BubbleReactions>
                        ) : null}
                      </Bubble>

                      {/* Hover actions moved to BubbleReactions */}
                    </div>
                  </div>
                </div>
              )
            })}
                </BubbleGroup>
              )
            })}
          </Fragment>
        ))}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {isSelecting ? (
        <div className='absolute bottom-3 left-1/2 z-10 -translate-x-1/2'>
          <div className='bg-background flex items-center gap-2 rounded-full border px-4 py-2 shadow-md'>
            <span className='text-sm font-medium'>
              {selectedIds?.size ?? 0} <Trans>selected</Trans>
            </span>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              className='h-7 rounded-full px-2 text-xs'
              onClick={() => onSelectAll?.(chatMessages.map((m) => m.id))}
              title={t`Selects messages loaded so far`}
            >
              <Trans>Select loaded</Trans>
            </Button>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              className='text-muted-foreground h-7 rounded-full px-2 text-xs'
              onClick={onClearSelection}
            >
              <Trans>Cancel</Trans>
            </Button>
          </div>
        </div>
      ) : isScrolledAwayFromBottom && !searchActive ? (
        <div className='absolute left-1/2 bottom-3 z-10'>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type='button'
                variant='outline'
                size='icon'
                className='bg-background relative size-10 rounded-full shadow-md'
                onClick={scrollToBottom}
                aria-label={
                  newMessageCount > 0
                    ? _(plural(newMessageCount, {
                      one: 'Jump to 1 new message',
                      other: 'Jump to # new messages',
                    }))
                    : t`Jump to bottom`
                }
              >
                <ChevronsDown className='size-5' />
                {newMessageCount > 0 ? (
                  <span className='bg-primary absolute -start-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white'>
                    {newMessageCount > 99 ? '99+' : formatNumber(newMessageCount)}
                  </span>
                ) : null}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {newMessageCount > 0
                ? _(plural(newMessageCount, {
                  one: 'Jump to 1 new message',
                  other: 'Jump to # new messages',
                }))
                : t`Jump to bottom`}
            </TooltipContent>
          </Tooltip>
        </div>
      ) : null}
    </div>
  )
}

