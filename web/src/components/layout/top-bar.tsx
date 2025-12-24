import { useEffect } from 'react'
import { CircleUser, LogOut } from 'lucide-react'
import {
  cn,
  useAuthStore,
  readProfileCookie,
  useTheme,
  useDialogState,
  useNotifications,
  useSidebar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  SignOutDialog,
  NotificationsDropdown,
} from '@mochi/common'

// Separate component to isolate the useNotifications hook
function TopBarNotifications({ buttonClassName }: { buttonClassName?: string }) {
  const { notifications, markAsRead, markAllAsRead } = useNotifications()

  return (
    <NotificationsDropdown
      notifications={notifications}
      notificationsUrl="/notifications/"
      onNotificationClick={(n) => markAsRead(n.id)}
      onMarkAllAsRead={markAllAsRead}
      buttonClassName={buttonClassName}
    />
  )
}

export function TopBar() {
  const [open, setOpen] = useDialogState()
  const { theme } = useTheme()
  const { state } = useSidebar()
  const isCollapsed = state === 'collapsed'

  const email = useAuthStore((state) => state.email)
  const profile = readProfileCookie()
  const displayName = profile.name || 'User'
  const displayEmail = email || 'user@example.com'

  useEffect(() => {
    const themeColor = theme === 'dark' ? '#020817' : '#fff'
    const metaThemeColor = document.querySelector("meta[name='theme-color']")
    if (metaThemeColor) metaThemeColor.setAttribute('content', themeColor)
  }, [theme])

  const iconButtonClass = isCollapsed ? 'size-8' : 'size-9'

  return (
    <>
      <header
        className={cn(
          'z-50 flex items-center mt-2',
          isCollapsed
            ? 'h-auto flex-col gap-1 px-2 py-2'
            : 'h-12 flex-row gap-1 px-2'
        )}
      >
        {/* Logo */}
        <a
          href="/"
          className={cn(
            'flex items-center justify-center rounded-md',
            isCollapsed ? 'size-8' : 'size-9'
          )}
        >
          <img
            src="./images/logo-header.svg"
            alt="Mochi"
            className="h-6 w-6"
          />
        </a>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className={iconButtonClass}>
              <CircleUser className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-56" align="start">
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="grid px-2 py-1.5 text-start text-sm leading-tight">
                <span className="font-semibold">{displayName}</span>
                <span className="text-xs text-muted-foreground">
                  {displayEmail}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setOpen(true)}>
              <LogOut className="size-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notifications */}
        <TopBarNotifications buttonClassName={iconButtonClass} />
      </header>

      <SignOutDialog open={!!open} onOpenChange={setOpen} />
    </>
  )
}
