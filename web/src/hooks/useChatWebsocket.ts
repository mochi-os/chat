import { useCallback, useEffect, useState } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import type {
  ChatMessage,
  ChatMessageAttachment,
  GetMessagesResponse,
} from '@/api/chats'
import { useWebsocketManager } from '@/hooks/useWebsocketManager'
import {
  type ChatWebsocketEvent,
  type ChatWebsocketMessagePayload,
  type WebsocketConnectionStatus,
} from '@/lib/websocket-manager'
import { chatKeys } from '@/hooks/useChats'

interface UseChatWebsocketResult {
  status: WebsocketConnectionStatus
  retries: number
  error?: string
  lastMessage?: ChatWebsocketMessagePayload
  forceReconnect: () => void
}

const isSameMessage = (
  incoming: ChatMessage,
  existing: ChatMessage
): boolean =>
  incoming.created_local === existing.created_local &&
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
  const createdLocal =
    typeof payload.created_local === 'string'
      ? payload.created_local
      : new Date().toISOString()
  const created = Math.floor(new Date(createdLocal).getTime() / 1000)
  const messageBody =
    typeof payload.body === 'string' ? payload.body : String(payload.body ?? '')
  const senderName =
    typeof payload.name === 'string' ? payload.name : 'Unknown'

  return {
    id: `ws-${chatId}-${created}-${Math.random().toString(36).slice(2)}`,
    chat: chatId,
    body: messageBody,
    member: senderName,
    name: senderName,
    created: Number.isFinite(created) ? created : Math.floor(Date.now() / 1000),
    created_local: createdLocal,
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

  queryClient.setQueryData<GetMessagesResponse>(
    chatKeys.messages(chatId),
    (current) => {
      const incomingMessage = createMessageFromPayload(chatId, payload)
      if (!current) {
        return {
          messages: [incomingMessage],
        }
      }

      const alreadyExists = current.messages.some((message) =>
        isSameMessage(incomingMessage, message)
      )

      if (alreadyExists) {
        return current
      }

      return {
        ...current,
        messages: [...current.messages, incomingMessage],
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
