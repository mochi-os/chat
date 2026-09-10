// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { describe, it, expect } from 'vitest'
import { nextMessagesPage } from './useChats'

describe('nextMessagesPage', () => {
  it('follows the cursor the server hands back while more remains', () => {
    expect(nextMessagesPage({ messages: [], more: true, cursor: '1700000000:m1' }, [undefined])).toBe('1700000000:m1')
  })

  it('stops on the last page, and on a page that names no cursor', () => {
    expect(nextMessagesPage({ messages: [], more: false, cursor: null }, [undefined])).toBeUndefined()
    expect(nextMessagesPage({ messages: [], more: true, cursor: null }, [undefined])).toBeUndefined()
  })

  it('never requests the same cursor twice, which would page forever', () => {
    expect(nextMessagesPage({ messages: [], more: true, cursor: '1700000000:m1' }, [undefined, '1700000000:m1'])).toBeUndefined()
  })
})
