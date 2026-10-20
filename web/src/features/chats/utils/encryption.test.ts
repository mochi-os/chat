// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { describe, expect, it } from 'vitest'
import type { Verification } from '@/api/encryption'
import { fingerprintGroups, verificationShown } from './encryption'

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
