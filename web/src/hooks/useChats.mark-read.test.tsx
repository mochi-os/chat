// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { ReactNode } from 'react'
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
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
    return { view, unread, queryClient }
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

  // The read sent as a chat opens patches nothing, so it costs no reload.
  it('reloads the list only after a menu read', async () => {
    const { view, queryClient } = mount()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    act(() => view.result.current.mutate({ chatId: 'c1' }))
    await waitFor(() => expect(chatsApi.markRead).toHaveBeenCalled())
    act(() => answer.resolve())
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true))
    expect(invalidate).not.toHaveBeenCalled()

    act(() => view.result.current.mutate({ chatId: 'c1', instant: true }))
    await waitFor(() => expect(chatsApi.markRead).toHaveBeenCalledTimes(2))
    act(() => answer.resolve())
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1))
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['chats'],
      exact: true,
    })
  })

  it('never sends the flag to the server', async () => {
    const { view } = mount()
    act(() => view.result.current.mutate({ chatId: 'c1', instant: true }))
    await waitFor(() => expect(chatsApi.markRead).toHaveBeenCalled())
    expect(chatsApi.markRead).toHaveBeenCalledWith('c1', {})
  })

  // Two quick menu reads, one accepted and one refused, in either order of
  // answers: the refused chat's badge comes back from the reload.
  it.each([
    ['accepted first', ['c2', 'c1']],
    ['refused first', ['c1', 'c2']],
  ])(
    'shows the refused chat unread again when the other is %s',
    async (_name, order) => {
      const server = {
        chats: [
          { id: 'c1', unread: 3 },
          { id: 'c2', unread: 0 },
        ],
      }
      const answers = new Map<
        string,
        { resolve: () => void; reject: (error: unknown) => void }
      >()
      vi.mocked(chatsApi.markRead).mockImplementation(
        (chatId) =>
          new Promise((resolve, reject) => {
            answers.set(chatId, { resolve: () => resolve({} as never), reject })
          })
      )
      const queryClient = new QueryClient()
      queryClient.setQueryData(['chats'], {
        chats: [
          { id: 'c1', unread: 3 },
          { id: 'c2', unread: 5 },
        ],
      })
      const view = renderHook(
        () => {
          useQuery({
            queryKey: ['chats'],
            queryFn: () => structuredClone(server),
            staleTime: Infinity,
          })
          return useMarkChatReadMutation()
        },
        {
          wrapper: ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={queryClient}>
              {children}
            </QueryClientProvider>
          ),
        }
      )
      const unread = (id: string) =>
        queryClient
          .getQueryData<{ chats: { id: string; unread: number }[] }>(['chats'])
          ?.chats.find((chat) => chat.id === id)?.unread

      act(() => {
        void view.result.current
          .mutateAsync({ chatId: 'c1', instant: true })
          .catch(() => {})
        void view.result.current
          .mutateAsync({ chatId: 'c2', instant: true })
          .catch(() => {})
      })
      await waitFor(() => expect(answers.size).toBe(2))
      expect(unread('c1')).toBe(0)
      expect(unread('c2')).toBe(0)

      for (const id of order) {
        act(() =>
          id === 'c2'
            ? answers.get(id)!.resolve()
            : answers.get(id)!.reject(new Error('refused'))
        )
        await waitFor(() =>
          expect(queryClient.isMutating()).toBeLessThan(
            order.indexOf(id) === 0 ? 2 : 1
          )
        )
      }
      await waitFor(() => expect(unread('c1')).toBe(3))
      expect(unread('c2')).toBe(0)
    }
  )

  // optimistic forgets a settled call only when the mutation's context is
  // the call it returned. A wrapper object kept every accepted read, and its
  // snapshot, for the rest of the session.
  it('leaves the context as the patch made it, so a settled read is forgotten', async () => {
    const { view, queryClient } = mount()
    act(() => view.result.current.mutate({ chatId: 'c1', instant: true }))
    await waitFor(() => expect(chatsApi.markRead).toHaveBeenCalled())
    act(() => answer.resolve())
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true))
    const [mutation] = queryClient.getMutationCache().getAll()
    expect(Object.getPrototypeOf(mutation.state.context)).not.toBe(
      Object.prototype
    )
  })
})
