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
import type {
  UseInfiniteQueryResult,
  InfiniteData,
} from '@tanstack/react-query'
import { plural } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
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
  authenticatedUrl,
  BubbleGroup,
  useFormat,
  addressByAuthor,
} from '@mochi/web'
import { ChevronsDown, MessageCircle } from 'lucide-react'
import type { ChatMessage } from '@/api/chats'
import type { ChatReceipt, GetMessagesResponse } from '@/api/types/chats'
import type { ReactionId } from '../constants/reactions'
import { formatCountBadge } from '../utils'
import { collapseEarlierHistory, isEarlierHistory } from '../utils/encryption'
import { receiptState, seenBy } from '../utils/receipts'
import { InlineMessageEditor } from './inline-message-editor'
import {
  MessageBubble,
  type BubbleActions,
  type BubbleOffers,
} from './message-bubble'

const BOTTOM_THRESHOLD_PX = 80
const MESSAGE_ENTER_MS = 200
function groupMessagesBySender(messages: ChatMessage[]) {
  const groups: ChatMessage[][] = []
  let currentGroup: ChatMessage[] = []
  let currentSenderId: string | null = null

  for (const msg of messages) {
    // History from before the account was added to Mochi stands alone, as
    // one line for its run.
    if (isEarlierHistory(msg)) {
      if (currentGroup.length > 0) groups.push(currentGroup)
      groups.push([msg])
      currentGroup = []
      currentSenderId = null
    } else if (msg.member !== currentSenderId) {
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
  // Opens a message's thread; absent where threads are not offered.
  onThread?: (message: ChatMessage) => void
  // Each other member's watermarks, for the ticks on the user's own
  // messages; absent where the conversation has none to show.
  receipts?: ChatReceipt[]
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
  onStartEdit?: (message: ChatMessage) => void
  editingMessageId?: string | null
  editingBody?: string
  setEditingBody?: (val: string) => void
  isEditingSaving?: boolean
  isEditSaveDisabled?: boolean
  onSaveEdit?: (e?: React.FormEvent) => void
  onCancelEdit?: () => void
  /** Reports whether the list is pinned to the newest message. The page uses
   * it to decide whether an arriving message has actually been read. */
  onAtBottomChange?: (atBottom: boolean) => void
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
  onThread,
  receipts,
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
  onStartEdit,
  editingMessageId,
  editingBody,
  setEditingBody,
  isEditingSaving = false,
  isEditSaveDisabled = false,
  onSaveEdit,
  onCancelEdit,
  onAtBottomChange,
}: ChatMessageListProps) {
  const { t } = useLingui()
  const { formatDate, formatNumber, formatList } = useFormat()

  // The asset route is member-only, so the <img> carries the app token: cookies
  // are refused, and none are sent inside the shell's sandboxed iframe.
  // authenticatedUrl() in both windows. Core also accepts ?token=, but that
  // puts the raw app JWT in access logs, the Referer header and browser
  // history, and the shell branch was already avoiding it.
  const assetUrl = (path: string) => authenticatedUrl(path)

  // What the bubbles offer, and the callbacks behind it: the page makes the
  // callbacks anew on every render, so the bubbles read them from here when
  // one is used rather than compare them (message-bubble.tsx).
  const actions = useRef<BubbleActions>({})
  useLayoutEffect(() => {
    actions.current = {
      onReply,
      onThread,
      onReact,
      onScrollToMessage,
      onForward,
      onDelete,
      onSelectMessage,
      onStartEdit,
    }
  })
  const reply = Boolean(onReply)
  const thread = Boolean(onThread)
  const react = Boolean(onReact)
  const quote = Boolean(onScrollToMessage)
  const forward = Boolean(onForward)
  const remove = Boolean(onDelete)
  const select = Boolean(onSelectMessage)
  const offers = useMemo<BubbleOffers>(
    () => ({ reply, thread, react, quote, forward, remove, select }),
    [reply, thread, react, quote, forward, remove, select]
  )

  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const prevScrollHeightRef = useRef<number>(0)
  const isLoadingMoreRef = useRef(false)
  const skipNextAutoScrollRef = useRef(false)
  const isInitialLoadRef = useRef(true)
  const prevMessageCountRef = useRef<number>(0)
  const isAtBottomRef = useRef(true)
  const [isScrolledAwayFromBottom, setIsScrolledAwayFromBottom] =
    useState(false)

  // Report the state this component already keeps for its own scroll-to-bottom
  // button, rather than at each of the ten places the ref is touched: this is
  // the same signal, and it is the one the page needs to know whether an
  // arriving message was actually in front of the reader.
  useEffect(() => {
    onAtBottomChange?.(!isScrolledAwayFromBottom)
  }, [isScrolledAwayFromBottom, onAtBottomChange])
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
    collapseEarlierHistory(chatMessages).forEach((message) => {
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

  // One avatar address per sender across the loaded messages: the route names
  // a message, and any message of the chat answers with its sender's picture,
  // so building each message's own fetched the same picture once per message.
  const avatars = useMemo(
    () =>
      addressByAuthor(chatMessages, {
        getAuthor: (m) => m.member,
        getAddress: (m) => `${getAppPath()}/${m.chat}/-/${m.id}/asset`,
      }),
    [chatMessages]
  )
  const avatarFor = (m: ChatMessage) =>
    avatars.get(m.member) ?? `${getAppPath()}/${m.chat}/-/${m.id}/asset`

  const seen = useMemo(
    () =>
      isGroupChat
        ? seenBy(chatMessages, receipts ?? [], currentUserIdentity)
        : null,
    [isGroupChat, receipts, chatMessages, currentUserIdentity]
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
          root={scrollContainerRef}
        />

        <div className='flex flex-col gap-4'>
          {Object.keys(groupedMessages).map((key) => (
            <Fragment key={key}>
              {/* Date separator */}
              <div className='my-4 flex items-center justify-center'>
                <div className='text-muted-foreground text-xs'>
                  {formatDate(new Date(key + 'T00:00:00'))}
                </div>
              </div>

              {groupMessagesBySender(groupedMessages[key]).map(
                (messageGroup) => {
                  if (isEarlierHistory(messageGroup[0])) {
                    return (
                      <p
                        key={messageGroup[0].id}
                        className='text-muted-foreground mb-4 text-center text-xs italic'
                      >
                        <Trans>
                          Messages from before this account was added to Mochi
                          are encrypted and can't be read here
                        </Trans>
                      </p>
                    )
                  }
                  const isSentGroup = isCurrentUserMessage(messageGroup[0])
                  return (
                    <BubbleGroup
                      key={messageGroup[0].id}
                      className={cn(
                        'mb-4 w-full gap-1',
                        isSentGroup ? 'items-end' : 'items-start'
                      )}
                    >
                      {messageGroup.map((message, index) => {
                        const isSent = isCurrentUserMessage(message)
                        const isSelected = selectedIds?.has(message.id) ?? false
                        return (
                          <div
                            key={message.id}
                            className={cn(
                              'flex w-full items-start gap-2 rounded-lg transition-colors',
                              isSelecting && 'cursor-pointer select-none',
                              isSelecting && isSelected && 'bg-primary/8',
                              // Dim siblings without transition — animating opacity on every
                              // row at once is expensive on long threads.
                              editingMessageId &&
                                editingMessageId !== message.id &&
                                'opacity-40'
                            )}
                            onClick={(e) => {
                              if (isSelecting) {
                                onToggleSelect?.(message.id)
                              } else {
                                e.stopPropagation()
                                setActiveMessageId((prev) =>
                                  prev === message.id ? null : message.id
                                )
                              }
                            }}
                          >
                            {/* Checkbox column — slides in when selection mode is active */}
                            <div
                              className={cn(
                                'flex shrink-0 items-center pt-3 transition-all duration-150',
                                isSelecting
                                  ? 'w-5 opacity-100'
                                  : 'w-0 overflow-hidden opacity-0'
                              )}
                            >
                              <Checkbox
                                checked={isSelected}
                                onClick={(e) => e.stopPropagation()}
                                onCheckedChange={() =>
                                  onToggleSelect?.(message.id)
                                }
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
                              {/* Message bubble + avatar (left, group incoming) + hover actions */}
                              <div
                                className={cn(
                                  'flex w-full min-w-0 gap-1.5',
                                  isGroupChat && !isSent
                                    ? 'items-start'
                                    : 'items-end',
                                  isSent ? 'justify-end' : 'justify-start'
                                )}
                              >
                                {isGroupChat &&
                                  !isSent &&
                                  (index === 0 ? (
                                    <EntityAvatar
                                      src={assetUrl(
                                        `${avatarFor(message)}/avatar`
                                      )}
                                      styleUrl={assetUrl(
                                        `${avatarFor(message)}/style`
                                      )}
                                      seed={message.member}
                                      name={message.name}
                                      size='xs'
                                      className='mt-0.5 shrink-0'
                                    />
                                  ) : (
                                    <div className='w-5 shrink-0' />
                                  ))}

                                {editingMessageId === message.id ? (
                                  <InlineMessageEditor
                                    value={editingBody ?? ''}
                                    onValueChange={(val) =>
                                      setEditingBody?.(val)
                                    }
                                    onSave={() => onSaveEdit?.()}
                                    onCancel={() => onCancelEdit?.()}
                                    isSent={isSent}
                                    saveDisabled={Boolean(isEditSaveDisabled)}
                                    saving={Boolean(isEditingSaving)}
                                  />
                                ) : (
                                  <MessageBubble
                                    message={message}
                                    quoted={
                                      message.reply
                                        ? messagesById.get(message.reply)
                                        : undefined
                                    }
                                    isSent={isSent}
                                    named={Boolean(
                                      isGroupChat &&
                                      !isSent &&
                                      index === 0 &&
                                      message.name
                                    )}
                                    active={activeMessageId === message.id}
                                    entering={enteringMessageIds.has(
                                      message.id
                                    )}
                                    isSelecting={isSelecting}
                                    highlight={
                                      searchActive &&
                                      searchQuery.length >= 2 &&
                                      matchedMessageIds?.has(message.id)
                                        ? searchQuery
                                        : ''
                                    }
                                    current={activeMatchId === message.id}
                                    receipt={
                                      isSent && receipts && !message.deleted
                                        ? receiptState(
                                            message,
                                            receipts,
                                            currentUserIdentity
                                          )
                                        : null
                                    }
                                    offers={offers}
                                    actions={actions}
                                  />
                                )}

                                {/* Hover actions moved to BubbleReactions */}
                              </div>
                              {seen && seen.id === message.id ? (
                                <p className='text-muted-foreground px-1 text-end text-[11px]'>
                                  {t`Seen by ${formatList(seen.names)}`}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        )
                      })}
                    </BubbleGroup>
                  )
                }
              )}
            </Fragment>
          ))}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {isSelecting ? (
        <div className='absolute bottom-3 left-1/2 z-10 -translate-x-1/2'>
          <div className='bg-background flex items-center gap-2 rounded-full border px-4 py-2 shadow-md'>
            <span className='text-sm font-medium'>
              {plural(selectedIds?.size ?? 0, {
                one: '# selected',
                other: '# selected',
              })}
            </span>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              className='h-7 rounded-full px-2 text-xs'
              onClick={() => onSelectAll?.(chatMessages.map((m) => m.id))}
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
        <div className='absolute bottom-3 left-1/2 z-10'>
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
                    ? plural(newMessageCount, {
                        one: 'Jump to # new message',
                        other: 'Jump to # new messages',
                      })
                    : t`Jump to bottom`
                }
              >
                <ChevronsDown className='size-5' />
                {newMessageCount > 0 ? (
                  <span className='bg-primary absolute -start-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white'>
                    {formatCountBadge(newMessageCount, formatNumber)}
                  </span>
                ) : null}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {newMessageCount > 0
                ? plural(newMessageCount, {
                    one: 'Jump to # new message',
                    other: 'Jump to # new messages',
                  })
                : t`Jump to bottom`}
            </TooltipContent>
          </Tooltip>
        </div>
      ) : null}
    </div>
  )
}
