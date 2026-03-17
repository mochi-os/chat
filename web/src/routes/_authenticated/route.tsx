import { createFileRoute } from '@tanstack/react-router'
import { useAuthStore } from '@mochi/web'
import { ChatLayout } from '@/components/layout/chat-layout'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async () => {
    const store = useAuthStore.getState()
    if (!store.isInitialized) {
      await store.initialize()
    }
  },
  component: ChatLayout,
})
