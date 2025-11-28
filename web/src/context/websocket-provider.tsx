import { useEffect, useMemo, type ReactNode } from 'react'
import chatsApi from '@/api/chats'
import ChatWebsocketManager, {
  type ChatWebsocketManagerOptions,
} from '@/lib/websocket-manager'
import { WebsocketContext } from '@/context/websocket-context'
import { env } from '@mochi/config/env'

const buildManager = (): ChatWebsocketManager | null => {
  if (typeof window === 'undefined') {
    return null
  }

  const baseOptions: ChatWebsocketManagerOptions = {
    baseUrl: env.websocketUrl ?? window.location.origin,
    getChatKey: async (chatId: string) => {
      try {
        const chat = await chatsApi.detail(chatId)
        return chat.key
      } catch (error) {
        if (env.debug) {
          globalThis.console?.error?.(
            '[WebSocket] Failed to fetch chat key',
            chatId,
            error
          )
        }
        return undefined
      }
    },
  }

  return new ChatWebsocketManager(baseOptions)
}

export const WebsocketProvider = ({
  children,
}: {
  children: ReactNode
}) => {
  const manager = useMemo(() => buildManager(), [])

  useEffect(() => {
    return () => {
      manager?.dispose()
    }
  }, [manager])

  if (!manager) {
    return children
  }

  return (
    <WebsocketContext.Provider value={manager}>
      {children}
    </WebsocketContext.Provider>
  )
}
