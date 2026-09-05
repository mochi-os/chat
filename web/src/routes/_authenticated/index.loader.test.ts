// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

/* eslint-disable lingui/no-unlocalized-strings -- test fixtures, not user-facing */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { QueryClient } from '@tanstack/react-query'

const { list, getLastChat, clearLastChat } = vi.hoisted(() => ({
  list: vi.fn(),
  getLastChat: vi.fn(),
  clearLastChat: vi.fn(),
}))

vi.mock('@/api/chats', () => ({ chatsApi: { list } }))
vi.mock('@/hooks/useChatStorage', () => ({ getLastChat, clearLastChat }))
// The route component pulls the whole chat page graph; the loader under test
// needs none of it.
vi.mock('@/features/chats', () => ({ Chats: () => null }))

import { loadIndex } from './index'

const fakeClient = (chats: { id: string }[]) => {
  const ensureQueryData = vi.fn(async (options: { queryFn: () => Promise<unknown> }) => {
    await options.queryFn()
    return { chats }
  })
  return { client: { ensureQueryData } as unknown as QueryClient, ensureQueryData }
}

describe('index loader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    list.mockResolvedValue({ chats: [] })
  })

  it('loads the list through the query cache, so the page shares one fetch', async () => {
    const { client, ensureQueryData } = fakeClient([])
    getLastChat.mockResolvedValueOnce(null)
    await loadIndex({ queryClient: client, deps: {} })
    expect(ensureQueryData).toHaveBeenCalledTimes(1)
    expect(ensureQueryData.mock.calls[0][0]).toMatchObject({ queryKey: ['chats'] })
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('redirects to the last chat when the list still holds it', async () => {
    const { client } = fakeClient([{ id: 'c1' }])
    getLastChat.mockResolvedValueOnce('c1')
    await expect(loadIndex({ queryClient: client, deps: {} })).rejects.toMatchObject({
      options: { to: '/$chatId', params: { chatId: 'c1' } },
    })
  })

  it('clears a remembered chat the list no longer holds', async () => {
    const { client } = fakeClient([{ id: 'c1' }])
    getLastChat.mockResolvedValueOnce('gone')
    await loadIndex({ queryClient: client, deps: {} })
    expect(clearLastChat).toHaveBeenCalledTimes(1)
  })

  it('skips the redirect for a deep link, which the page resolves itself', async () => {
    const { client } = fakeClient([{ id: 'c1' }])
    getLastChat.mockResolvedValueOnce('c1')
    await expect(loadIndex({ queryClient: client, deps: { with: 'friend' } })).resolves.toBeUndefined()
  })
})
