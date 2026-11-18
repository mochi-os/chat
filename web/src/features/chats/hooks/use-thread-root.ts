// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useEffect, useMemo } from 'react'
import type { ChatMessage } from '@/api/chats'
import { useInfiniteMessagesQuery } from '@/hooks/useChats'

// As far back as the timeline goes to find a message it was asked to show
// (ensureMatchVisible in features/chats/index.tsx).
const MAX_PAGES = 20

/**
 * A thread's root message, found in the conversation's own timeline: the
 * server returns a thread's replies but never its root, and has no way to
 * ask for one message. Undefined while it is still being looked for, null
 * once the timeline ran out or was searched as far as it goes.
 */
export function useThreadRoot(
  chatId: string,
  messageId: string
): ChatMessage | null | undefined {
  const query = useInfiniteMessagesQuery(chatId)
  const pages = query.data?.pages
  const found = useMemo(
    () =>
      pages
        ?.flatMap((page) => page.messages)
        .find((message) => message.id === messageId),
    [pages, messageId]
  )
  const searched = pages?.length ?? 0
  const more = Boolean(query.hasNextPage) && searched < MAX_PAGES
  const { isSuccess, isFetchingNextPage, fetchNextPage } = query

  // Keyed on the number of pages too: a page that arrives quickly can come
  // and go without a render showing it being fetched, and then nothing else
  // here changes to ask for the next one.
  useEffect(() => {
    if (found || !isSuccess || isFetchingNextPage || !more) return
    void fetchNextPage()
  }, [found, isSuccess, isFetchingNextPage, more, searched, fetchNextPage])

  if (found) return found
  if (query.isError) return null
  if (query.isPending || isFetchingNextPage || more) return undefined
  return null
}
