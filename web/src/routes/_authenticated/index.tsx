import { createFileRoute, redirect } from '@tanstack/react-router'
import { Chats } from '@/features/chats'
import { getLastChat, clearLastChat } from '@/hooks/useChatStorage'
import { chatsApi } from '@/api/chats'

export const Route = createFileRoute('/_authenticated/')({
  loader: async () => {
    let chats: Awaited<ReturnType<typeof chatsApi.list>>['chats'] = []
    try {
      const response = await chatsApi.list()
      chats = response.chats || []
    } catch {
      // Soft-fail: chat list ownership stays with useChatsQuery in the page.
    }

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
