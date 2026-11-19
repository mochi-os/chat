// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chatsApi } from './chats'
import { encryptionApi } from './encryption'
import endpoints from './endpoints'

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))

vi.mock('@mochi/web', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@mochi/web')>()),
  createAppClient: () => ({ get, post, delete: vi.fn() }),
}))

const refused = ['../delete', 'a/b', '.', '..', '']

// The table has one shape, a chat id; several of its builders, each with the
// path a normal id gave before the id went through path.
const builders: Array<[string, (chat: string) => string, string]> = [
  ['messages', endpoints.chat.messages, '/c1/-/messages'],
  [
    'messagesForwardFriend',
    endpoints.chat.messagesForwardFriend,
    '/c1/-/messages/forward/friend',
  ],
  ['read', endpoints.chat.read, '/c1/-/read'],
  ['memberAdd', endpoints.chat.memberAdd, '/c1/-/member/add'],
]

describe.each(builders)('endpoints.chat.%s', (_, build, before) => {
  it('builds the same path for a normal id', () => {
    expect(build('c1')).toBe(before)
  })

  it.each(refused)('refuses %j', (value) => {
    expect(() => build(value)).toThrow(/path: refused/)
  })

  it('keeps a query inside its segment', () => {
    expect(build('x?y=1')).toBe(before.replace('c1', 'x%3Fy%3D1'))
  })
})

describe('encryptionApi', () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    get.mockResolvedValue({ data: {} })
    post.mockResolvedValue({ data: {} })
  })

  it('asks for the same paths for a normal id', async () => {
    await encryptionApi.overview('c1')
    await encryptionApi.devices('c1', 'p1')
    await encryptionApi.trust('c1', 'p1', 'd1', 'verified')
    await encryptionApi.recover('c1', 'k')
    expect(get.mock.calls.map((call) => call[0])).toEqual([
      '/c1/-/encryption',
      '/c1/-/encryption/devices',
    ])
    expect(post.mock.calls.map((call) => call[0])).toEqual([
      '/c1/-/encryption/trust',
      '/c1/-/encryption/recover',
    ])
  })

  it.each(refused)('rejects %j and sends nothing', async (value) => {
    await expect(encryptionApi.overview(value)).rejects.toThrow(/path: refused/)
    await expect(encryptionApi.setup(value)).rejects.toThrow(/path: refused/)
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })
})

// A call built from a refused id rejects, as a failed request does, so a
// caller's catch sees it; a throw would escape the typing effect's
// `void chatsApi.typing(id).catch(...)` and take the page down.
describe('chatsApi refused ids', () => {
  beforeEach(() => {
    post.mockReset()
    post.mockResolvedValue({ data: {} })
  })

  it('rejects rather than throws, and sends nothing', async () => {
    let call: Promise<unknown> | undefined
    expect(() => {
      call = chatsApi.typing('..')
    }).not.toThrow()
    await expect(call).rejects.toThrow(/path: refused/)
    await expect(chatsApi.markRead('a/b')).rejects.toThrow(/path: refused/)
    expect(post).not.toHaveBeenCalled()
  })
})
