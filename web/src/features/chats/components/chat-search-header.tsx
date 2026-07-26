// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useRef, useEffect } from 'react'
import { useLingui } from '@lingui/react/macro'
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { IconButton, Input, cn, getErrorMessage, useFormat } from '@mochi/web'

interface ChatSearchHeaderProps {
  query: string
  onQueryChange: (value: string) => void
  activeIndex: number
  totalMatches: number
  isSearching: boolean
  searchError?: unknown
  onNewer: () => void
  onOlder: () => void
  onClose: () => void
}

export function ChatSearchHeader({
  query,
  onQueryChange,
  activeIndex,
  totalMatches,
  isSearching,
  searchError,
  onNewer,
  onOlder,
  onClose,
}: ChatSearchHeaderProps) {
  const { t } = useLingui()
  const { formatNumber } = useFormat()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const showCounter = query.length >= 2
  // A failed search must not read as an empty one: "No results" is an answer,
  // and the user would trust it.
  const counterText = searchError
    ? getErrorMessage(searchError, t`Search failed`)
    : totalMatches === 0
      ? t`No results`
      : `${formatNumber(activeIndex + 1)}/${formatNumber(totalMatches)}`

  return (
    <header
      className='bg-background sticky top-[var(--sticky-top,0px)] z-30 border-b'
      style={{ paddingRight: 'var(--removed-body-scroll-bar-size, 0px)' }}
    >
      <div className='flex min-h-11 items-center gap-2 px-3 py-1 md:min-h-11 md:gap-3 md:px-6 md:py-2'>
        <div className='relative min-w-0 flex-1'>
          <Search className='text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2' />
          <Input
            ref={inputRef}
            type='search'
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t`Search in chat...`}
            className='ps-10'
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onNewer()
              } else if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault()
                onOlder()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                onClose()
              }
            }}
          />
        </div>

        {showCounter ? (
          <span
            className={cn(
              'shrink-0 text-sm tabular-nums',
              searchError ? 'text-destructive' : 'text-muted-foreground',
              isSearching && 'opacity-60'
            )}
            aria-live='polite'
          >
            {counterText}
          </span>
        ) : null}

        <IconButton
          variant='ghost'
          label={t`Older match`}
          onClick={onOlder}
          disabled={
            totalMatches === 0 || activeIndex >= totalMatches - 1
          }
        >
          <ChevronUp className='size-5' />
        </IconButton>

        <IconButton
          variant='ghost'
          label={t`Newer match`}
          onClick={onNewer}
          disabled={totalMatches === 0 || activeIndex <= 0}
        >
          <ChevronDown className='size-5' />
        </IconButton>

        <IconButton
          variant='ghost'
          label={t`Close search`}
          onClick={onClose}
        >
          <X className='size-5' />
        </IconButton>
      </div>
    </header>
  )
}
