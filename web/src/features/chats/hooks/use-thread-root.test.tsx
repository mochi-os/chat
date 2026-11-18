// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useThreadRoot } from './use-thread-root'

const messages = vi.hoisted(() => vi.fn())
vi.mock('@/api/chats', () => ({ chatsApi: { messages } }))

const page = (ids: string[], cursor: string | null) => ({
  messages: ids.map((id) => ({ id, chat: 'c1', member: 'm', created: 1 })),
  more: cursor !== null,
  cursor,
})

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useThreadRoot', () => {
  it('loads older pages until it finds the root', async () => {
    messages.mockReset()
    messages
      .mockResolvedValueOnce(page(['n1', 'n2'], 'p2'))
      .mockResolvedValueOnce(page(['o1', 'root'], 'p3'))
    const { result } = renderHook(() => useThreadRoot('c1', 'root'), {
      wrapper,
    })
    expect(result.current).toBeUndefined()
    await waitFor(() => expect(result.current?.id).toBe('root'))
    // Found on the second page: the third is never asked for.
    expect(messages).toHaveBeenCalledTimes(2)
  })

  it('gives up with null when the timeline runs out', async () => {
    messages.mockReset()
    messages
      .mockResolvedValueOnce(page(['n1'], 'p2'))
      .mockResolvedValueOnce(page(['o1'], null))
    const { result } = renderHook(() => useThreadRoot('c1', 'root'), {
      wrapper,
    })
    await waitFor(() => expect(result.current).toBeNull())
    expect(messages).toHaveBeenCalledTimes(2)
  })

  it('stops after 20 pages, as the timeline does', async () => {
    messages.mockReset()
    let n = 0
    messages.mockImplementation(() => {
      n++
      return Promise.resolve(page([`m${n}`], `p${n + 1}`))
    })
    const { result } = renderHook(() => useThreadRoot('c1', 'root'), {
      wrapper,
    })
    // Twenty pages one after another take longer than waitFor's default.
    await waitFor(() => expect(result.current).toBeNull(), { timeout: 5000 })
    expect(messages).toHaveBeenCalledTimes(20)
  })
})
