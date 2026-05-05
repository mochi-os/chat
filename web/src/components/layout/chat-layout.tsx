import { useEffect, useMemo } from 'react'
import { useLingui } from '@lingui/react/macro'
import { Outlet, useParams } from '@tanstack/react-router'
import {
  cn,
  useSidebar,
  AuthenticatedLayout,
  EntityAvatar,
  type SidebarData,
} from '@mochi/web'
import { MessageCircle, Plus } from 'lucide-react'
import { SidebarProvider, useSidebarContext } from '@/context/sidebar-context'
import { useChatsQuery } from '@/hooks/useChats'
import { NewChat } from '@/features/chats/components/new-chat'

const personIconCache = new Map<string, React.FC>()

function personIcon(personId: string): React.FC {
  let Icon = personIconCache.get(personId)
  if (!Icon) {
    Icon = function PersonIcon() {
      return (
        <EntityAvatar
          src={`/people/${personId}/-/avatar`}
          styleUrl={`/people/${personId}/-/style`}
          size="sm"
        />
      )
    }
    // eslint-disable-next-line lingui/no-unlocalized-strings -- React displayName is dev-tooling only, not user-facing
    Icon.displayName = `PersonIcon(${personId})`
    personIconCache.set(personId, Icon)
  }
  return Icon
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
  const { t } = useLingui()
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
      icon: chat.members === 2 && chat.other ? personIcon(chat.other) : MessageCircle,
    }))

    return {
      navGroups: [
        {
          title: t`Chats`,
          items: chatItems,
        },
        {
          title: '',
          separator: true,
          items: [
            {
              title: t`Create chat`,
              onClick: openNewChatDialog,
              icon: Plus,
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
