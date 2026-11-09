// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { describe, expect, it } from 'vitest'
import { befriend, friendRequest } from './new-chat'

const STRANGER = '1sfEACmTnQhBVgquGhaCs8Jw4SXKF9XY2apnUwJ63duq2QSxh5'

function refusal(status: number) {
  return { response: { status, data: { message: 'refused' } } }
}

describe('befriend', () => {
  it('offers a friend request to the one stranger whose chat policy refused', () => {
    // THE POINT: a friend may always be chatted with, so the refused person
    // is the one to ask.
    expect(befriend(refusal(403), [STRANGER])).toBe(STRANGER)
  })

  it('offers nothing where their server could not be reached', () => {
    expect(befriend(refusal(400), [STRANGER])).toBeNull()
  })

  it('offers nothing where several strangers were asked, as the refusal does not say which', () => {
    expect(befriend(refusal(403), [STRANGER, 'another'])).toBeNull()
  })
})

describe('friendRequest', () => {
  it("opens People's add dialog on the person", () => {
    expect(friendRequest(STRANGER)).toBe(
      `/people/?action=add&search=${STRANGER}`
    )
    expect(friendRequest('a b&c')).toBe(
      '/people/?action=add&search=a%20b%26c'
    )
  })
})
