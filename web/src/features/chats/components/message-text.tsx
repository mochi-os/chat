// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { Fragment, type ReactNode } from 'react'
import { cn } from '@mochi/web'
import {
  FormattedText,
  type FormattedTextRenderOptions,
} from '@mochi/web/components/formatted-text'
import { highlightSearchText } from '../utils/highlight-search-text'

interface MessageTextProps {
  body: string
  isSent: boolean
  /** A search to highlight in the text, and whether it is the current hit. */
  highlight?: { query: string; active: boolean } | null
}

/**
 * A message body with its formatting, its @[Name] mentions as pills, and
 * any search hit highlighted. Mentions stay text inside code.
 */
export function MessageText({ body, isSent, highlight }: MessageTextProps) {
  const renderText = (text: string, { code }: FormattedTextRenderOptions) => {
    const mark = (part: string): ReactNode =>
      highlight
        ? highlightSearchText(part, highlight.query, highlight.active)
        : part
    if (code) return mark(text)
    return text.split(/(@\[[^\]]+\])/g).map((part, i) =>
      part.startsWith('@[') && part.endsWith(']') ? (
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
      ) : (
        <Fragment key={i}>{mark(part)}</Fragment>
      )
    )
  }

  return <FormattedText text={body} inverted={isSent} renderText={renderText} />
}
