import { useRef, useEffect } from 'react'
import { useLingui } from '@lingui/react/macro'
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { IconButton, Input, cn } from '@mochi/web'

interface ChatSearchHeaderProps {
  query: string
  onQueryChange: (value: string) => void
  activeIndex: number
  totalMatches: number
  isSearching: boolean
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
  onNewer,
  onOlder,
  onClose,
}: ChatSearchHeaderProps) {
  const { t } = useLingui()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const showCounter = query.length >= 2
  const counterText =
    totalMatches === 0
      ? t`No results`
      : `${activeIndex + 1}/${totalMatches}`

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
              'text-muted-foreground shrink-0 text-sm tabular-nums',
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
