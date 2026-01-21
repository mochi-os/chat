import { useEffect, useMemo, useRef } from 'react'
import { Outlet, useParams } from '@tanstack/react-router'
import {
  cn,
  useSidebar,
  AuthenticatedLayout,
  type SidebarData,
} from '@mochi/common'
import { MessageCircle, Plus } from 'lucide-react'
import { SidebarProvider, useSidebarContext } from '@/context/sidebar-context'
import { useChatsQuery } from '@/hooks/useChats'
import { NewChat } from '@/features/chats/components/new-chat'

// Auto-open sidebar on mobile when there are chats but none selected
function AutoOpenMobileSidebar({
  hasChats,
  hasChatSelected,
}: {
  hasChats: boolean
  hasChatSelected: boolean
}) {
  const { setOpenMobile, isMobile } = useSidebar()
  const hasAutoOpened = useRef(false)

  useEffect(() => {
    // Only auto-open once, on mobile, when there are chats but none selected
    if (isMobile && hasChats && !hasChatSelected && !hasAutoOpened.current) {
      hasAutoOpened.current = true
      setOpenMobile(true)
    }
  }, [isMobile, hasChats, hasChatSelected, setOpenMobile])

  return null
}

function WebsocketStatusIndicator() {
  const { websocketStatusMeta, chatId } = useSidebarContext()
  const { state } = useSidebar()
  const isCollapsed = state === 'collapsed'

  if (!chatId) return null

  return (
    <div
      className={cn(
        'text-muted-foreground flex items-center gap-2 px-2 py-2 text-xs',
        isCollapsed && 'justify-center px-0'
      )}
    >
      <span
        className={cn(
          'h-2 w-2 flex-shrink-0 rounded-full',
          websocketStatusMeta.color
        )}
      />
      {!isCollapsed && <span>{websocketStatusMeta.label}</span>}
    </div>
  )
}

function ChatLayoutInner() {
  const chatsQuery = useChatsQuery()
  const chats = useMemo(
    () => chatsQuery.data?.chats ?? [],
    [chatsQuery.data?.chats]
  )
  const { setChat, openNewChatDialog } = useSidebarContext()

  // Get chat ID from URL path
  const params = useParams({ strict: false }) as { chatId?: string }
  const urlChatId = params?.chatId

  // Sync URL chat ID to context
  useEffect(() => {
    if (urlChatId) {
      const chat = chats.find(
        (c) => c.id === urlChatId || c.fingerprint === urlChatId
      )
      setChat(urlChatId, chat?.name)
    } else {
      setChat(null)
    }
  }, [urlChatId, chats, setChat])

  const sidebarData: SidebarData = useMemo(() => {
    // Sort chats by most recently updated
    const sortedChats = [...chats].sort((a, b) => b.updated - a.updated)

    // Build chat items as top-level links - use fingerprint for shorter URLs
    const chatItems = sortedChats.map((chat) => ({
      title: chat.name,
      url: `/${chat.fingerprint ?? chat.id}`,
      icon: MessageCircle,
    }))

    return {
      navGroups: [
        {
          title: 'Chats',
          items: chatItems,
        },
        {
          title: '',
          separator: true,
          items: [
            {
              title: 'New chat',
              onClick: openNewChatDialog,
              icon: Plus,
              variant: 'primary',
            },
          ],
        },
      ],
    }
  }, [chats, openNewChatDialog])

  return (
    <AuthenticatedLayout
      sidebarData={sidebarData}
      sidebarFooter={<WebsocketStatusIndicator />}
    >
      <AutoOpenMobileSidebar
        hasChats={chats.length > 0}
        hasChatSelected={!!urlChatId}
      />
      <Outlet />
    </AuthenticatedLayout>
  )
}

export function ChatLayout() {
  return (
    <SidebarProvider>
      <ChatLayoutInner />
      <NewChat />
    </SidebarProvider>
  )
}
