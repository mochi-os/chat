// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '@/api/types/chats'
import { ThreadPanel } from './thread-panel'

vi.mock('@/hooks/useChats', async (original) => ({
  ...(await original<typeof import('@/hooks/useChats')>()),
  useThreadMessagesQuery: () => ({
    data: { pages: [{ messages: [] }] },
    hasNextPage: false,
    isFetchingNextPage: false,
    isLoading: false,
    error: null,
    fetchNextPage: () => Promise.resolve(),
    refetch: () => Promise.resolve(),
  }),
}))

const root = (deleted: boolean) =>
  ({
    id: 'm1',
    chat: 'c1',
    member: 'dave',
    name: 'Dave',
    body: deleted ? '' : 'Start a thread here',
    created: 1700000000,
    attachments: [],
    deleted,
  }) as unknown as ChatMessage

function panel(message: ChatMessage) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider i18n={i18n}>
        <ThreadPanel
          chatId='c1'
          root={message}
          currentUserIdentity='me'
          canWrite
          onClose={() => {}}
        />
      </I18nProvider>
    </QueryClientProvider>
  )
}

// A thread stays to read under a message deleted for everyone, but the
// server takes no reply under it, so the panel offers no box to write one.
describe('ThreadPanel', () => {
  it('takes replies under a message that stands', () => {
    panel(root(false))
    expect(screen.getByLabelText('Reply in thread')).toBeInTheDocument()
  })

  it('offers no reply box under a deleted message', () => {
    panel(root(true))
    expect(screen.getByText('This message was deleted')).toBeInTheDocument()
    expect(screen.queryByLabelText('Reply in thread')).toBeNull()
  })
})
