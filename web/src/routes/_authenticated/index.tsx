import { createFileRoute, redirect } from '@tanstack/react-router'
import { Chats } from '@/features/chats'
import { getLastChat, clearLastChat } from '@/hooks/useChatStorage'
import { chatsApi } from '@/api/chats'

interface IndexSearch {
  with?: string
  name?: string
}

export const Route = createFileRoute('/_authenticated/')({
  validateSearch: (search: Record<string, unknown>): IndexSearch => ({
    with: typeof search.with === 'string' ? search.with : undefined,
    name: typeof search.name === 'string' ? search.name : undefined,
  }),
  loaderDeps: ({ search }) => ({ with: search.with }),
  loader: async ({ deps }) => {
    let chats: Awaited<ReturnType<typeof chatsApi.list>>['chats'] = []
    try {
      const response = await chatsApi.list()
      chats = response.chats || []
    } catch {
      // Soft-fail: chat list ownership stays with useChatsQuery in the page.
    }

    // When deep-linking from another app (?with=<friend>), the page itself
    // resolves the chat — skip the last-visited redirect.
    if (deps.with) {
      return { chats }
    }

    // Check for last visited chat and redirect if it still exists
    const lastChatId = await getLastChat()
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
