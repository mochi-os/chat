// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  Button,
  GeneralError,
  SidePanel,
  SidePanelBody,
  SidePanelFooter,
  SidePanelHeader,
  SidePanelTitle,
  Skeleton,
  Textarea,
  getErrorMessage,
  toast,
  useFormat,
} from '@mochi/web'
import { Send } from 'lucide-react'
import { chatsApi, type ChatMessage } from '@/api/chats'
import { chatKeys, useThreadMessagesQuery } from '@/hooks/useChats'
import { MessageAttachments } from './message-attachments'
import { MessageBody } from './message-body'

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
}

/** A message's thread: the message, its replies, and a reply box. */
export function ThreadPanel({
  chatId,
  root,
  currentUserIdentity,
  canWrite,
  onClose,
}: ThreadPanelProps) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const query = useThreadMessagesQuery(chatId, root?.id)
  const replies = useMemo(
    () => [...(query.data?.pages ?? [])].reverse().flatMap((p) => p.messages),
    [query.data?.pages]
  )
  const [body, setBody] = useState('')

  const send = useMutation({
    mutationFn: (text: string) =>
      chatsApi.sendMessage(chatId, { body: text, thread: root!.id }),
    onSuccess: (data) => {
      setBody('')
      window.setTimeout(() => {
        const delivered = queryClient
          .getQueryData<{ pages: { messages: ChatMessage[] }[] }>(
            chatKeys.thread(chatId, root!.id)
          )
          ?.pages.some((page) => page.messages.some((m) => m.id === data.id))
        if (!delivered) {
          void queryClient.invalidateQueries({
            queryKey: chatKeys.thread(chatId, root!.id),
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
    if (!text || send.isPending) return
    send.mutate(text)
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
            replies.map((message) => (
              <ThreadMessage
                key={message.id}
                message={message}
                isSent={message.member === currentUserIdentity}
              />
            ))
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

function ThreadMessage({
  message,
  isSent,
}: {
  message: ChatMessage
  isSent: boolean
}) {
  const { formatTimestamp } = useFormat()
  return (
    <div className='space-y-1'>
      <div className='flex items-baseline gap-2 text-sm'>
        <span className='font-medium'>{message.name}</span>
        <span className='text-muted-foreground text-xs'>
          {formatTimestamp(message.created)}
        </span>
      </div>
      {message.deleted ? (
        <p className='text-muted-foreground text-sm italic'>
          <Trans>This message was deleted</Trans>
        </p>
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
    </div>
  )
}
