// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { path } from '@mochi/web'

// Every chat id goes in through path, as one encoded segment: it comes from
// the address, and one holding a `/`, `?` or `..` would otherwise reach a
// different action. A value that cannot be one segment throws.
const endpoints = {
  chat: {
    list: '/-/list',
    new: '/-/new',
    create: '/-/create',
    personSearch: '/-/person/search',
    preferencesGet: '/-/preferences/get',
    preferencesSet: '/-/preferences/set',
    messages: (chatId: string) => path`/${chatId}/-/messages`,
    messagesEdit: (chatId: string) => path`/${chatId}/-/messages/edit`,
    messagesDelete: (chatId: string) => path`/${chatId}/-/messages/delete`,
    messagesForward: (chatId: string) => path`/${chatId}/-/messages/forward`,
    messagesForwardFriend: (chatId: string) =>
      path`/${chatId}/-/messages/forward/friend`,
    search: (chatId: string) => path`/${chatId}/-/search`,
    read: (chatId: string) => path`/${chatId}/-/read`,
    send: (chatId: string) => path`/${chatId}/-/send`,
    typing: (chatId: string) => path`/${chatId}/-/typing`,
    presence: (chatId: string) => path`/${chatId}/-/presence`,
    react: (chatId: string) => path`/${chatId}/-/react`,
    detail: (chatId: string) => path`/${chatId}/-/view`,
    members: (chatId: string) => path`/${chatId}/-/members`,
    rename: (chatId: string) => path`/${chatId}/-/rename`,
    leave: (chatId: string) => path`/${chatId}/-/leave`,
    accept: (chatId: string) => path`/${chatId}/-/accept`,
    decline: (chatId: string) => path`/${chatId}/-/decline`,
    delete: (chatId: string) => path`/${chatId}/-/delete`,
    memberAdd: (chatId: string) => path`/${chatId}/-/member/add`,
    memberRemove: (chatId: string) => path`/${chatId}/-/member/remove`,
  },
} as const

export default endpoints
