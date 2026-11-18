// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { Trans } from '@lingui/react/macro'
import { stripFormatting } from '@mochi/web/lib/text-format'
import type { ChatMessage } from '@/api/chats'
import { MessageAttachments } from './message-attachments'

interface ThreadRepliesProps {
  // The thread's replies, oldest first.
  answers: ChatMessage[]
  // Whether the bubble is the viewer's, whose colours the replies are drawn in.
  isSent: boolean
  onOpen: () => void
}

/** A message's thread inside its own bubble: every reply below a rule, with
 * who wrote it, each folded to a few lines, opening the thread. */
export function ThreadReplies({ answers, isSent, onOpen }: ThreadRepliesProps) {
  return (
    <>
      {answers.map((answer) => (
        <div key={answer.id}>
          <hr className='my-2 border-current/20' />
          <button
            type='button'
            onClick={(e) => {
              e.stopPropagation()
              onOpen()
            }}
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
