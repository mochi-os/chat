// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UnsentMessage } from './unsent-message'

// A message whose send failed while the composer held the next one stays on
// screen with why, to send again, copy out or let go.
describe('UnsentMessage', () => {
  function mount(body: string, onSendUnencrypted?: () => void) {
    const actions = { onRetry: vi.fn(), onCopy: vi.fn(), onDiscard: vi.fn() }
    render(
      <I18nProvider i18n={i18n}>
        <UnsentMessage
          body={body}
          files={0}
          error='Unable to connect'
          retryDisabled={false}
          onSendUnencrypted={onSendUnencrypted}
          {...actions}
        />
      </I18nProvider>
    )
    return actions
  }

  it('offers Send unencrypted only for a message refused for want of encryption', () => {
    mount('Plain')
    expect(screen.queryByRole('button', { name: 'Send unencrypted' })).toBeNull()
  })

  it('sends it unencrypted where the user chooses so', () => {
    const unencrypted = vi.fn()
    mount('Refused', unencrypted)
    fireEvent.click(screen.getByRole('button', { name: 'Send unencrypted' }))
    expect(unencrypted).toHaveBeenCalledTimes(1)
  })

  it('shows the message and why it failed, with Retry, Copy and Discard', () => {
    const actions = mount('The message that did not go')
    expect(screen.getByText('The message that did not go')).toBeTruthy()
    expect(screen.getByText('Unable to connect')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(actions.onRetry).toHaveBeenCalledTimes(1)
    expect(actions.onCopy).toHaveBeenCalledTimes(1)
    expect(actions.onDiscard).toHaveBeenCalledTimes(1)
  })

  it('offers no Copy for a message of files alone', () => {
    mount('')
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
  })
})
