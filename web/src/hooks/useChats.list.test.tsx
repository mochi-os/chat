// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ChatWebsocketListener,
  ChatWebsocketMessagePayload,
  ChatWebsocketStatusListener,
  WebsocketConnectionStatus,
} from '@/lib/websocket-manager'
import { useChatListLive } from './useChats'

const state = vi.hoisted(() => ({ manager: null as unknown }))

vi.mock('@/hooks/useWebsocketManager', () => ({
  useWebsocketManager: () => state.manager,
}))

// The user's own socket as the layout holds it: the key it was subscribed
// on, and its listeners, which a test calls as the socket would.
function socket() {
  const held: {
    key?: string
    message?: ChatWebsocketListener
    changed?: ChatWebsocketStatusListener
  } = {}
  state.manager = {
    subscribe: (
      _chat: string,
      options: {
        chatKey?: string
        onMessage?: ChatWebsocketListener
        onStatusChange?: ChatWebsocketStatusListener
      }
    ) => {
      held.key = options.chatKey
      held.message = options.onMessage
      held.changed = options.onStatusChange
      return () => undefined
    },
  }
  return held
}

function status(
  held: ReturnType<typeof socket>,
  value: WebsocketConnectionStatus
) {
  act(() => held.changed?.({ chat: 'chat', status: value, retries: 0 }))
}

function frame(
  held: ReturnType<typeof socket>,
  payload: ChatWebsocketMessagePayload
) {
  act(() => held.message?.({ chat: 'chat', payload }))
}

// The chat list follows the user's own socket: each frame saying it changed
// reads it again, once for a burst, and a socket open again after being down
// reads it once; it is read on a timer only while that socket is down.
describe('useChatListLive', () => {
  let queryClient: QueryClient
  let reads: unknown[][]

  beforeEach(() => {
    vi.useFakeTimers()
    queryClient = new QueryClient()
    reads = []
    const invalidate = queryClient.invalidateQueries.bind(queryClient)
    queryClient.invalidateQueries = ((filters?: { queryKey?: unknown }) => {
      reads.push([filters?.queryKey])
      return invalidate(filters as never)
    }) as typeof queryClient.invalidateQueries
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function mount() {
    return renderHook(() => useChatListLive(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    })
  }

  const listReads = () =>
    reads.filter(([key]) => JSON.stringify(key) === JSON.stringify(['chats']))
      .length

  it('listens on the user key and says whether the socket is open', () => {
    const held = socket()
    const view = mount()
    expect(held.key).toBe('chat')
    expect(view.result.current).toBe(false)
    status(held, 'ready')
    expect(view.result.current).toBe(true)
  })

  it('reads the list again on a list frame, once for a burst', () => {
    const held = socket()
    mount()
    status(held, 'ready')
    frame(held, { event: 'list' })
    frame(held, { event: 'list' })
    frame(held, { event: 'verification' })
    act(() => vi.advanceTimersByTime(1000))
    expect(listReads()).toBe(1)
  })

  it('reads it once as the socket opens again after being down', () => {
    const held = socket()
    mount()
    status(held, 'ready')
    act(() => vi.advanceTimersByTime(1000))
    expect(listReads()).toBe(0)
    status(held, 'error')
    status(held, 'ready')
    act(() => vi.advanceTimersByTime(1000))
    expect(listReads()).toBe(1)
  })
})
