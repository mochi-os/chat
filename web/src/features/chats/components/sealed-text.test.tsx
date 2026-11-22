// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SealedText } from './sealed-text'

// An encrypted message that cannot be read says why, where the server knows:
// a changed key or a distrusted device is not a message still waiting for
// its keys.
describe('SealedText', () => {
  function shown(encrypted?: number) {
    const { unmount } = render(
      <I18nProvider i18n={i18n}>
        <SealedText encrypted={encrypted} />
      </I18nProvider>
    )
    const text = screen.getByText(/./).textContent
    unmount()
    return text
  }

  it('says the message waits for its keys where nothing more is known', () => {
    expect(shown(1)).toBe('Encrypted message')
    expect(shown(2)).toBe('Encrypted message')
    expect(shown(undefined)).toBe('Encrypted message')
  })

  it('says a message was encrypted for other devices only', () => {
    expect(shown(3)).toBe('Encrypted for other devices only')
  })

  it("says the sender's key changed", () => {
    expect(shown(4)).toBe("The sender's encryption key changed")
  })

  it('says the message came from a device the user distrusted', () => {
    expect(shown(5)).toBe('Sent from a device you distrusted')
  })
})
