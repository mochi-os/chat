// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

const endpoints = {
  chat: {
    list: '/-/list',
    new: '/-/new',
    create: '/-/create',
    personSearch: '/-/person/search',
    preferencesGet: '/-/preferences/get',
    preferencesSet: '/-/preferences/set',
    messages: (chatId: string) => `/${chatId}/-/messages`,
    messagesEdit: (chatId: string) => `/${chatId}/-/messages/edit`,
    messagesDelete: (chatId: string) => `/${chatId}/-/messages/delete`,
    messagesForward: (chatId: string) => `/${chatId}/-/messages/forward`,
    search: (chatId: string) => `/${chatId}/-/search`,
    read: (chatId: string) => `/${chatId}/-/read`,
    send: (chatId: string) => `/${chatId}/-/send`,
    react: (chatId: string) => `/${chatId}/-/react`,
    detail: (chatId: string) => `/${chatId}/-/view`,
    members: (chatId: string) => `/${chatId}/-/members`,
    rename: (chatId: string) => `/${chatId}/-/rename`,
    leave: (chatId: string) => `/${chatId}/-/leave`,
    delete: (chatId: string) => `/${chatId}/-/delete`,
    memberAdd: (chatId: string) => `/${chatId}/-/member/add`,
    memberRemove: (chatId: string) => `/${chatId}/-/member/remove`,
  },
  auth: {
    code: '/_/code',
    verify: '/_/verify',
    identity: '/_/identity',
    logout: '/_/logout',
  },
} as const

export default endpoints
