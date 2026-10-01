// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useEffect } from 'react'
import { useLingui } from '@lingui/react/macro'
import {
  FilterChip,
  FilterChips,
  SearchInput,
  useFormat,
  useSidebar,
} from '@mochi/web'
import { formatCountBadge } from '@/features/chats/utils'
import {
  CHAT_FILTERS,
  type ChatFilter,
} from '@/features/chats/utils/chat-filter'

interface ChatListFiltersProps {
  search: string
  onSearchChange: (value: string) => void
  filter: ChatFilter
  onFilterChange: (filter: ChatFilter) => void
  unreadCount: number
  empty: boolean
}

function isChatFilter(value: string): value is ChatFilter {
  return (CHAT_FILTERS as readonly string[]).includes(value)
}

export function ChatListFilters({
  search,
  onSearchChange,
  filter,
  onFilterChange,
  unreadCount,
  empty,
}: ChatListFiltersProps) {
  const { t } = useLingui()
  const { formatNumber } = useFormat()
  const { state, isMobile } = useSidebar()
  const collapsed = !isMobile && state === 'collapsed'

  // The icon rail hides this bar, so a filter left on there would hide chats
  // with nothing on screen saying why. Collapsing goes back to every chat.
  useEffect(() => {
    if (!collapsed) return
    onSearchChange('')
    onFilterChange('all')
  }, [collapsed, onSearchChange, onFilterChange])

  return (
    <div className='flex flex-col gap-2 px-1 pt-2'>
      <SearchInput
        value={search}
        onValueChange={onSearchChange}
        placeholder={t`Search chats`}
        aria-label={t`Search chats`}
        clearLabel={t`Clear search`}
      />
      <FilterChips
        aria-label={t`Filter chats`}
        value={filter}
        onValueChange={(value) => {
          if (isChatFilter(value)) onFilterChange(value)
        }}
      >
        <FilterChip value='all'>{t`All`}</FilterChip>
        <FilterChip
          value='unread'
          count={
            unreadCount > 0
              ? formatCountBadge(unreadCount, formatNumber)
              : undefined
          }
        >
          {t`Unread`}
        </FilterChip>
        <FilterChip value='groups'>{t`Groups`}</FilterChip>
      </FilterChips>
      {empty && (
        <p className='text-muted-foreground px-2 py-1 text-sm'>{t`No chats`}</p>
      )}
    </div>
  )
}
