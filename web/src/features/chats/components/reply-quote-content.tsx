// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { cn } from '@mochi/web'

interface ReplyQuoteContentProps {
  body: string
  className?: string
}

export function ReplyQuoteContent({ body, className }: ReplyQuoteContentProps) {
  if (!body) return null

  return (
    <div
      className={cn(
        'text-sm leading-relaxed break-words whitespace-pre-wrap',
        'line-clamp-2 overflow-hidden',
        className
      )}
    >
      {body}
    </div>
  )
}
