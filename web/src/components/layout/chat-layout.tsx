import { useEffect, useMemo, useState } from 'react'
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
import { getReadTimestamps, saveReadTimestamps } from '@/hooks/useChatStorage'
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
  const chatsQuery = useChatsQuery({ refetchInterval: 60_000 })
  const chats = useMemo(
    () => chatsQuery.data?.chats ?? [],
    [chatsQuery.data?.chats]
  )
  const { setChat, openNewChatDialog } = useSidebarContext()

  // Get chat ID from URL path
  const params = useParams({ strict: false }) as { chatId?: string }
  const urlChatId = params?.chatId

  // Per-chat read watermarks (unix seconds), keyed by real chat ID
  const [readAt, setReadAt] = useState<Record<string, number>>({})
  useEffect(() => {
    getReadTimestamps().then(setReadAt)
  }, [])

  // Sync URL chat ID to context and mark chat as read when navigated to
  useEffect(() => {
    if (urlChatId) {
      const chat = chats.find(
        (c) => c.id === urlChatId || c.fingerprint === urlChatId
      )
      setChat(urlChatId, chat?.name)
      if (chat) {
        setReadAt((prev) => {
          const next = { ...prev, [chat.id]: chat.updated }
          saveReadTimestamps(next)
          return next
        })
      }
    } else {
      setChat(null)
    }
  }, [urlChatId, chats, setChat])

  const sidebarData: SidebarData = useMemo(() => {
    // Sort chats by most recently updated
    const sortedChats = [...chats].sort((a, b) => b.updated - a.updated)

    // Resolve the real chat ID for the active URL so we can suppress its badge
    const activeChatId = urlChatId
      ? (chats.find((c) => c.id === urlChatId || c.fingerprint === urlChatId)?.id ?? urlChatId)
      : null

    // Build chat items as top-level links - use fingerprint for shorter URLs
    const chatItems = sortedChats.map((chat) => ({
      title: chat.name,
      url: `/${chat.fingerprint ?? chat.id}`,
      icon: chat.members === 2 && chat.other ? personIcon(chat.other) : MessageCircle,
      badge: !chat.left && chat.id !== activeChatId && chat.updated > (readAt[chat.id] ?? 0)
        ? '●'
        : undefined,
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
  }, [chats, openNewChatDialog, urlChatId, readAt])

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
