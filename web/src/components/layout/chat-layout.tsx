import { useCallback, useEffect, useMemo } from 'react'
import { useLingui } from '@lingui/react/macro'
import { Outlet, useParams } from '@tanstack/react-router'
import {
  cn,
  useSidebar,
  AuthenticatedLayout,
  EntityAvatar,
  getErrorMessage,
  toast,
  type NavMenuItem,
  type SidebarData,
} from '@mochi/web'
import { CheckCheck, Mail, MessageCircle, Pin, PinOff, Plus } from 'lucide-react'
import { SidebarProvider, useSidebarContext } from '@/context/sidebar-context'
import { useChatsQuery, useMarkChatReadMutation } from '@/hooks/useChats'
import { NewChat } from '@/features/chats/components/new-chat'

const UNREAD_DOT = '●'

function formatUnreadBadge(unread: number): string | undefined {
  if (unread <= 0) return undefined
  return unread > 99 ? '99+' : String(unread)
}

function formatChatSidebarBadge(
  unread: number,
  markedUnread: boolean
): string | undefined {
  const countBadge = formatUnreadBadge(unread)
  if (countBadge) return countBadge
  if (markedUnread) return UNREAD_DOT
  return undefined
}

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
  const {
    setChat,
    openNewChatDialog,
    isChatMarkedUnread,
    markChatAsUnread,
    clearMarkedUnread,
    isChatPinned,
    pinChat,
    unpinChat,
  } = useSidebarContext()

  const params = useParams({ strict: false }) as { chatId?: string }
  const urlChatId = params?.chatId

  const { mutate: markChatRead } = useMarkChatReadMutation({
    onSuccess: () => {
      toast.success(t`Chat marked as read`)
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t`Failed to mark chat as read`))
    },
  })

  const handleMarkChatRead = useCallback(
    (chatId: string) => {
      clearMarkedUnread(chatId)
      markChatRead({ chatId })
    },
    [clearMarkedUnread, markChatRead]
  )

  const handleMarkChatUnread = useCallback(
    (chatId: string) => {
      markChatAsUnread(chatId)
      toast.success(t`Chat marked as unread`)
    },
    [markChatAsUnread, t]
  )

  const handlePinChat = useCallback(
    (chatId: string) => {
      pinChat(chatId)
      toast.success(t`Chat pinned`)
    },
    [pinChat, t]
  )

  const handleUnpinChat = useCallback(
    (chatId: string) => {
      unpinChat(chatId)
      toast.success(t`Chat unpinned`)
    },
    [unpinChat, t]
  )

  // Sync URL chat ID to sidebar context
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
    // Pinned chats first, then by most recently updated within each group
    const sortedChats = [...chats].sort((a, b) => {
      const aPinned = isChatPinned(a.id)
      const bPinned = isChatPinned(b.id)
      if (aPinned !== bPinned) {
        return aPinned ? -1 : 1
      }
      return b.updated - a.updated
    })

    // Resolve the real chat ID for the active URL so we can suppress its badge
    const activeChatId = urlChatId
      ? (chats.find((c) => c.id === urlChatId || c.fingerprint === urlChatId)?.id ?? urlChatId)
      : null

    // Build chat items as top-level links - use fingerprint for shorter URLs
    const chatItems = sortedChats.map((chat) => {
      const unread = chat.unread ?? 0
      const markedUnread = isChatMarkedUnread(chat.id)
      const pinned = isChatPinned(chat.id)
      const menu: NavMenuItem[] = []

      if (pinned) {
        menu.push({
          title: t`Unpin chat`,
          icon: PinOff,
          onClick: () => handleUnpinChat(chat.id),
        })
      } else {
        menu.push({
          title: t`Pin chat`,
          icon: Pin,
          onClick: () => handlePinChat(chat.id),
        })
      }

      if (!chat.left) {
        if (unread > 0 || markedUnread) {
          menu.push({
            title: t`Mark as read`,
            icon: CheckCheck,
            onClick: () => handleMarkChatRead(chat.id),
          })
        } else {
          menu.push({
            title: t`Mark as unread`,
            icon: Mail,
            onClick: () => handleMarkChatUnread(chat.id),
          })
        }
      }

      return {
        title: chat.name,
        url: `/${chat.fingerprint ?? chat.id}`,
        icon:
          chat.members === 2 && chat.other
            ? personIcon(chat.other)
            : MessageCircle,
        endIcon: pinned ? Pin : undefined,
        badge:
          !chat.left && chat.id !== activeChatId
            ? formatChatSidebarBadge(unread, markedUnread)
            : undefined,
        menu,
      }
    })

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
  }, [
    chats,
    handleMarkChatRead,
    handleMarkChatUnread,
    handlePinChat,
    handleUnpinChat,
    isChatMarkedUnread,
    isChatPinned,
    openNewChatDialog,
    t,
    urlChatId,
  ])

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
