// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

/* eslint-disable lingui/no-unlocalized-strings -- test fixtures, not user-facing */
import { describe, it, expect } from 'vitest'
import { formatCountBadge, resolveChatView, sendRefusal } from './utils'

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

describe('resolveChatView', () => {
  const base = { selectedChatId: 'c1', found: false, loading: false, fetching: false, failed: false }

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
    expect(resolveChatView({ ...base, selectedChatId: undefined })).toBe('picker')
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
