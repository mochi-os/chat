// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { MouseEvent } from 'react'
import { plural } from '@lingui/core/macro'
import { Trans } from '@lingui/react/macro'
import { Bubble, BubbleContent, cn } from '@mochi/web'
import type { ChatMessage } from '@/api/chats'

interface ThreadSummaryProps {
  // The message the thread is under, with its count and newest reply.
  root: ChatMessage
  // The viewer, whose own reply takes their bubble's colour.
  identity: string
  // Whether the root is the viewer's, so the thread sits on its side.
  isSent: boolean
  isGroupChat: boolean
  onOpen: () => void
}

/** Under a message with a thread: its newest reply in its sender's bubble,
 * and how many replies there are, either opening the thread. */
export function ThreadSummary({
  root,
  identity,
  isSent,
  isGroupChat,
  onOpen,
}: ThreadSummaryProps) {
  const newest = root.newest
  const own = newest?.member === identity
  const encrypted =
    Boolean(newest?.encrypted) && !newest?.body && !newest?.attachments?.length
  const open = (e: MouseEvent) => {
    e.stopPropagation()
    onOpen()
  }
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-0.5',
        isSent ? 'me-6 items-end' : 'ms-6 items-start'
      )}
    >
      {newest ? (
        <Bubble
          variant={own ? 'default' : 'muted'}
          align={isSent ? 'end' : 'start'}
          className='max-w-full'
        >
          {isGroupChat && !own && newest.name ? (
            <span className='text-muted-foreground -mb-0.5 ml-1.5 text-xs font-semibold'>
              {newest.name}
            </span>
          ) : null}
          <BubbleContent
            asChild
            className={cn(
              encrypted &&
                'text-muted-foreground border-dashed bg-transparent italic'
            )}
          >
            <button type='button' onClick={open}>
              {newest.body ? (
                <span className='line-clamp-2 whitespace-pre-wrap'>
                  {newest.body.replace(/@\[([^\]]+)\]/g, '@$1')}
                </span>
              ) : newest.attachments?.length ? (
                <Trans>Attachment</Trans>
              ) : encrypted ? (
                <Trans>Encrypted message</Trans>
              ) : null}
            </button>
          </BubbleContent>
        </Bubble>
      ) : null}
      <button
        type='button'
        onClick={open}
        className='text-primary px-1 text-[11px] font-medium hover:underline'
      >
        {plural(root.replies ?? 0, {
          one: '# reply',
          other: '# replies',
        })}
      </button>
    </div>
  )
}
