// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Verification } from '@/api/encryption'
import type {
  ChatWebsocketListener,
  ChatWebsocketStatusListener,
  WebsocketConnectionStatus,
} from '@/lib/websocket-manager'
import { VerificationWatcher } from './verification-watcher'

const state = vi.hoisted(() => ({
  verifications: vi.fn(),
  act: vi.fn(),
  manager: null as unknown,
}))

vi.mock('@/hooks/useWebsocketManager', () => ({
  useWebsocketManager: () => state.manager,
}))

// The user's own socket as a page holds it: what it was subscribed with, and
// its status, which a test sets.
function socket(status: WebsocketConnectionStatus) {
  const held: {
    key?: string
    message?: ChatWebsocketListener
    changed?: ChatWebsocketStatusListener
  } = {}
  state.manager = {
    subscribe: (
      chat: string,
      options: {
        chatKey?: string
        onMessage?: ChatWebsocketListener
        onStatusChange?: ChatWebsocketStatusListener
      }
    ) => {
      held.key = options.chatKey
      held.message = options.onMessage
      held.changed = options.onStatusChange
      options.onStatusChange?.({ chat, status, retries: 0 })
      return () => undefined
    },
  }
  return held
}

vi.mock('@/api/encryption', async (original) => ({
  ...(await original<typeof import('@/api/encryption')>()),
  encryptionApi: {
    verifications: () => state.verifications(),
    act: (...args: unknown[]) => state.act(...args),
  },
}))

function verification(phase: Verification['phase']): Verification {
  return {
    account: 'm1',
    flow: 'f1',
    person: '@carol:m.example',
    name: 'Carol',
    device: 'D',
    room: '!r',
    phase,
    started: true,
    emoji: phase === 'compare' ? ['🐶', '🔑'] : undefined,
    updated: 1,
  }
}

function show() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <I18nProvider i18n={i18n}>
        <VerificationWatcher enabled />
      </I18nProvider>
    </QueryClientProvider>
  )
}

// Once this side has confirmed the emoji it waits on the other, and no longer
// offers "They don't match", which would cancel what it has just confirmed.
describe('VerificationWatcher', () => {
  beforeEach(() => {
    i18n.load('en', {})
    i18n.activate('en')
    state.verifications.mockReset()
    state.manager = null
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('offers both answers while the emoji are compared', async () => {
    state.verifications.mockResolvedValue([verification('compare')])
    show()
    expect(
      await screen.findByRole('button', { name: 'They match' })
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: "They don't match" })
    ).toBeTruthy()
  })

  it('waits on the other side once confirmed, offering neither answer', async () => {
    state.verifications.mockResolvedValue([verification('confirmed')])
    show()
    expect(
      await screen.findByText('Waiting for the other device...')
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'They match' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: "They don't match" })
    ).toBeNull()
    expect(screen.queryByText('🐶')).toBeNull()
  })
})

// The verifications are read once and again on each frame the user's own
// socket carries, never on a timer while it is open; only while it is down
// are they asked for on one.
describe('VerificationWatcher pushed', () => {
  beforeEach(() => {
    i18n.load('en', {})
    i18n.activate('en')
    state.verifications.mockReset()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    state.manager = null
  })

  it('reads them again on a frame, and not on a timer while the socket is open', async () => {
    const held = socket('ready')
    state.verifications.mockResolvedValue([verification('compare')])
    show()
    expect(
      await screen.findByRole('button', { name: 'They match' })
    ).toBeTruthy()
    expect(held.key).toBe('chat')
    await act(() => vi.advanceTimersByTimeAsync(60_000))
    expect(state.verifications).toHaveBeenCalledTimes(1)

    state.verifications.mockResolvedValue([verification('confirmed')])
    act(() => {
      held.message?.({
        chat: 'chat',
        payload: { event: 'verification', account: 'm1', flow: 'f1' },
      })
    })
    expect(
      await screen.findByText('Waiting for the other device...')
    ).toBeTruthy()
    expect(state.verifications).toHaveBeenCalledTimes(2)
  })

  it('asks on a timer while the socket is down, and once as it opens again', async () => {
    const held = socket('error')
    state.verifications.mockResolvedValue([verification('compare')])
    show()
    await screen.findByRole('button', { name: 'They match' })
    await act(() => vi.advanceTimersByTimeAsync(6_000))
    expect(state.verifications.mock.calls.length).toBeGreaterThan(1)

    act(() => {
      held.changed?.({ chat: 'chat', status: 'ready', retries: 0 })
    })
    const opened = state.verifications.mock.calls.length
    act(() => {
      held.changed?.({ chat: 'chat', status: 'error', retries: 1 })
      held.changed?.({ chat: 'chat', status: 'ready', retries: 0 })
    })
    await act(() => vi.advanceTimersByTimeAsync(100))
    expect(state.verifications.mock.calls.length).toBe(opened + 1)
    await act(() => vi.advanceTimersByTimeAsync(60_000))
    expect(state.verifications.mock.calls.length).toBe(opened + 1)
  })
})
