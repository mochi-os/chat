// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useCallback, useEffect, useState } from 'react'
import { useLingui } from '@lingui/react/macro'
import {
  useQueryClient,
  type QueryClient,
  type InfiniteData,
} from '@tanstack/react-query'
import type {
  ChatMessage,
  ChatMessageAttachment,
  GetMessagesResponse,
  ReactionCounts,
} from '@/api/chats'
import { isReactionId } from '@/features/chats/constants/reactions'
import {
  type ChatWebsocketMessagePayload,
  type WebsocketConnectionStatus,
} from '@/lib/websocket-manager'
import { chatKeys, invalidateChatsExceptChat } from '@/hooks/useChats'
import { useWebsocketManager } from '@/hooks/useWebsocketManager'
import { applyMessageEditLWW } from '@/features/chats/utils/message-edit-lww'

type NormalizedChatWebsocketMessagePayload = Omit<
  ChatWebsocketMessagePayload,
  'attachments'
> & {
  attachments?: ChatMessageAttachment[]
}

interface UseChatWebsocketResult {
  status: WebsocketConnectionStatus
  retries: number
  error?: string
  lastMessage?: NormalizedChatWebsocketMessagePayload
  forceReconnect: () => void
}

const isSameMessage = (incoming: ChatMessage, existing: ChatMessage): boolean => {
  const incomingHasRealId = incoming.id && !incoming.id.startsWith('ws-')
  const existingHasRealId = existing.id && !existing.id.startsWith('ws-')
  if (incomingHasRealId && existingHasRealId) {
    return incoming.id === existing.id
  }
  return (
    incoming.created === existing.created &&
    incoming.body === existing.body &&
    incoming.name === existing.name
  )
}

const normalizeAttachments = (
  attachments: unknown
): ChatMessageAttachment[] => {
  if (!Array.isArray(attachments)) {
    return []
  }
  return attachments as ChatMessageAttachment[]
}

const normalizePayload = (
  payload: ChatWebsocketMessagePayload
): NormalizedChatWebsocketMessagePayload => ({
  ...payload,
  attachments: normalizeAttachments(payload.attachments),
})

const createMessageFromPayload = (
  chatId: string,
  payload: NormalizedChatWebsocketMessagePayload,
  unknownSenderLabel: string,
): ChatMessage => {
  const created =
    typeof payload.created === 'number'
      ? payload.created
      : Math.floor(Date.now() / 1000)
  const messageBody =
    typeof payload.body === 'string' ? payload.body : String(payload.body ?? '')
  const senderName = typeof payload.name === 'string' ? payload.name : unknownSenderLabel
  const senderId = typeof payload.member === 'string' ? payload.member : ''

  const replyTo =
    typeof payload.reply_to === 'string' && payload.reply_to
      ? payload.reply_to
      : undefined

  return {
    id: typeof payload.id === 'string' && payload.id
      ? payload.id
      : `ws-${chatId}-${created}-${Math.random().toString(36).slice(2)}`,
    chat: chatId,
    body: messageBody,
    member: senderId,
    name: senderName,
    created,
    reply_to: replyTo,
    attachments: payload.attachments ?? [],
  }
}

const parseReactionCounts = (value: unknown): ReactionCounts => {
  if (!value || typeof value !== 'object') {
    return {}
  }
  const counts: ReactionCounts = {}
  for (const [key, count] of Object.entries(value)) {
    if (isReactionId(key) && typeof count === 'number' && count > 0) {
      counts[key] = count
    }
  }
  return counts
}

const patchMessageReactionFromWebsocket = (
  chatId: string,
  payload: NormalizedChatWebsocketMessagePayload,
  queryClient: QueryClient,
  currentUserId?: string
) => {
  const messageId =
    typeof payload.message === 'string' ? payload.message : undefined
  if (!messageId || !chatId) {
    return
  }

  const memberId =
    typeof payload.member === 'string' ? payload.member : undefined
  const reactionRaw = payload.reaction
  const reaction =
    typeof reactionRaw === 'string' && isReactionId(reactionRaw)
      ? reactionRaw
      : null
  const reactionCounts = parseReactionCounts(payload.reaction_counts)

  queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
    chatKeys.messages(chatId),
    (current) => {
      if (!current?.pages) {
        return current
      }

      let found = false
      const pages = current.pages.map((page) => ({
        ...page,
        messages: page.messages.map((message) => {
          if (message.id !== messageId) {
            return message
          }
          found = true
          const next: ChatMessage = {
            ...message,
            reaction_counts: reactionCounts,
          }
          if (currentUserId && memberId === currentUserId) {
            next.my_reaction = reaction
          }
          return next
        }),
      }))

      return found ? { ...current, pages } : current
    }
  )
}

const markMessageDeletedFromWebsocket = (
  chatId: string,
  payload: NormalizedChatWebsocketMessagePayload,
  queryClient: QueryClient
) => {
  const messageId =
    typeof payload.message === 'string' ? payload.message : undefined
  if (!messageId) {
    return
  }

  queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
    chatKeys.messages(chatId),
    (current) => {
      if (!current?.pages) {
        return current
      }

      let found = false
      const pages = current.pages.map((page) => ({
        ...page,
        messages: page.messages.map((message): ChatMessage => {
          if (message.id !== messageId) {
            return message
          }
          found = true
          return {
            ...message,
            deleted: true,
            body: '',
            attachments: [],
            reaction_counts: {},
            my_reaction: null,
          }
        }),
      }))

      return found ? { ...current, pages } : current
    }
  )
}

const patchMessageEditFromWebsocket = (
  chatId: string,
  payload: NormalizedChatWebsocketMessagePayload,
  queryClient: QueryClient
) => {
  const messageId = typeof payload.message === 'string' ? payload.message : undefined
  const body = typeof payload.body === 'string' ? payload.body : undefined
  const edited = typeof payload.edited === 'number' ? payload.edited : undefined

  if (!messageId || body === undefined || edited === undefined) {
    return
  }

  queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
    chatKeys.messages(chatId),
    (current) => {
      if (!current?.pages) return current

      let found = false
      const pages = current.pages.map((page) => ({
        ...page,
        messages: page.messages.map((message) => {
          if (message.id === messageId) {
            found = true
            return applyMessageEditLWW(message, { body, edited })
          }
          return message
        }),
      }))

      return found ? { ...current, pages } : current
    }
  )
}

const handleWebsocketEvent = (
  chatId: string,
  payload: NormalizedChatWebsocketMessagePayload,
  queryClient: QueryClient,
  currentUserId?: string
): 'event' | 'message' | 'reaction' => {
  if (!chatId) {
    return 'message'
  }

  const event = payload.event as string | undefined
  if (event) {
    switch (event) {
      case 'reaction':
        patchMessageReactionFromWebsocket(
          chatId,
          payload,
          queryClient,
          currentUserId
        )
        return 'reaction'
      case 'delete':
        markMessageDeletedFromWebsocket(chatId, payload, queryClient)
        return 'event'
      case 'edit':
        patchMessageEditFromWebsocket(chatId, payload, queryClient)
        return 'event'
      case 'removed':
      case 'rename':
      case 'leave':
      case 'member/add':
      case 'member/remove': {
        // We lose access to this chat when we are removed, or when the leave
        // event is our own (the server echoes our leave back to us). Refetching
        // this chat's detail/members then 403s, so refresh the list but skip
        // this chat. `removed` never carries a member and only ever targets us.
        const iLostAccess =
          event === 'removed' ||
          (event === 'leave' && payload.member === currentUserId)
        if (iLostAccess) {
          void invalidateChatsExceptChat(queryClient, chatId)
          return 'event'
        }
        void queryClient.invalidateQueries({ queryKey: chatKeys.all() })
        void queryClient.invalidateQueries({ queryKey: chatKeys.detail(chatId) })
        void queryClient.invalidateQueries({ queryKey: ['chats', chatId, 'members'] })
        return 'event'
      }
    }
  }

  return 'message'
}

const appendMessageToCache = (
  chatId: string,
  payload: NormalizedChatWebsocketMessagePayload,
  queryClient: QueryClient,
  unknownSenderLabel: string,
  currentUserId?: string,
) => {
  if (!chatId) {
    return
  }

  const eventKind = handleWebsocketEvent(
    chatId,
    payload,
    queryClient,
    currentUserId
  )
  if (eventKind === 'event' || eventKind === 'reaction') {
    return
  }

  // Update infinite query data structure (pages array)
  queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
    chatKeys.messages(chatId),
    (current) => {
      const incomingMessage = createMessageFromPayload(chatId, payload, unknownSenderLabel)

      if (!current || !current.pages || current.pages.length === 0) {
        // Initialize with a single page containing the message
        return {
          pages: [{ messages: [incomingMessage] }],
          pageParams: [undefined],
        }
      }

      // Check if message already exists in any page
      const alreadyExists = current.pages.some((page) =>
        page.messages.some((message) => isSameMessage(incomingMessage, message))
      )

      if (alreadyExists) {
        return current
      }

      // Append to the first page (most recent messages)
      // Pages are stored newest-first, so first page has newest messages
      const updatedPages = current.pages.map((page, index) => {
        if (index === 0) {
          return {
            ...page,
            messages: [...page.messages, incomingMessage],
          }
        }
        return page
      })

      return {
        ...current,
        pages: updatedPages,
      }
    }
  )
}

export const useChatWebsocket = (
  chatId?: string,
  chatKey?: string,
  currentUserId?: string
): UseChatWebsocketResult => {
  const { t } = useLingui()
  const unknownSenderLabel = t`Unknown`
  const manager = useWebsocketManager()
  const queryClient = useQueryClient()
  const [snapshot, setSnapshot] = useState<{
    status: WebsocketConnectionStatus
    retries: number
    lastError?: string
  } | null>(null)
  const [lastMessage, setLastMessage] =
    useState<NormalizedChatWebsocketMessagePayload>()

  useEffect(() => {
    setLastMessage(undefined)
    setSnapshot(null)

    if (!chatId || !manager) {
      return undefined
    }

    const unsubscribe = manager.subscribe(chatId, {
      chatKey,
      onMessage: (event) => {
        const normalizedPayload = normalizePayload(event.payload)
        setLastMessage(normalizedPayload)
        appendMessageToCache(
          event.chatId,
          normalizedPayload,
          queryClient,
          unknownSenderLabel,
          currentUserId
        )
      },
      onStatusChange: (nextSnapshot) => {
        setSnapshot(nextSnapshot)
      },
    })

    return () => {
      unsubscribe()
    }
  }, [chatId, chatKey, manager, queryClient, currentUserId, unknownSenderLabel])

  const forceReconnect = useCallback(() => {
    if (chatId && manager) {
      manager.forceReconnect(chatId)
    }
  }, [chatId, manager])

  return {
    status: snapshot?.status ?? 'idle',
    retries: snapshot?.retries ?? 0,
    error: snapshot?.lastError,
    lastMessage,
    forceReconnect,
  }
}
