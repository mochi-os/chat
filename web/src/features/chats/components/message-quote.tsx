// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { Trans } from '@lingui/react/macro'
import { cn } from '@mochi/web'
import type { ChatMessage } from '@/api/chats'
import { ReplyQuoteContent } from './reply-quote-content'

interface MessageQuoteProps {
  quoted?: ChatMessage
  isSent: boolean
  onClick: () => void
}

export function MessageQuote({ quoted, isSent, onClick }: MessageQuoteProps) {
  const body = quoted?.body ?? ''
  const hasAttachmentOnly =
    quoted && !body.trim() && Boolean(quoted.attachments?.length)

  const secondaryTextClass = isSent
    ? 'text-primary-foreground/85'
    : 'text-foreground/75'

  return (
    <button
      type='button'
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={cn(
        'mb-2.5 flex min-w-0 max-w-full w-full flex-col gap-1 overflow-hidden rounded-lg border-s-2 px-2.5 py-2 text-start',
        isSent
          ? 'border-primary-foreground/50 bg-black/15 hover:bg-black/20'
          : 'border-primary/40 bg-background/60 hover:bg-background/80'
      )}
    >
      <div
        className={cn(
          'text-sm leading-snug font-medium',
          isSent ? 'text-primary-foreground' : 'text-foreground'
        )}
      >
        {quoted?.name ?? <Trans>Original message</Trans>}
      </div>
      {quoted?.deleted ? (
        <div className={cn('text-sm italic', secondaryTextClass)}>
          <Trans>This message was deleted</Trans>
        </div>
      ) : body.trim() ? (
        <ReplyQuoteContent body={body} className={secondaryTextClass} />
      ) : hasAttachmentOnly ? (
        <div className={cn('text-sm', secondaryTextClass)}>
          <Trans>Attachment</Trans>
        </div>
      ) : !quoted ? (
        <div className={cn('text-sm', secondaryTextClass)}>
          <Trans>Message not available</Trans>
        </div>
      ) : null}
    </button>
  )
}
