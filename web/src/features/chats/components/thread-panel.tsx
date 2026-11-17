// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  BubbleReactions,
  Button,
  GeneralError,
  SidePanel,
  SidePanelBody,
  SidePanelFooter,
  SidePanelHeader,
  SidePanelTitle,
  Skeleton,
  Textarea,
  actionPillExpandMaxWidthMap,
  actionPillExpandOpacityMap,
  cn,
  getErrorMessage,
  toast,
  useFormat,
} from '@mochi/web'
import { Check, Send } from 'lucide-react'
import { chatsApi, type ChatMessage, type ReactionId } from '@/api/chats'
import {
  chatKeys,
  useEditMessageMutation,
  useThreadMessagesQuery,
} from '@/hooks/useChats'
import { MESSAGE_MAX_LENGTH } from '../constants/limits'
import { messageSize } from '../utils'
import { MessageAttachments } from './message-attachments'
import { MessageBody } from './message-body'
import { MessageHoverActions } from './message-hover-actions'
import {
  MessageReactionPicker,
  MessageReactionSummary,
} from './message-reaction-bar'

// How long the websocket gets to bring the user's own reply before the
// thread is fetched again, as the main timeline's send path waits.
const SOCKET_DELIVERY_GRACE = 1500

interface ThreadPanelProps {
  chatId: string
  // The message the thread is under; null while no thread is open.
  root: ChatMessage | null
  currentUserIdentity: string
  canWrite: boolean
  onClose: () => void
  // The page's own forward and delete dialogs, as the main timeline uses.
  onForward?: (message: ChatMessage) => void
  onDelete?: (message: ChatMessage) => void
}

/** A message's thread: the message, its replies, and a reply box. */
export function ThreadPanel({
  chatId,
  root,
  currentUserIdentity,
  canWrite,
  onClose,
  onForward,
  onDelete,
}: ThreadPanelProps) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const query = useThreadMessagesQuery(chatId, root?.id)
  const replies = useMemo(
    () => [...(query.data?.pages ?? [])].reverse().flatMap((p) => p.messages),
    [query.data?.pages]
  )
  const [body, setBody] = useState('')
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(
    null
  )

  // A reply's reaction or edit changes the thread's own query, which the
  // main timeline's patches do not reach.
  const refresh = (thread: string) =>
    queryClient.invalidateQueries({ queryKey: chatKeys.thread(chatId, thread) })

  const react = useMutation({
    mutationFn: ({
      message,
      reaction,
    }: {
      message: string
      reaction: ReactionId | ''
      thread: string
    }) => chatsApi.reactToMessage(chatId, message, reaction),
    onSuccess: (_data, { thread }) => refresh(thread),
    onError: (error) => toast.error(getErrorMessage(error, t`Failed to react`)),
  })

  const edit = useEditMessageMutation({
    onSuccess: () => {
      setEditing(null)
      if (root) void refresh(root.id)
    },
    onError: (error) =>
      toast.error(getErrorMessage(error, t`Failed to edit message`)),
  })

  const saveEdit = (message: ChatMessage) => {
    const text = editing?.body.trim() ?? ''
    if (!text || edit.isPending) return
    if (text === message.body?.trim()) {
      setEditing(null)
      return
    }
    if (messageSize(text) > MESSAGE_MAX_LENGTH) {
      toast.error(t`Message is too long`)
      return
    }
    edit.mutate({ chatId, messageId: message.id, body: text })
  }

  // The thread travels with the send rather than being read from root, which
  // is null once the panel closes and another message once a different thread
  // opens: the grace check below runs after both can have happened.
  const send = useMutation({
    mutationFn: ({ text, thread }: { text: string; thread: string }) =>
      chatsApi.sendMessage(chatId, { body: text, thread }),
    onSuccess: (data, { thread }) => {
      setBody('')
      window.setTimeout(() => {
        const delivered = queryClient
          .getQueryData<{ pages: { messages: ChatMessage[] }[] }>(
            chatKeys.thread(chatId, thread)
          )
          ?.pages.some((page) => page.messages.some((m) => m.id === data.id))
        if (!delivered) {
          void queryClient.invalidateQueries({
            queryKey: chatKeys.thread(chatId, thread),
          })
        }
      }, SOCKET_DELIVERY_GRACE)
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t`Failed to send message`))
    },
  })

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const text = body.trim()
    if (!text || !root || send.isPending) return
    // The main composer's rule: the server measures the body in bytes.
    if (messageSize(text) > MESSAGE_MAX_LENGTH) {
      toast.error(t`Message is too long`)
      return
    }
    send.mutate({ text, thread: root.id })
  }

  return (
    <SidePanel
      open={Boolean(root)}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      size='md'
      dismissOnOutsideClick={!body.trim()}
    >
      <SidePanelHeader>
        <SidePanelTitle>
          <Trans>Thread</Trans>
        </SidePanelTitle>
      </SidePanelHeader>
      <SidePanelBody className='space-y-4'>
        {root ? (
          <ThreadMessage
            message={root}
            isSent={root.member === currentUserIdentity}
          />
        ) : null}
        <div className='space-y-3 border-t pt-4'>
          {query.hasNextPage ? (
            <Button
              variant='outline'
              size='sm'
              onClick={() => void query.fetchNextPage()}
              loading={query.isFetchingNextPage}
            >
              <Trans>Show earlier replies</Trans>
            </Button>
          ) : null}
          {query.isLoading ? (
            <Skeleton className='h-16 w-full' />
          ) : query.error ? (
            <GeneralError
              error={query.error}
              minimal
              mode='inline'
              reset={query.refetch}
            />
          ) : (
            replies.map((message) => {
              const isSent = message.member === currentUserIdentity
              const open = canWrite && !message.deleted && root
              return (
                <ThreadMessage
                  key={message.id}
                  message={message}
                  isSent={isSent}
                  actions={
                    open ? (
                      <>
                        <MessageReactionPicker
                          activeReaction={message.reaction}
                          onSelect={(reaction) =>
                            react.mutate({
                              message: message.id,
                              reaction,
                              thread: root.id,
                            })
                          }
                          isSent={isSent}
                          className='!opacity-100'
                        />
                        <MessageHoverActions
                          message={message}
                          onForward={
                            onForward ? () => onForward(message) : undefined
                          }
                          onDelete={
                            onDelete ? () => onDelete(message) : undefined
                          }
                          onEdit={() =>
                            setEditing({
                              id: message.id,
                              body: message.body ?? '',
                            })
                          }
                          canDelete={isSent}
                          canEdit={isSent && Boolean(message.body?.trim())}
                          className='!opacity-100'
                        />
                      </>
                    ) : null
                  }
                  editor={
                    editing?.id === message.id ? (
                      <div className='space-y-2'>
                        <Textarea
                          aria-label={t`Edit`}
                          className='max-h-40 min-h-10 resize-none'
                          rows={1}
                          autoFocus
                          value={editing.body}
                          onChange={(event) =>
                            setEditing({
                              id: message.id,
                              body: event.target.value,
                            })
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                              event.preventDefault()
                              saveEdit(message)
                            } else if (event.key === 'Escape') {
                              event.preventDefault()
                              setEditing(null)
                            }
                          }}
                        />
                        <div className='flex justify-end gap-2'>
                          <Button
                            type='button'
                            variant='ghost'
                            size='sm'
                            onClick={() => setEditing(null)}
                          >
                            <Trans>Cancel</Trans>
                          </Button>
                          <Button
                            type='button'
                            size='sm'
                            disabled={!editing.body.trim()}
                            loading={edit.isPending}
                            icon={<Check className='size-3' />}
                            onClick={() => saveEdit(message)}
                          >
                            <Trans>Save</Trans>
                          </Button>
                        </div>
                      </div>
                    ) : null
                  }
                />
              )
            })
          )}
        </div>
      </SidePanelBody>
      {canWrite ? (
        <SidePanelFooter>
          <form onSubmit={submit} className='flex items-end gap-2'>
            <Textarea
              aria-label={t`Reply in thread`}
              className='max-h-40 min-h-10 flex-1 resize-none'
              rows={1}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) submit(event)
              }}
            />
            <Button
              type='submit'
              disabled={!body.trim()}
              loading={send.isPending}
              icon={<Send className='size-4' />}
            >
              <Trans>Send</Trans>
            </Button>
          </form>
        </SidePanelFooter>
      ) : null}
    </SidePanel>
  )
}

// The main timeline's pill only shows on hover, which a touch screen has none
// of; there the bubble's tap state shows it, and a thread row has no tap state.
const TOUCH = '[@media(hover:none)]:opacity-100'
const TOUCH_EXPAND =
  '[@media(hover:none)]:max-w-[200px] [@media(hover:none)]:opacity-100'

// One message of the thread. A reply carries the main timeline's pill, laid
// out as on a sent bubble: half below the row's bottom edge at its right, the
// reactions at the pill's right end where they stay, and the picker and menu
// sliding in to their left on hover. The root's actions are on its bubble in
// the timeline; its reactions show here alone.
function ThreadMessage({
  message,
  isSent,
  actions,
  editor,
}: {
  message: ChatMessage
  isSent: boolean
  actions?: React.ReactNode
  editor?: React.ReactNode
}) {
  const { formatTimestamp } = useFormat()
  const reacted =
    !message.deleted &&
    message.reactions &&
    Object.keys(message.reactions).length > 0
  return (
    <div
      className={cn(
        'relative space-y-1',
        actions && 'group/bubble hover:bg-hover -mx-2 rounded-lg px-2 py-1.5',
        // Room for a pill that always shows, which reaches below the row.
        reacted && 'mb-6'
      )}
    >
      <div className='flex items-center gap-2 text-sm'>
        <span className='font-medium'>{message.name}</span>
        <span className='text-muted-foreground text-xs'>
          {formatTimestamp(message.created)}
          {message.edited ? (
            <span className='ms-1 italic'>
              <Trans>(edited)</Trans>
            </span>
          ) : null}
        </span>
      </div>
      {message.deleted ? (
        <p className='text-muted-foreground text-sm italic'>
          <Trans>This message was deleted</Trans>
        </p>
      ) : editor ? (
        editor
      ) : (
        <>
          {message.attachments?.length ? (
            <MessageAttachments
              attachments={message.attachments}
              chatId={message.chat}
              isSent={isSent}
            />
          ) : null}
          {message.body ? (
            <MessageBody isSent={isSent}>{message.body}</MessageBody>
          ) : null}
        </>
      )}
      {reacted || actions ? (
        <BubbleReactions
          align='end'
          className={cn(
            'flex-row-reverse rounded-lg',
            !reacted && cn(actionPillExpandOpacityMap.bubble, TOUCH)
          )}
        >
          {reacted ? (
            <MessageReactionSummary
              counts={message.reactions ?? {}}
              activeReaction={message.reaction}
            />
          ) : null}
          {actions ? (
            <div
              className={cn(
                'flex flex-row-reverse items-center gap-0.5',
                reacted &&
                  cn(actionPillExpandMaxWidthMap.bubble[200], TOUCH_EXPAND)
              )}
            >
              {actions}
            </div>
          ) : null}
        </BubbleReactions>
      ) : null}
    </div>
  )
}
