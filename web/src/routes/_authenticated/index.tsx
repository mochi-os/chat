// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { createFileRoute, redirect } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { Chats } from '@/features/chats'
import { getLastChat, clearLastChat } from '@/hooks/useChatStorage'
import { chatsApi } from '@/api/chats'
import { chatKeys } from '@/hooks/useChats'

interface IndexSearch {
  with?: string
  name?: string
}

/**
 * Decide where "/" lands. The chat list is loaded through react-query so the
 * page's own useChatsQuery shares the fetch instead of issuing a second one;
 * a failed list soft-fails to the page, which owns the error display.
 */
export async function loadIndex(input: {
  queryClient: QueryClient
  deps: { with?: string }
}): Promise<void> {
  let chats: Awaited<ReturnType<typeof chatsApi.list>>['chats'] = []
  try {
    const response = await input.queryClient.ensureQueryData({
      queryKey: chatKeys.all(),
      queryFn: () => chatsApi.list(),
    })
    chats = response.chats || []
  } catch {
    // Soft-fail: chat list ownership stays with useChatsQuery in the page.
  }

  // When deep-linking from another app (?with=<friend>), the page itself
  // resolves the chat — skip the last-visited redirect.
  if (input.deps.with) {
    return
  }

  // Check for last visited chat and redirect if it still exists
  const lastChatId = await getLastChat()
  if (lastChatId) {
    const chatExists = chats.some((c) => c.id === lastChatId)
    if (chatExists) {
      throw redirect({ to: '/$chatId', params: { chatId: lastChatId } })
    } else {
      // Chat no longer exists, clear stored location
      clearLastChat()
    }
  }
}

export const Route = createFileRoute('/_authenticated/')({
  validateSearch: (search: Record<string, unknown>): IndexSearch => ({
    with: typeof search.with === 'string' ? search.with : undefined,
    name: typeof search.name === 'string' ? search.name : undefined,
  }),
  loaderDeps: ({ search }) => ({ with: search.with }),
  loader: ({ context, deps }) => loadIndex({ queryClient: context.queryClient, deps }),
  component: Chats,
})
