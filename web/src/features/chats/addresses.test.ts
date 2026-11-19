// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { describe, expect, it, vi } from 'vitest'

vi.mock('@mochi/web', async (original) => ({
  ...(await original<typeof import('@mochi/web')>()),
  getAppPath: () => '/chat',
}))

import { attachmentAddress, messageAsset, personAsset } from './addresses'

const CHAT = '0123456789abcdef0123456789abcdef'
const ID = 'fedcba9876543210fedcba9876543210'

describe('chat addresses', () => {
  it('builds each address from its ids', () => {
    expect(attachmentAddress(CHAT, ID)).toBe(
      `/chat/${CHAT}/-/attachments/${ID}`
    )
    expect(attachmentAddress(CHAT, ID, 'preview')).toBe(
      `/chat/${CHAT}/-/attachments/${ID}/preview`
    )
    expect(messageAsset({ chat: CHAT, id: ID })).toBe(
      `/chat/${CHAT}/-/${ID}/asset`
    )
    expect(personAsset('did:plc:abc', 'avatar')).toBe(
      '/chat/-/person/did%3Aplc%3Aabc/asset/avatar'
    )
  })

  it('gives no address for an id a member chose to climb out of the route', () => {
    for (const hostile of ['../delete', 'a/b', '.', '..', '']) {
      expect(attachmentAddress(hostile, ID)).toBeUndefined()
      expect(attachmentAddress(CHAT, hostile)).toBeUndefined()
      expect(messageAsset({ chat: CHAT, id: hostile })).toBeUndefined()
      expect(personAsset(hostile, 'style')).toBeUndefined()
    }
    expect(messageAsset({ chat: CHAT, id: 'x?y=1' })).toBe(
      `/chat/${CHAT}/-/x%3Fy%3D1/asset`
    )
  })
})
