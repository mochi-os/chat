import { useCallback, useEffect, useState } from 'react'
import {
  useQueryClient,
  type QueryClient,
  type InfiniteData,
} from '@tanstack/react-query'
import type {
  ChatMessage,
  ChatMessageAttachment,
  GetMessagesResponse,
} from '@/api/chats'
import {
  type ChatWebsocketMessagePayload,
  type WebsocketConnectionStatus,
} from '@/lib/websocket-manager'
import { chatKeys } from '@/hooks/useChats'
import { useWebsocketManager } from '@/hooks/useWebsocketManager'

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

const isSameMessage = (incoming: ChatMessage, existing: ChatMessage): boolean =>
  incoming.created === existing.created &&
  incoming.body === existing.body &&
  incoming.name === existing.name

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
  payload: NormalizedChatWebsocketMessagePayload
): ChatMessage => {
  const created =
    typeof payload.created === 'number'
      ? payload.created
      : Math.floor(Date.now() / 1000)
  const messageBody =
    typeof payload.body === 'string' ? payload.body : String(payload.body ?? '')
  const senderName = typeof payload.name === 'string' ? payload.name : 'Unknown'
  const senderId = typeof payload.member === 'string' ? payload.member : ''

  return {
    id: `ws-${chatId}-${created}-${Math.random().toString(36).slice(2)}`,
    chat: chatId,
    body: messageBody,
    member: senderId,
    name: senderName,
    created,
    created_local: '',
    attachments: payload.attachments ?? [],
  }
}

const handleWebsocketEvent = (
  chatId: string,
  payload: NormalizedChatWebsocketMessagePayload,
  queryClient: QueryClient
): 'event' | 'message' => {
  if (!chatId) {
    return 'message'
  }

  // Check if this is a special event
  const event = payload.event as string | undefined
  if (event) {
    switch (event) {
      case 'removed':
      case 'rename':
      case 'leave':
      case 'member_add':
      case 'member_remove':
        // Invalidate queries to refresh chat state
        void queryClient.invalidateQueries({ queryKey: chatKeys.all() })
        void queryClient.invalidateQueries({ queryKey: chatKeys.detail(chatId) })
        void queryClient.invalidateQueries({ queryKey: ['chats', chatId, 'members'] })
        return 'event'
    }
  }

  return 'message'
}

const appendMessageToCache = (
  chatId: string,
  payload: NormalizedChatWebsocketMessagePayload,
  queryClient: QueryClient
) => {
  if (!chatId) {
    return
  }

  // Check if this is a special event (not a message)
  if (handleWebsocketEvent(chatId, payload, queryClient) === 'event') {
    return
  }

  // Update infinite query data structure (pages array)
  queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
    chatKeys.messages(chatId),
    (current) => {
      const incomingMessage = createMessageFromPayload(chatId, payload)

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
  chatKey?: string
): UseChatWebsocketResult => {
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
        appendMessageToCache(event.chatId, normalizedPayload, queryClient)
      },
      onStatusChange: (nextSnapshot) => {
        setSnapshot(nextSnapshot)
      },
    })

    return () => {
      unsubscribe()
    }
  }, [chatId, chatKey, manager, queryClient])

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
