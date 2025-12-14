import { Outlet } from '@tanstack/react-router'
import { getCookie, cn, LayoutProvider, SearchProvider, SidebarInset, SidebarProvider, TopBar } from '@mochi/common'
import { AppSidebar } from '@/components/layout/app-sidebar'

type AuthenticatedLayoutProps = {
  children?: React.ReactNode
}

export function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  const defaultOpen = getCookie('sidebar_state') !== 'false'

  return (
    <SearchProvider>
      <LayoutProvider>
        <div className="flex h-svh flex-col">
          <TopBar title="Chat" />
          <SidebarProvider defaultOpen={defaultOpen} className="flex-1 overflow-hidden">
            <AppSidebar />
            <SidebarInset
              className={cn(
                // Set content container, so we can use container queries
                '@container/content',
                // Allow scrolling in content area
                'overflow-auto'
              )}
            >
              {children ?? <Outlet />}
            </SidebarInset>
          </SidebarProvider>
        </div>
      </LayoutProvider>
    </SearchProvider>
  )
}
