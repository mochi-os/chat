import { createFileRoute, redirect } from '@tanstack/react-router'
import { Chats } from '@/features/chats'
import { getLastChat, clearLastChat } from '@/hooks/useChatStorage'
import { chatsApi } from '@/api/chats'

export const Route = createFileRoute('/_authenticated/')({
  loader: async () => {
    // Fetch chats list using the proper API
    const response = await chatsApi.list()
    const chats = response.chats || []

    // Check for last visited chat and redirect if it still exists
    const lastChatId = getLastChat()
    if (lastChatId) {
      const chatExists = chats.some(c => c.id === lastChatId)
      if (chatExists) {
        throw redirect({ to: '/$chatId', params: { chatId: lastChatId } })
      } else {
        // Chat no longer exists, clear stored location
        clearLastChat()
      }
    }

    return { chats }
  },
  component: Chats,
})
