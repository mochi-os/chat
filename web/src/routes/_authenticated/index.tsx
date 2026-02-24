import { useCallback } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { getErrorMessage } from '@mochi/common'
import { Chats } from '@/features/chats'
import { getLastChat, clearLastChat } from '@/hooks/useChatStorage'
import { chatsApi } from '@/api/chats'

export const Route = createFileRoute('/_authenticated/')({
  loader: async () => {
    let chats: Awaited<ReturnType<typeof chatsApi.list>>['chats'] = []
    let loaderError: string | undefined
    try {
      const response = await chatsApi.list()
      chats = response.chats || []
    } catch (error) {
      // Keep chat UI usable when loader prefetch fails.
      loaderError = getErrorMessage(error, 'Failed to load chats')
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

    return { chats, loaderError }
  },
  component: IndexPage,
})

function IndexPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const retryLoaderError = useCallback(() => {
    void router.invalidate()
  }, [router])

  return (
    <Chats
      loaderError={data.loaderError}
      onRetryLoaderError={retryLoaderError}
    />
  )
}
