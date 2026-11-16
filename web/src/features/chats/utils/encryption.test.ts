// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { describe, expect, it } from 'vitest'
import type { Verification } from '@/api/encryption'
import type { ChatMessage } from '@/api/types/chats'
import {
  collapseEarlierHistory,
  fingerprintGroups,
  isEarlierHistory,
  verificationShown,
} from './encryption'

const verification = (
  flow: string,
  phase: Verification['phase']
): Verification => ({
  account: 'a1',
  flow,
  person: '@bob:example.com',
  name: 'Bob',
  device: 'D1',
  phase,
  started: false,
  updated: 1,
})

describe('fingerprintGroups', () => {
  it('groups a fingerprint by eight', () => {
    expect(fingerprintGroups('0123456789abcdef01')).toBe('01234567 89abcdef 01')
    expect(fingerprintGroups('')).toBe('')
  })
})

describe('verificationShown', () => {
  it('shows the latest verification under way that was not closed', () => {
    const all = [
      verification('f1', 'compare'),
      verification('f2', 'requested'),
      verification('f3', 'done'),
      verification('f4', 'cancelled'),
    ]
    expect(verificationShown(all, new Set())?.flow).toBe('f2')
    expect(verificationShown(all, new Set(['f2']))?.flow).toBe('f1')
    expect(verificationShown(all, new Set(['f1', 'f2']))).toBeUndefined()
  })
})

const message = (id: string, encrypted: number, body = ''): ChatMessage => ({
  id,
  chat: 'c1',
  body,
  member: 'xmpp:bob@example.com',
  name: 'Bob',
  created: 1,
  attachments: [],
  encrypted,
})

describe('collapseEarlierHistory', () => {
  it('keeps one message for each run of history from before the account was added', () => {
    const messages = [
      message('m1', 2),
      message('m2', 2),
      message('m3', 2),
      message('m4', 0, 'plain'),
      message('m5', 2),
      message('m6', 2),
      message('m7', 3),
      message('m8', 1),
    ]
    expect(collapseEarlierHistory(messages).map((m) => m.id)).toEqual([
      'm1',
      'm4',
      'm5',
      'm7',
      'm8',
    ])
  })

  it('shows every message encrypted for other devices, or waiting for its keys', () => {
    const messages = [
      message('m1', 3),
      message('m2', 3),
      message('m3', 1),
      message('m4', 1),
    ]
    expect(collapseEarlierHistory(messages)).toEqual(messages)
  })

  it('counts a message as history only while it has nothing to show', () => {
    expect(isEarlierHistory(message('m1', 2))).toBe(true)
    expect(isEarlierHistory(message('m1', 3))).toBe(false)
    expect(isEarlierHistory({ ...message('m1', 2), deleted: true })).toBe(false)
    expect(isEarlierHistory(message('m1', 2, 'text'))).toBe(false)
  })
})
