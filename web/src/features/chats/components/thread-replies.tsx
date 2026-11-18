// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { MouseEvent } from 'react'
import { Plural, Trans } from '@lingui/react/macro'
import { stripFormatting } from '@mochi/web/lib/text-format'
import type { ChatMessage } from '@/api/chats'
import { MessageAttachments } from './message-attachments'

interface ThreadRepliesProps {
  // The thread's newest replies, oldest first: the server sends a root's
  // newest few, not all of them.
  answers: ChatMessage[]
  // How many replies the thread has in all.
  replies: number
  // Whether the bubble is the viewer's, whose colours the replies are drawn in.
  isSent: boolean
  onOpen: () => void
}

/** A message's thread inside its own bubble: how many earlier replies there
 * are, then each reply shown below a rule, with who wrote it, every one
 * opening the thread. */
export function ThreadReplies({
  answers,
  replies,
  isSent,
  onOpen,
}: ThreadRepliesProps) {
  const earlier = Math.max(replies - answers.length, 0)
  const open = (e: MouseEvent) => {
    e.stopPropagation()
    onOpen()
  }
  return (
    <>
      {earlier > 0 ? (
        <>
          <hr className='my-2 border-current/20' />
          <button
            type='button'
            onClick={open}
            className='block w-full text-start text-xs font-semibold opacity-80 hover:underline'
          >
            <Plural
              value={earlier}
              one='# earlier reply'
              other='# earlier replies'
            />
          </button>
        </>
      ) : null}
      {answers.map((answer) => (
        <div key={answer.id}>
          <hr className='my-2 border-current/20' />
          <button
            type='button'
            onClick={open}
            className='block w-full text-start'
          >
            <span className='block text-xs font-semibold opacity-80'>
              {answer.name}
            </span>
            {answer.body ? (
              // Folded as the message's own body folds at 10 lines, but
              // shorter: the whole reply is one tap away in the thread.
              <span className='line-clamp-4 whitespace-pre-wrap'>
                {stripFormatting(answer.body).replace(/@\[([^\]]+)\]/g, '@$1')}
              </span>
            ) : answer.encrypted && !answer.attachments?.length ? (
              <span className='block italic opacity-80'>
                {answer.encrypted === 3 ? (
                  <Trans>Encrypted for other devices only</Trans>
                ) : (
                  <Trans>Encrypted message</Trans>
                )}
              </span>
            ) : null}
          </button>
          {answer.attachments?.length ? (
            <MessageAttachments
              attachments={answer.attachments}
              chatId={answer.chat}
              isSent={isSent}
            />
          ) : null}
        </div>
      ))}
    </>
  )
}
