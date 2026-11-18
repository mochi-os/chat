// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  BubbleReactions,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  GeneralError,
  SidePanel,
  SidePanelBody,
  SidePanelFooter,
  SidePanelHeader,
  SidePanelTitle,
  Skeleton,
  actionPillExpandMaxWidthMap,
  absoluteRouteUrl,
  actionPillExpandOpacityMap,
  cn,
  getErrorMessage,
  shellClipboardWrite,
  shellOpenExternal,
  toast,
  useFormat,
} from '@mochi/web'
import { EditorContent } from '@tiptap/react'
import {
  Check,
  ExternalLink,
  Link as LinkIcon,
  MoreHorizontal,
  Send,
} from 'lucide-react'
import { chatsApi, type ChatMessage, type ReactionId } from '@/api/chats'
import {
  chatKeys,
  useEditMessageMutation,
  useThreadMessagesQuery,
} from '@/hooks/useChats'
import { MESSAGE_MAX_LENGTH } from '../constants/limits'
import { useMessageEditor } from '../editor/use-message-editor'
import { messageSize } from '../utils'
import {
  CHAT_MEDIA_BUBBLE_CLASS,
  CHAT_MEDIA_GRID_BUBBLE_CLASS,
  attachmentsHaveVisualMedia,
} from '../utils/chat-media-size'
import { checkIsAtBottom, pinToBottom } from '../utils/scroll'
import { FormattingToolbar } from './formatting-toolbar'
import { MessageAttachments } from './message-attachments'
import { MessageBody } from './message-body'
import { MessageHoverActions } from './message-hover-actions'
import {
  MessageReactionPicker,
  MessageReactionSummary,
} from './message-reaction-bar'
import { MessageText } from './message-text'

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

/** A message's thread in a side panel over the conversation. */
export function ThreadPanel({
  chatId,
  root,
  currentUserIdentity,
  canWrite,
  onClose,
  onForward,
  onDelete,
}: ThreadPanelProps) {
  // Held here, not in the view, so a reply being typed outlives the panel
  // closing and opening again, as it did before the view was shared.
  const [draft, setDraft] = useState('')
  return (
    <SidePanel
      open={Boolean(root)}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      size='md'
      dismissOnOutsideClick={!draft.trim()}
    >
      <SidePanelHeader
        actions={
          root ? (
            <ThreadMenu chatId={chatId} rootId={root.id} onOpened={onClose} />
          ) : null
        }
      >
        <SidePanelTitle>
          <Trans>Thread</Trans>
        </SidePanelTitle>
      </SidePanelHeader>
      {root ? (
        <ThreadView
          layout='panel'
          chatId={chatId}
          rootId={root.id}
          root={root}
          currentUserIdentity={currentUserIdentity}
          canWrite={canWrite}
          onForward={onForward}
          onDelete={onDelete}
          draft={draft}
          onDraftChange={setDraft}
        />
      ) : null}
    </SidePanel>
  )
}

/** The thread's own page, as the panel's menu opens and copies it. */
function useThreadUrl(chatId: string, rootId: string): () => string {
  const router = useRouter()
  return () =>
    absoluteRouteUrl(router, {
      to: '/$chatId/thread/$messageId',
      params: { chatId, messageId: rootId },
    })
}

/** Slack's thread menu: the thread on its own page, or its address. */
function ThreadMenu({
  chatId,
  rootId,
  onOpened,
}: {
  chatId: string
  rootId: string
  onOpened: () => void
}) {
  const { t } = useLingui()
  const url = useThreadUrl(chatId, rootId)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          className='size-8'
          aria-label={t`Thread options`}
        >
          <MoreHorizontal className='size-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuItem
          onSelect={() => {
            // The thread goes to its own window, so it leaves this one.
            if (shellOpenExternal(url())) onOpened()
          }}
        >
          <ExternalLink className='me-2 size-4' />
          <Trans>Open in new window</Trans>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            void shellClipboardWrite(url()).then((ok) => {
              if (ok) toast.success(t`Copied to clipboard`)
              else toast.error(t`Failed to copy`)
            })
          }}
        >
          <LinkIcon className='me-2 size-4' />
          <Trans>Copy link</Trans>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface ThreadViewProps {
  // In the side panel, or on the thread's own page.
  layout: 'panel' | 'page'
  chatId: string
  rootId: string
  // The root message itself; undefined while the page still looks for it,
  // null once it gave up.
  root: ChatMessage | null | undefined
  currentUserIdentity: string
  canWrite: boolean
  onForward?: (message: ChatMessage) => void
  onDelete?: (message: ChatMessage) => void
  // The reply being typed.
  draft: string
  onDraftChange: (draft: string) => void
}

/**
 * A message's thread: the message, its replies, and a reply box. Shared by
 * the side panel and the thread's own page, which differ only in what holds
 * the scrolling body and the reply box.
 */
export function ThreadView({
  layout,
  chatId,
  rootId,
  root,
  currentUserIdentity,
  canWrite,
  onForward,
  onDelete,
  draft: body,
  onDraftChange: setBody,
}: ThreadViewProps) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const query = useThreadMessagesQuery(chatId, rootId)
  const replies = useMemo(
    () => [...(query.data?.pages ?? [])].reverse().flatMap((p) => p.messages),
    [query.data?.pages]
  )
  // New replies are followed as the main timeline follows new messages: the
  // user's own always, anyone else's while the panel is already at the
  // bottom. Earlier replies loaded above, and the thread first showing, move
  // nothing.
  const bodyRef = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const followed = useRef<{
    root?: string
    newest?: string
    loaded: boolean
  }>({ loaded: false })
  const newest = replies[replies.length - 1]
  const loaded = query.isSuccess
  useLayoutEffect(() => {
    const el = bodyRef.current
    const last = followed.current
    followed.current = { root: rootId, newest: newest?.id, loaded }
    // Only a reply arriving in a thread already shown, so the first reply
    // of a thread that had none counts too.
    if (!el || !newest || last.root !== rootId || !last.loaded) return
    if (newest.id === last.newest) return
    if (newest.member === currentUserIdentity) {
      if (atBottom.current) pinToBottom(el)
      else el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      atBottom.current = true
    } else if (atBottom.current) {
      pinToBottom(el)
    }
  }, [rootId, newest, loaded, currentUserIdentity])
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
      void refresh(rootId)
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

  const submit = (event?: React.FormEvent) => {
    event?.preventDefault()
    const text = body.trim()
    if (!text || send.isPending) return
    // The main composer's rule: the server measures the body in bytes.
    if (messageSize(text) > MESSAGE_MAX_LENGTH) {
      toast.error(t`Message is too long`)
      return
    }
    send.mutate({ text, thread: rootId })
  }

  const { editor: replyEditor } = useMessageEditor({
    value: body,
    onValueChange: setBody,
    onSubmit: () => submit(),
    ariaLabel: t`Reply in thread`,
    className: 'max-h-40',
  })

  // The panel's own body and footer, or the page's plain equivalents.
  const Body = layout === 'panel' ? SidePanelBody : PageBody
  const Footer = layout === 'panel' ? SidePanelFooter : PageFooter

  return (
    <>
      <Body
        ref={bodyRef}
        className='space-y-4'
        onScroll={(event) => {
          atBottom.current = checkIsAtBottom(event.currentTarget)
        }}
      >
        {root ? (
          <ThreadMessage
            message={root}
            isSent={root.member === currentUserIdentity}
          />
        ) : root === undefined ? (
          <Skeleton className='h-16 w-full' />
        ) : (
          <p className='text-muted-foreground text-sm italic'>
            <Trans>Message not available</Trans>
          </p>
        )}
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
              const open = canWrite && !message.deleted
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
                              thread: rootId,
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
                      <ThreadEditBox
                        value={editing.body}
                        onValueChange={(next) =>
                          setEditing({ id: message.id, body: next })
                        }
                        onSave={() => saveEdit(message)}
                        onCancel={() => setEditing(null)}
                        saving={edit.isPending}
                      />
                    ) : null
                  }
                />
              )
            })
          )}
        </div>
      </Body>
      {canWrite ? (
        <Footer>
          <form onSubmit={submit} className='flex flex-col gap-1'>
            <FormattingToolbar editor={replyEditor} className='-ms-1.5' />
            <div className='flex items-end gap-2'>
              <EditorContent
                editor={replyEditor}
                className={cn(BOX_CLASS, 'flex-1')}
              />
              <Button
                type='submit'
                disabled={!body.trim()}
                loading={send.isPending}
                icon={<Send className='size-4' />}
              >
                <Trans>Send</Trans>
              </Button>
            </div>
          </form>
        </Footer>
      ) : null}
    </>
  )
}

function PageBody({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('min-h-0 flex-1 overflow-y-auto p-4 sm:p-6', className)}
      {...props}
    />
  )
}

function PageFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('border-t p-4', className)} {...props} />
}

// The look of the Textarea these boxes replaced, on the editor's wrapper.
const BOX_CLASS =
  'border-border focus-within:border-ring focus-within:ring-ring/50 dark:bg-input/30 min-h-10 min-w-0 rounded-md border-[length:var(--border-width)] bg-transparent px-3 py-2 shadow-xs transition-[color,box-shadow] focus-within:ring-[3px]'

/** A thread reply's edit box, with its formatting bar and buttons. */
function ThreadEditBox({
  value,
  onValueChange,
  onSave,
  onCancel,
  saving,
}: {
  value: string
  onValueChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}) {
  const { t } = useLingui()
  const { editor } = useMessageEditor({
    value,
    onValueChange,
    onSubmit: onSave,
    onEscape: onCancel,
    ariaLabel: t`Edit`,
    autoFocus: true,
  })
  return (
    <div className='space-y-2'>
      <EditorContent editor={editor} className={BOX_CLASS} />
      <div className='flex flex-wrap items-center gap-2'>
        <FormattingToolbar editor={editor} className='-ms-1.5' />
        <div className='ms-auto flex gap-2'>
          <Button type='button' variant='ghost' size='sm' onClick={onCancel}>
            <Trans>Cancel</Trans>
          </Button>
          <Button
            type='button'
            size='sm'
            disabled={!value.trim()}
            loading={saving}
            icon={<Check className='size-3' />}
            onClick={onSave}
          >
            <Trans>Save</Trans>
          </Button>
        </div>
      </div>
    </div>
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
            // Sized as the timeline sizes a message's media, so a photo on
            // the thread's own page does not fill the window.
            <div
              className={
                attachmentsHaveVisualMedia(message.attachments)
                  ? CHAT_MEDIA_GRID_BUBBLE_CLASS
                  : CHAT_MEDIA_BUBBLE_CLASS
              }
            >
              <MessageAttachments
                attachments={message.attachments}
                chatId={message.chat}
                isSent={isSent}
              />
            </div>
          ) : null}
          {message.body ? (
            <MessageBody isSent={isSent}>
              <MessageText body={message.body} isSent={isSent} />
            </MessageBody>
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
