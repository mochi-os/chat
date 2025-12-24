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
  type ChatWebsocketEvent,
  type ChatWebsocketMessagePayload,
  type WebsocketConnectionStatus,
} from '@/lib/websocket-manager'
import { chatKeys } from '@/hooks/useChats'
import { useWebsocketManager } from '@/hooks/useWebsocketManager'

interface UseChatWebsocketResult {
  status: WebsocketConnectionStatus
  retries: number
  error?: string
  lastMessage?: ChatWebsocketMessagePayload
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

const createMessageFromPayload = (
  chatId: string,
  payload: ChatWebsocketMessagePayload
): ChatMessage => {
  const created =
    typeof payload.created === 'number'
      ? payload.created
      : Math.floor(Date.now() / 1000)
  const messageBody =
    typeof payload.body === 'string' ? payload.body : String(payload.body ?? '')
  const senderName = typeof payload.name === 'string' ? payload.name : 'Unknown'

  return {
    id: `ws-${chatId}-${created}-${Math.random().toString(36).slice(2)}`,
    chat: chatId,
    body: messageBody,
    member: senderName,
    name: senderName,
    created,
    created_local: '',
    attachments: normalizeAttachments(payload.attachments),
  }
}

const appendMessageToCache = (
  chatId: string,
  payload: ChatWebsocketMessagePayload,
  queryClient: QueryClient
) => {
  if (!chatId) {
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
  const [lastEvent, setLastEvent] = useState<ChatWebsocketEvent | null>(null)

  useEffect(() => {
    setLastEvent(null)
    setSnapshot(null)

    if (!chatId) {
      return undefined
    }

    const unsubscribe = manager.subscribe(chatId, {
      chatKey,
      onMessage: (event) => {
        setLastEvent(event)
        appendMessageToCache(event.chatId, event.payload, queryClient)
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
    if (chatId) {
      manager.forceReconnect(chatId)
    }
  }, [chatId, manager])

  return {
    status: snapshot?.status ?? 'idle',
    retries: snapshot?.retries ?? 0,
    error: snapshot?.lastError,
    lastMessage: lastEvent?.payload,
    forceReconnect,
  }
}

export default useChatWebsocket
