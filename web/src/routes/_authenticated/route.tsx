// feat(auth): implement login-header based auth flow
import { createFileRoute } from '@tanstack/react-router'
import { APP_ROUTES } from '@/config/routes'
import { useAuthStore } from '@/stores/auth-store'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'

/**
 * Protected Route Guard
 *
 * This guard runs before any /_authenticated/* route loads.
 * It checks for authentication and redirects to login if not authenticated.
 *
 * Authentication Strategy:
 * 1. Check store for credentials (rawLogin or accessToken)
 * 2. Sync from cookies if needed (handles page refresh)
 * 3. Redirect to core auth app if no credentials found (cross-app navigation)
 *
 * Note: Cross-app navigation uses window.location.href for full page reload
 */
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ location }) => {
    // Get auth state from store
    const store = useAuthStore.getState()

    // Sync from cookies if not initialized (handles page refresh)
    if (!store.isInitialized) {
      store.syncFromCookie()
    }

    // Check if authenticated (has login OR token)
    const isAuthenticated = store.isAuthenticated

    // If not authenticated, redirect to core auth app (cross-app navigation)
    if (!isAuthenticated) {
      // Build redirect URL with return path
      const authUrl = import.meta.env.VITE_AUTH_URL || APP_ROUTES.CORE.SIGN_IN
      const returnUrl = encodeURIComponent(location.href)
      const redirectUrl = `${authUrl}?redirect=${returnUrl}`

      // Use window.location.href for cross-app navigation (full page reload)
      window.location.href = redirectUrl

      // Return early to prevent route from loading
      return
    }

    // Authenticated, allow navigation
    return
  },
  component: AuthenticatedLayout,
})
