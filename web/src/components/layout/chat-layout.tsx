import { useEffect, useMemo, useRef } from 'react'
import { Outlet, useParams } from '@tanstack/react-router'
import {
  cn,
  getCookie,
  LayoutProvider,
  SearchProvider,
  NavGroup,
  SidebarProvider as UISidebarProvider,
  SidebarInset,
  SidebarTrigger,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  useSidebar,
  useLayout,
  useAuthStore,
  readProfileCookie,
  useDialogState,
  useNotifications,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  SignOutDialog,
  NotificationsDropdown,
  type SidebarData,
} from '@mochi/common'
import { CircleUser, LogOut, MessageCircle, Plus } from 'lucide-react'
import { SidebarProvider, useSidebarContext } from '@/context/sidebar-context'
import { useChatsQuery } from '@/hooks/useChats'
import { NewChat } from '@/features/chats/components/new-chat'
import { TopBar } from './top-bar'

// Mobile header with logo, user menu, notifications, and sidebar trigger
function MobileHeader() {
  const [signOutOpen, setSignOutOpen] = useDialogState()
  const { notifications, markAsRead, markAllAsRead } = useNotifications()

  const email = useAuthStore((state) => state.email)
  const profile = readProfileCookie()
  const displayName = profile.name || 'User'
  const displayEmail = email || ''

  return (
    <>
      <header className='flex h-12 items-center gap-1 border-b px-2 md:hidden'>
        {/* Logo */}
        <a href='/' className='flex size-9 items-center justify-center rounded-md'>
          <img src='./images/logo-header.svg' alt='Mochi' className='size-6' />
        </a>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='ghost' size='icon' className='size-9'>
              <CircleUser className='size-5' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className='min-w-56' align='start'>
            <DropdownMenuLabel className='p-0 font-normal'>
              <div className='grid px-2 py-1.5 text-start text-sm leading-tight'>
                <span className='font-semibold'>{displayName}</span>
                <span className='text-muted-foreground text-xs'>
                  {displayEmail}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setSignOutOpen(true)}>
              <LogOut className='size-4' />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notifications */}
        <NotificationsDropdown
          notifications={notifications}
          notificationsUrl='/notifications/'
          onNotificationClick={(n) => markAsRead(n.id)}
          onMarkAllAsRead={markAllAsRead}
          buttonClassName='size-9'
        />

        {/* Sidebar trigger */}
        <SidebarTrigger className='size-9' />
      </header>

      <SignOutDialog open={!!signOutOpen} onOpenChange={setSignOutOpen} />
    </>
  )
}

// Auto-open sidebar on mobile when there are chats but none selected
function AutoOpenMobileSidebar({ hasChats, hasChatSelected }: { hasChats: boolean; hasChatSelected: boolean }) {
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

// Full-height rail for resizing sidebar
function FullHeightRail() {
  const { toggleSidebar, state } = useSidebar()

  return (
    <button
      type='button'
      aria-label='Toggle sidebar'
      tabIndex={-1}
      onClick={toggleSidebar}
      title='Toggle sidebar'
      className={cn(
        'absolute inset-y-0 -right-2 z-20 hidden w-4 sm:block',
        'after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] after:-translate-x-1/2',
        'after:bg-sidebar-border hover:after:bg-sidebar-foreground/30',
        state === 'collapsed' ? 'cursor-e-resize' : 'cursor-w-resize'
      )}
    />
  )
}

// Custom sidebar with footer for websocket status
function ChatSidebar({ data }: { data: SidebarData }) {
  const { collapsible, variant } = useLayout()
  const { websocketStatusMeta, chatId } = useSidebarContext()
  const { state } = useSidebar()
  const isCollapsed = state === 'collapsed'

  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      <SidebarContent>
        {data.navGroups.map((props) => (
          <NavGroup key={props.title} {...props} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        {chatId && (
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
        )}
      </SidebarFooter>
    </Sidebar>
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
      const chat = chats.find((c) => c.id === urlChatId || c.fingerprint === urlChatId)
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
          title: '',
          items: chatItems,
        },
        {
          title: '',
          separator: true,
          items: [
            { title: 'New chat', onClick: openNewChatDialog, icon: Plus },
          ],
        },
      ],
    }
  }, [chats, openNewChatDialog])

  const defaultOpen = getCookie('sidebar_state') !== 'false'

  return (
    <SearchProvider>
      <LayoutProvider>
        <UISidebarProvider defaultOpen={defaultOpen}>
          <AutoOpenMobileSidebar hasChats={chats.length > 0} hasChatSelected={!!urlChatId} />

          <div className='flex h-svh w-full flex-col md:flex-row'>
            {/* Mobile header bar */}
            <MobileHeader />

            {/* Left column: TopBar + Sidebar (desktop only) */}
            <div
              className={cn(
                'relative hidden h-full flex-shrink-0 flex-col overflow-visible md:flex',
                'w-(--sidebar-width) has-data-[state=collapsed]:w-(--sidebar-width-icon)',
                'transition-[width] duration-200 ease-linear'
              )}
            >
              <TopBar />
              <ChatSidebar data={sidebarData} />
              <FullHeightRail />
            </div>

            {/* Content area */}
            <SidebarInset className={cn('@container/content', 'overflow-auto flex-1')}>
              <Outlet />
            </SidebarInset>
          </div>
        </UISidebarProvider>
      </LayoutProvider>
    </SearchProvider>
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
