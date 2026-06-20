// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Trans } from '@lingui/react/macro'
import { cn } from '@mochi/web'

/** Collapse message bodies longer than this many rendered lines. */
const COLLAPSED_MAX_LINES = 10

const clampStyle = {
  WebkitLineClamp: COLLAPSED_MAX_LINES,
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical' as const,
  overflow: 'hidden',
}

interface MessageBodyProps {
  children: ReactNode
  isSent?: boolean
  className?: string
}

export function MessageBody({
  children,
  isSent = false,
  className,
}: MessageBodyProps) {
  const [expanded, setExpanded] = useState(false)
  const [isTruncatable, setIsTruncatable] = useState<boolean | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const shouldClamp = !expanded && isTruncatable !== false

  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el || expanded) return

    setIsTruncatable(el.scrollHeight > el.clientHeight + 1)
  }, [children, expanded])

  const toggleClass = isSent
    ? 'text-primary-foreground/85 hover:text-primary-foreground'
    : 'text-primary hover:text-primary/90'

  return (
    <div className={cn('min-w-0', className)}>
      <div
        ref={contentRef}
        className='text-sm leading-relaxed whitespace-pre-wrap'
        style={shouldClamp ? clampStyle : undefined}
      >
        {children}
      </div>
      {isTruncatable ? (
        <button
          type='button'
          onClick={(e) => {
            e.stopPropagation()
            setExpanded((value) => !value)
          }}
          className={cn(
            'mt-1 text-xs font-medium underline-offset-2 hover:underline',
            toggleClass
          )}
        >
          {expanded ? <Trans>Show less</Trans> : <Trans>Read more</Trans>}
        </button>
      ) : null}
    </div>
  )
}
