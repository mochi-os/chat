// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatSettingsDialog } from './chat-settings-dialog'

const saved = vi.hoisted(() => [] as unknown[])
// One object, as a query's cached data is: a fresh one each render would
// re-run the dialog's sync from it for ever.
const preferences = vi.hoisted(() => ({
  policy: 'friends',
  presence: true,
  receipts: true,
  typing: true,
}))

vi.mock('@/hooks/useChats', () => ({
  useChatPreferencesQuery: () => ({
    data: preferences,
    isLoading: false,
    isError: false,
    error: null,
  }),
  useSetChatPreferencesMutation: () => ({
    mutateAsync: (changes: unknown) => {
      saved.push(changes)
      return Promise.resolve()
    },
    isPending: false,
  }),
}))

describe('ChatSettingsDialog', () => {
  it('shows each switch as the user has it and saves only what changed', async () => {
    render(
      <I18nProvider i18n={i18n}>
        <ChatSettingsDialog open onOpenChange={() => undefined} />
      </I18nProvider>
    )
    const receipts = screen.getByRole('switch', { name: 'Send read receipts' })
    expect(receipts).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.click(receipts)
    expect(receipts).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saved).toEqual([{ receipts: false }]))
  })
})
