import { useEffect } from 'react'
import { useAuth } from './useAuth'
import { APP_ROUTES } from '@/config/routes'

/**
 * Hook to enforce authentication in components
 * Redirects to core auth app if user is not authenticated
 * 
 * Usage:
 * ```tsx
 * function ProtectedComponent() {
 *   const { isLoading } = useRequireAuth()
 *   
 *   if (isLoading) return <Loading />
 *   
 *   // User is guaranteed to be authenticated here
 *   return <div>Protected content</div>
 * }
 * ```
 * 
 * Note: This hook uses cross-app navigation (window.location.href)
 * to redirect to the core auth app. The route guard handles
 * most auth checks, but this can be used in components.
 */
export function useRequireAuth() {
  const { isAuthenticated, isInitialized, isLoading } = useAuth()

  useEffect(() => {
    // Only redirect once initialization is complete
    if (isInitialized && !isAuthenticated && !isLoading) {
      // Save current location for redirect after login
      const currentPath = window.location.pathname + window.location.search
      const authUrl = import.meta.env.VITE_AUTH_URL || APP_ROUTES.CORE.SIGN_IN
      const redirectUrl = `${authUrl}?redirect=${encodeURIComponent(currentPath)}`
      
      // Use window.location.href for cross-app navigation (full page reload)
      window.location.href = redirectUrl
    }
  }, [isAuthenticated, isInitialized, isLoading])

  return {
    isLoading: !isInitialized || isLoading,
    isAuthenticated,
  }
}

