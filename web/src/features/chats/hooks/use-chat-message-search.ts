// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueryWithError } from '@mochi/web'
import { chatsApi } from '@/api/chats'
import type { ChatSearchResult } from '@/api/types/chats'

const DEBOUNCE_MS = 300

export const chatSearchKeys = {
  search: (chatId: string, query: string) =>
    ['chats', chatId, 'search', query] as const,
}

export function useChatMessageSearch(chatId?: string, enabled = true) {
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    setIsSearchOpen(false)
    setQuery('')
    setDebouncedQuery('')
    setActiveIndex(0)
  }, [chatId])

  const searchQuery = useQueryWithError({
    queryKey: chatSearchKeys.search(chatId ?? 'unknown', debouncedQuery),
    enabled:
      enabled &&
      Boolean(chatId) &&
      isSearchOpen &&
      debouncedQuery.length >= 2,
    queryFn: () => {
      if (!chatId) throw new Error('Chat ID is required')
      return chatsApi.search(chatId, { q: debouncedQuery })
    },
  })

  const matches: ChatSearchResult[] = useMemo(
    () => searchQuery.data?.results ?? [],
    [searchQuery.data?.results]
  )

  useEffect(() => {
    setActiveIndex(0)
  }, [debouncedQuery, matches.length])

  const activeMatch = matches[activeIndex] ?? null
  const activeMatchId = activeMatch?.id ?? null

  const matchedMessageIds = useMemo(
    () => new Set(matches.map((m) => m.id)),
    [matches]
  )

  const openSearch = useCallback(() => {
    setIsSearchOpen(true)
    setQuery('')
    setDebouncedQuery('')
    setActiveIndex(0)
  }, [])

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false)
    setQuery('')
    setDebouncedQuery('')
    setActiveIndex(0)
  }, [])

  const goOlder = useCallback(() => {
    setActiveIndex((i) =>
      matches.length === 0 ? 0 : Math.min(i + 1, matches.length - 1)
    )
  }, [matches.length])

  const goNewer = useCallback(() => {
    setActiveIndex((i) => Math.max(i - 1, 0))
  }, [])

  return {
    isSearchOpen,
    openSearch,
    closeSearch,
    query,
    setQuery,
    debouncedQuery,
    matches,
    activeIndex,
    activeMatch,
    activeMatchId,
    matchedMessageIds,
    goOlder,
    goNewer,
    isSearching: searchQuery.isFetching,
    searchError: searchQuery.error,
  }
}
