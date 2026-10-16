// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '@/api/types/chats'
import { receiptState, seenBy } from './receipts'

const message = (id: string, member: string, created: number, name = member) =>
  ({ id, chat: 'c1', body: 'x', member, name, created, attachments: [] }) as ChatMessage

describe('receiptState', () => {
  it('is sent until a member holds the message, delivered, then read', () => {
    const sent = message('m1', 'me', 10)
    expect(receiptState(sent, [], 'me')).toBe('sent')
    expect(receiptState(sent, [{ member: 'bob', name: 'Bob', delivered: 9, displayed: 0 }], 'me')).toBe('sent')
    expect(receiptState(sent, [{ member: 'bob', name: 'Bob', delivered: 10, displayed: 0 }], 'me')).toBe('delivered')
    expect(receiptState(sent, [{ member: 'bob', name: 'Bob', delivered: 12, displayed: 11 }], 'me')).toBe('read')
  })

  it('waits for every other member, and ignores the user\'s own row', () => {
    const sent = message('m1', 'me', 10)
    const receipts = [
      { member: 'bob', name: 'Bob', delivered: 10, displayed: 10 },
      { member: 'carol', name: 'Carol', delivered: 10, displayed: 0 },
      { member: 'me', name: 'Me', delivered: 0, displayed: 0 },
    ]
    expect(receiptState(sent, receipts, 'me')).toBe('delivered')
  })
})

describe('seenBy', () => {
  it("names who has read the user's newest message, sorted", () => {
    const messages = [message('m1', 'me', 10), message('m2', 'zoe', 11, 'Zoe'), message('m3', 'me', 12)]
    const receipts = [
      { member: 'zoe', name: '', delivered: 12, displayed: 12 },
      { member: 'bob', name: 'Bob', delivered: 12, displayed: 12 },
      { member: 'carol', name: 'Carol', delivered: 12, displayed: 11 },
    ]
    expect(seenBy(messages, receipts, 'me')).toEqual({ id: 'm3', names: ['Bob', 'Zoe'] })
  })

  it('is nothing while nobody has read it', () => {
    expect(seenBy([message('m1', 'me', 10)], [{ member: 'bob', name: 'Bob', delivered: 10, displayed: 9 }], 'me')).toBeNull()
  })
})
