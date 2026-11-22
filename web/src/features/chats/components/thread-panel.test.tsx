// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { chatsApi } from '@/api/chats'
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

// A reply the server refuses for want of encryption goes unencrypted only
// by the user's choice, as one from the main composer does.
describe('ThreadPanel reply refused for want of encryption', () => {
  afterEach(() => vi.restoreAllMocks())

  const refuse = (status: number) => {
    const send = vi
      .spyOn(chatsApi, 'sendMessage')
      .mockRejectedValueOnce(
        Object.assign(new Error('refused'), { response: { status } })
      )
      .mockResolvedValue({ id: 'r1' } as never)
    panel(root(false))
    fireEvent.change(screen.getByLabelText('Reply in thread'), {
      target: { value: 'Psst' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    return send
  }

  it('offers Send unencrypted, and sends unencrypted only when chosen', async () => {
    const send = refuse(409)
    const button = await screen.findByRole('button', {
      name: 'Send unencrypted',
    })
    expect(send).toHaveBeenCalledWith('c1', {
      body: 'Psst',
      thread: 'm1',
      unencrypted: false,
    })
    fireEvent.click(button)
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2))
    expect(send).toHaveBeenLastCalledWith('c1', {
      body: 'Psst',
      thread: 'm1',
      unencrypted: true,
    })
  })

  it('offers nothing of the kind for any other refusal', async () => {
    const send = refuse(500)
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
    )
    expect(
      screen.queryByRole('button', { name: 'Send unencrypted' })
    ).toBeNull()
  })
})
