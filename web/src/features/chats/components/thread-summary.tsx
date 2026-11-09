// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { plural } from '@lingui/core/macro'
import { Trans } from '@lingui/react/macro'
import type { ChatMessage } from '@/api/chats'
import { ReplyQuoteContent } from './reply-quote-content'

interface ThreadSummaryProps {
  // The message the thread is under, with its count and newest reply.
  root: ChatMessage
  onOpen: () => void
}

/** Under a message with a thread: its newest reply and how many there are,
 * either opening the thread. */
export function ThreadSummary({ root, onOpen }: ThreadSummaryProps) {
  const newest = root.newest
  return (
    <button
      type='button'
      onClick={(e) => {
        e.stopPropagation()
        onOpen()
      }}
      className='bg-muted hover:bg-hover border-primary/40 flex w-fit max-w-[min(20rem,calc(100vw-4.5rem))] min-w-0 flex-col gap-0.5 rounded-lg border-s-2 px-2.5 py-1.5 text-start'
    >
      {newest ? (
        <>
          <span className='text-sm font-medium'>{newest.name}</span>
          {newest.body ? (
            <ReplyQuoteContent
              body={newest.body}
              className='text-foreground/75'
            />
          ) : newest.attachments?.length ? (
            <span className='text-foreground/75 text-sm'>
              <Trans>Attachment</Trans>
            </span>
          ) : newest.encrypted ? (
            <span className='text-muted-foreground text-sm italic'>
              <Trans>Encrypted message</Trans>
            </span>
          ) : null}
        </>
      ) : null}
      <span className='text-primary text-[11px] font-medium'>
        {plural(root.replies ?? 0, {
          one: '# reply',
          other: '# replies',
        })}
      </span>
    </button>
  )
}
