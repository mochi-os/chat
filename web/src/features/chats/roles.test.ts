// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@lingui/core'
import { roleLabel } from './roles'

describe('roleLabel', () => {
  beforeEach(() => {
    i18n.load('en', {})
    i18n.activate('en')
  })

  it("names a room's owners, admins, moderators and visitors", () => {
    expect(roleLabel('owner')).toBe('Owner')
    expect(roleLabel('admin')).toBe('Administrator')
    expect(roleLabel('moderator')).toBe('Moderator')
    expect(roleLabel('visitor')).toBe('Visitor')
  })

  it('names no role for anyone else', () => {
    for (const role of ['', 'member', 'participant', undefined])
      expect(roleLabel(role)).toBeUndefined()
  })
})
