// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Verification } from '@/api/encryption'
import { VerificationWatcher } from './verification-watcher'

const state = vi.hoisted(() => ({
  verifications: vi.fn(),
  act: vi.fn(),
}))

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
