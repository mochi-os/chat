// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

// A message's file is saved through the shell, which fetches it: a link to it
// would put its address, asset token and all, in the page and in a copied link.
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MessageAttachments } from './message-attachments'

const downloads = vi.hoisted(() => [] as Array<[string, string]>)

vi.mock('@mochi/web', async (original) => ({
  ...(await original<typeof import('@mochi/web')>()),
  authenticatedUrl: (url: string) => `${url}?token=asset-token`,
  shellDownload: async (url: string, name: string) => {
    downloads.push([url, name])
    return true
  },
}))

describe('a message file', () => {
  it('is saved through the shell, with its address kept out of the page', () => {
    const view = render(
      <I18nProvider i18n={i18n}>
        <MessageAttachments
          chatId='c1'
          attachments={[
            { id: 'a1', name: 'notes.pdf', size: 10, type: 'application/pdf' },
          ]}
        />
      </I18nProvider>
    )
    expect(view.container.innerHTML).not.toContain('token=')
    fireEvent.click(screen.getByRole('button', { name: 'notes.pdf' }))
    expect(downloads).toHaveLength(1)
    expect(downloads[0][0]).toContain('/c1/-/attachments/a1?token=asset-token')
    expect(downloads[0][1]).toBe('notes.pdf')
  })
})
