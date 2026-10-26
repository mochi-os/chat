// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chatsApi } from '@/api/chats'
import { useMarkChatReadMutation } from './useChats'

vi.mock('@/api/chats', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/chats')>()
  return { ...actual, chatsApi: { ...actual.chatsApi, markRead: vi.fn() } }
})

// The Mark as read menu item clears the badge on the click and puts it back
// if the server refuses. The read sent as a chat opens shows no error, so it
// still waits for the server.
describe('useMarkChatReadMutation', () => {
  let answer: { resolve: () => void; reject: (error: unknown) => void }
  beforeEach(() => {
    vi.mocked(chatsApi.markRead).mockReset()
    vi.mocked(chatsApi.markRead).mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          answer = { resolve: () => resolve({} as never), reject }
        })
    )
  })

  function mount() {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['chats'], {
      chats: [{ id: 'c1', unread: 3 }],
    })
    const view = renderHook(() => useMarkChatReadMutation(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    })
    const unread = () =>
      queryClient.getQueryData<{ chats: { unread: number }[] }>(['chats'])
        ?.chats[0].unread
    return { view, unread }
  }

  it('clears the badge at once and puts it back when refused', async () => {
    const { view, unread } = mount()
    act(() => view.result.current.mutate({ chatId: 'c1', instant: true }))
    await waitFor(() => expect(unread()).toBe(0))

    act(() => answer.reject(new Error('refused')))
    await waitFor(() => expect(view.result.current.isError).toBe(true))
    expect(unread()).toBe(3)
  })

  it('waits for the server when the read is not a click', async () => {
    const { view, unread } = mount()
    act(() => view.result.current.mutate({ chatId: 'c1' }))
    await waitFor(() => expect(chatsApi.markRead).toHaveBeenCalled())
    expect(unread()).toBe(3)

    act(() => answer.resolve())
    await waitFor(() => expect(unread()).toBe(0))
  })

  it('never sends the flag to the server', async () => {
    const { view } = mount()
    act(() => view.result.current.mutate({ chatId: 'c1', instant: true }))
    await waitFor(() => expect(chatsApi.markRead).toHaveBeenCalled())
    expect(chatsApi.markRead).toHaveBeenCalledWith('c1', {})
  })
})
