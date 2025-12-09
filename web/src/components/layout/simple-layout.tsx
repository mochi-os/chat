import { Outlet } from '@tanstack/react-router'
import { SearchProvider } from '@/context/search-provider'

type SimpleLayoutProps = {
  children?: React.ReactNode
}

export function SimpleLayout({ children }: SimpleLayoutProps) {
  return (
    <SearchProvider>
      <div className="flex h-svh flex-col">
        {children ?? <Outlet />}
      </div>
    </SearchProvider>
  )
}
