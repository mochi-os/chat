// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { describe, it, expect } from 'vitest'
import {
  formatCountBadge,
  heldRoot,
  matchRoot,
  matrixAddress,
  resolveChatView,
  restoresInto,
  sendRefusal,
  tooLong,
  xmppAddress,
} from './utils'
import { MESSAGE_MAX_LENGTH, messageLength } from './constants/limits'

describe('sendRefusal', () => {
  it('refuses a body over the maximum, which the Enter path used to skip', () => {
    expect(sendRefusal('a'.repeat(11), 0, 10)).toBe('length')
  })

  it('refuses an empty body with no attachments', () => {
    expect(sendRefusal('   ', 0, 10)).toBe('empty')
  })

  it('allows attachments without text, and text within the maximum', () => {
    expect(sendRefusal('', 1, 10)).toBeNull()
    expect(sendRefusal('hello', 0, 10)).toBeNull()
    expect(sendRefusal('a'.repeat(10), 0, 10)).toBeNull()
  })
})

describe('the message limit, in code points as the server counts it', () => {
  it('counts a character past the Basic Multilingual Plane once', () => {
    expect(messageLength('😀')).toBe(1)
    expect(messageLength('é😀a')).toBe(3)
  })

  it('takes a full message of emoji, twice as long in UTF-16 units', () => {
    const full = '😀'.repeat(MESSAGE_MAX_LENGTH)
    expect(full.length).toBe(2 * MESSAGE_MAX_LENGTH)
    expect(sendRefusal(full, 0, MESSAGE_MAX_LENGTH)).toBeNull()
    expect(sendRefusal(full + 'a', 0, MESSAGE_MAX_LENGTH)).toBe('length')
  })

  it('says by how much a message is over, in the singular for one', () => {
    const digits = (value: number) => String(value)
    expect(tooLong(1, digits)).toBe('Message is 1 character too long')
    expect(tooLong(12, digits)).toBe('Message is 12 characters too long')
  })
})

describe('restoresInto', () => {
  const empty = { chatId: 'c1', newMessage: '', pendingAttachments: [], replyTo: null }

  it('puts a failed message back into its own chat\'s empty composer', () => {
    expect(restoresInto(empty, 'c1')).toBe(true)
    expect(restoresInto({ ...empty, newMessage: '   ' }, 'c1')).toBe(true)
  })

  it('leaves a composer holding the next message, its files or a reply target', () => {
    expect(restoresInto({ ...empty, newMessage: 'next' }, 'c1')).toBe(false)
    expect(restoresInto({ ...empty, pendingAttachments: [{}] }, 'c1')).toBe(false)
    expect(restoresInto({ ...empty, replyTo: { id: 'm1' } }, 'c1')).toBe(false)
  })

  it('never puts it into another chat\'s composer', () => {
    expect(restoresInto(empty, 'c2')).toBe(false)
  })
})

describe('matchRoot', () => {
  const loaded = [{ id: 'm1', body: 'loaded' }]
  const roots = new Map([['m2', { id: 'm2', body: 'from the search' }]])

  it('finds the message a reply match\'s thread is under, loaded or from the search', () => {
    expect(matchRoot('m1', loaded, roots)?.body).toBe('loaded')
    expect(matchRoot('m2', loaded, roots)?.body).toBe('from the search')
  })

  it('has none for a match of the main timeline, or a root neither holds', () => {
    expect(matchRoot('', loaded, roots)).toBeNull()
    expect(matchRoot(undefined, loaded, roots)).toBeNull()
    expect(matchRoot('m3', loaded, roots)).toBeNull()
  })
})

describe('heldRoot', () => {
  it('is the open thread\'s root as the list now holds it, deleted since included', () => {
    const opened = { id: 'm1', deleted: false }
    expect(heldRoot(opened, [{ id: 'm1', deleted: true }])?.deleted).toBe(true)
    expect(heldRoot(opened, [])).toBe(opened)
    expect(heldRoot(null, [opened])).toBeNull()
  })
})

describe('resolveChatView', () => {
  const base = {
    selectedChatId: 'c1',
    found: false,
    loading: false,
    fetching: false,
    failed: false,
  }

  it('shows the not-found state for an id the settled list does not hold', () => {
    expect(resolveChatView(base)).toBe('notfound')
  })

  it('keeps the skeleton up while the list is still fetching an unresolved id', () => {
    // The new-chat dialog navigates to a fresh id before the invalidated list lands.
    expect(resolveChatView({ ...base, fetching: true })).toBe('skeleton')
    expect(resolveChatView({ ...base, loading: true })).toBe('skeleton')
  })

  it('leaves a failed list to the page error display, not a not-found', () => {
    expect(resolveChatView({ ...base, failed: true })).toBe('picker')
  })

  it('renders the chat once found and the picker with no id', () => {
    expect(resolveChatView({ ...base, found: true })).toBe('chat')
    expect(resolveChatView({ ...base, selectedChatId: undefined })).toBe(
      'picker'
    )
  })
})

describe('formatCountBadge', () => {
  const digits = (value: number) => `«${value}»`

  it('formats the capped value through the locale formatter, not a literal', () => {
    expect(formatCountBadge(150, digits)).toBe('«99»+')
  })

  it('formats an uncapped value directly', () => {
    expect(formatCountBadge(7, digits)).toBe('«7»')
    expect(formatCountBadge(99, digits)).toBe('«99»')
  })
})

describe('matrixAddress', () => {
  it('takes an address as typed', () => {
    expect(matrixAddress(' @dave:matrix.example ')).toBe('@dave:matrix.example')
    expect(matrixAddress('@dave:matrix.example:8448')).toBe(
      '@dave:matrix.example:8448'
    )
  })

  it("takes a contact card's messaging address", () => {
    expect(matrixAddress('matrix:u/dave:matrix.example')).toBe(
      '@dave:matrix.example'
    )
    expect(matrixAddress('MATRIX:u/dave:matrix.example')).toBe(
      '@dave:matrix.example'
    )
  })

  it('takes nothing that is not an address', () => {
    for (const value of [
      'dave',
      '@dave',
      'dave:matrix.example',
      '@da ve:matrix.example',
      '@dave:matrix example',
      '#room:matrix.example',
      '',
    ])
      expect(matrixAddress(value)).toBeNull()
  })
})

describe('xmppAddress', () => {
  it('takes an address as typed or as a contact card gives it, lowercased', () => {
    expect(xmppAddress(' Dave@XMPP.example ')).toBe('dave@xmpp.example')
    expect(xmppAddress('xmpp:dave@xmpp.example')).toBe('dave@xmpp.example')
  })

  it('takes nothing that is not an address', () => {
    for (const value of [
      'dave',
      '@dave:matrix.example',
      'dave@',
      '@xmpp.example',
      'da ve@xmpp.example',
      'dave@xmpp.example/phone',
      'a@b@xmpp.example',
      '',
    ])
      expect(xmppAddress(value)).toBeNull()
  })
})
