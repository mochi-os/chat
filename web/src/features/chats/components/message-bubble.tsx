// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { Fragment, memo, type RefObject } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  Bubble,
  BubbleContent,
  BubbleReactions,
  QuoteCard,
  actionPillExpandMaxWidthMap,
  actionPillExpandOpacityMap,
  cn,
  useFormat,
} from '@mochi/web'
import { Check, CheckCheck } from 'lucide-react'
import type { ChatMessage } from '@/api/chats'
import type { ReactionId } from '../constants/reactions'
import {
  CHAT_MEDIA_BUBBLE_CLASS,
  CHAT_MEDIA_GRID_BUBBLE_CLASS,
  attachmentsHaveVisualMedia,
  attachmentsNeedFixedMediaWidth,
} from '../utils/chat-media-size'
import { highlightSearchText } from '../utils/highlight-search-text'
import type { ReceiptState } from '../utils/receipts'
import { MessageAttachments } from './message-attachments'
import { MessageBody } from './message-body'
import { MessageHoverActions } from './message-hover-actions'
import { MessageQuote } from './message-quote'
import {
  MessageReactionPicker,
  MessageReactionSummary,
} from './message-reaction-bar'
import { ThreadReplies } from './thread-replies'

/** Edit = body text only. Media-only / deleted / others' messages stay non-editable. */
export function canEditMessage(message: ChatMessage, isOwn: boolean): boolean {
  return isOwn && message.deleted !== true && Boolean(message.body?.trim())
}

/** The list's callbacks, read when a bubble calls one rather than compared:
 * the page makes them anew on every render, so a bubble compared on them drew
 * again, every reply in it included, for each message that arrived. */
export interface BubbleActions {
  onReply?: (message: ChatMessage) => void
  onThread?: (message: ChatMessage) => void
  onReact?: (messageId: string, reaction: ReactionId | '') => void
  onScrollToMessage?: (messageId: string) => void
  onForward?: (message: ChatMessage) => void
  onDelete?: (message: ChatMessage) => void
  onSelectMessage?: (message: ChatMessage) => void
  onStartEdit?: (message: ChatMessage) => void
}

/** Which of the actions the list offers: these change what a bubble draws. */
export interface BubbleOffers {
  reply: boolean
  thread: boolean
  react: boolean
  quote: boolean
  forward: boolean
  remove: boolean
  select: boolean
}

interface MessageBubbleProps {
  message: ChatMessage
  // The message it quotes, where that is loaded.
  quoted?: ChatMessage
  isSent: boolean
  // The sender's name above it: the first of their run in a group.
  named: boolean
  active: boolean
  entering: boolean
  isSelecting: boolean
  // The search text to mark in it, or ''.
  highlight: string
  // Whether it is the search's current match.
  current: boolean
  // The tick on the user's own message, or null for none.
  receipt: ReceiptState | null
  offers: BubbleOffers
  actions: RefObject<BubbleActions>
}

/**
 * One message's bubble. Memoised with React's own shallow comparison, which
 * is the right one here: every prop is a value, or a reference that changes
 * only with what the bubble draws (the message and the one it quotes keep
 * their identity in the cache until they change, offers until an action comes
 * or goes), and actions is one ref for the list's life.
 */
export const MessageBubble = memo(function MessageBubble({
  message,
  quoted,
  isSent,
  named,
  active,
  entering,
  isSelecting,
  highlight,
  current,
  receipt,
  offers,
  actions,
}: MessageBubbleProps) {
  const { formatTime } = useFormat()
  const isDeleted = message.deleted === true
  // An encrypted message whose keys have not come shows no content until they
  // do.
  const isEncrypted =
    Boolean(message.encrypted) && !message.body && !message.attachments?.length
  // Photos in the bubble, its own or its thread's, give it the photo column's
  // width.
  const hasPhotos =
    attachmentsHaveVisualMedia(message.attachments) ||
    Boolean(
      offers.thread &&
      !isDeleted &&
      message.answers?.some((answer) =>
        attachmentsHaveVisualMedia(answer.attachments)
      )
    )
  const editable = canEditMessage(message, isSent)
  const reacted = Boolean(
    message.reactions && Object.keys(message.reactions).length > 0
  )

  return (
    <Bubble
      variant={isSent ? 'default' : 'muted'}
      align={isSent ? 'end' : 'start'}
      data-active={active}
      className={cn(
        'transition-[opacity,transform,max-height] duration-300 ease-out',
        isDeleted && 'scale-[0.97] opacity-60',
        entering &&
          'animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-backwards duration-200 ease-out',
        !isSelecting && !isDeleted && reacted && 'mb-4'
      )}
    >
      {named ? (
        <span className='text-muted-foreground -mb-0.5 ml-1.5 text-xs font-semibold'>
          {message.name}
        </span>
      ) : null}
      <BubbleContent
        className={cn(
          (isDeleted || isEncrypted) &&
            'text-muted-foreground border-dashed bg-transparent italic',
          attachmentsNeedFixedMediaWidth(message.attachments) &&
            (message.body
              ? 'w-fit max-w-[calc(100vw-4.5rem)] min-w-[min(17.5rem,calc(100vw-4.5rem))]'
              : CHAT_MEDIA_BUBBLE_CLASS),
          hasPhotos && CHAT_MEDIA_GRID_BUBBLE_CLASS,
          message.attachments?.length && !message.body && 'px-1.5 py-1.5'
        )}
      >
        {isDeleted ? (
          <p className='text-muted-foreground text-sm italic'>
            <Trans>This message was deleted</Trans>
          </p>
        ) : isEncrypted ? (
          <p className='text-muted-foreground text-sm italic'>
            {message.encrypted === 3 ? (
              <Trans>Encrypted for other devices only</Trans>
            ) : (
              <Trans>Encrypted message</Trans>
            )}
          </p>
        ) : (
          <>
            {message.reply && offers.quote ? (
              <MessageQuote
                quoted={quoted}
                isSent={isSent}
                onClick={() =>
                  actions.current.onScrollToMessage?.(message.reply!)
                }
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
                className={message.attachments?.length ? 'mt-2' : undefined}
              >
                {/* Mentions first, then the search highlight on the plain
                    text between them. */}
                {message.body.split(/(@\[[^\]]+\])/g).map((part, i) => {
                  if (part.startsWith('@[')) {
                    return (
                      <span
                        key={i}
                        className={cn(
                          'rounded-sm px-1 py-0.5 font-medium',
                          isSent
                            ? 'bg-primary-foreground/20 text-primary-foreground'
                            : 'bg-primary/15 text-primary'
                        )}
                      >
                        @{part.slice(2, -1)}
                      </span>
                    )
                  }
                  if (highlight) {
                    return (
                      <Fragment key={i}>
                        {highlightSearchText(part, highlight, current)}
                      </Fragment>
                    )
                  }
                  return <Fragment key={i}>{part}</Fragment>
                })}
              </MessageBody>
            ) : null}

            {message.quote ? (
              <QuoteCard
                quote={message.quote}
                className={cn(
                  'mt-2',
                  isSent &&
                    'border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground'
                )}
              />
            ) : null}
          </>
        )}
        {/* The thread, in the message's own bubble below a rule. */}
        {offers.thread && message.answers?.length && !isDeleted ? (
          <ThreadReplies
            answers={message.answers}
            replies={message.replies ?? message.answers.length}
            isSent={isSent}
            onOpen={() => actions.current.onThread?.(message)}
          />
        ) : null}
      </BubbleContent>

      {!isSelecting && !isDeleted ? (
        <BubbleReactions
          align={isSent ? 'end' : 'start'}
          className={cn(
            'rounded-lg',
            isSent ? 'flex-row-reverse' : 'flex-row',
            !reacted ? actionPillExpandOpacityMap.bubble : ''
          )}
        >
          {reacted && (
            <MessageReactionSummary
              counts={message.reactions ?? {}}
              activeReaction={message.reaction}
            />
          )}

          <div
            className={cn(
              'flex items-center gap-0.5',
              isSent ? 'flex-row-reverse' : 'flex-row',
              reacted ? actionPillExpandMaxWidthMap.bubble[200] : ''
            )}
          >
            {offers.react && (
              <MessageReactionPicker
                activeReaction={message.reaction}
                onSelect={(reaction) =>
                  actions.current.onReact?.(message.id, reaction)
                }
                isSent={isSent}
                className='!opacity-100'
              />
            )}
            {offers.reply && (
              <MessageHoverActions
                message={message}
                onReply={(replied) => actions.current.onReply?.(replied)}
                onThread={
                  offers.thread && !message.deleted
                    ? () => actions.current.onThread?.(message)
                    : undefined
                }
                onSelect={
                  offers.select
                    ? () => actions.current.onSelectMessage?.(message)
                    : undefined
                }
                onForward={
                  offers.forward
                    ? () => actions.current.onForward?.(message)
                    : undefined
                }
                onDelete={
                  offers.remove
                    ? () => actions.current.onDelete?.(message)
                    : undefined
                }
                onEdit={
                  editable
                    ? () => actions.current.onStartEdit?.(message)
                    : undefined
                }
                canDelete={isSent}
                canEdit={editable}
                className='!opacity-100'
              />
            )}
            <span className='text-muted-foreground/70 px-1 text-[10px] whitespace-nowrap'>
              {formatTime(new Date(message.created * 1000))}
              {message.edited ? (
                <span className='ml-1 italic'>
                  <Trans>(edited)</Trans>
                </span>
              ) : null}
              {receipt ? <ReceiptTick state={receipt} /> : null}
            </span>
          </div>
        </BubbleReactions>
      ) : null}
    </Bubble>
  )
})

/** The tick on the user's own message: one when sent, two when delivered,
 * two in the primary colour when read. */
function ReceiptTick({ state }: { state: ReceiptState }) {
  const { t } = useLingui()
  const label =
    state === 'read'
      ? t({ message: 'Read', context: 'receipt' })
      : state === 'delivered'
        ? t({ message: 'Delivered', context: 'receipt' })
        : t({ message: 'Sent', context: 'receipt' })
  const Icon = state === 'sent' ? Check : CheckCheck
  return (
    <Icon
      role='img'
      aria-label={label}
      className={cn(
        'ml-1 inline size-3 align-[-2px]',
        state === 'read' && 'text-primary'
      )}
    />
  )
}
