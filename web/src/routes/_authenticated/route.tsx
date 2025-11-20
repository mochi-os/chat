// feat(auth): implement login-header based auth flow
import { createFileRoute } from '@tanstack/react-router'
import { APP_ROUTES } from '@/config/routes'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'
import { apiClient, isAuthError } from '@/lib/apiClient'

/**
 * Protected Route Guard
 *
 * This guard runs before any /_authenticated/* route loads.
 * It verifies authentication via API call since cookies are HttpOnly.
 *
 * Authentication Strategy:
 * 1. Make API call to verify authentication (browser sends HttpOnly cookies automatically)
 * 2. Redirect to login if authentication fails (401)
 * 3. Allow route to load if authenticated
 *
 * Note: Cookies are HttpOnly (not readable by JavaScript), but browser sends them automatically
 */
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    // Verify authentication via API call
    // HttpOnly cookies are sent automatically by the browser
    try {
      await apiClient.get('/chat/list')
      // API call succeeded - user is authenticated
      return
    } catch (error) {
      // API call failed - check if it's an auth error
      if (isAuthError(error)) {
        // Not authenticated - redirect to login
        const authUrl = import.meta.env.VITE_AUTH_URL || APP_ROUTES.CORE.SIGN_IN
        const returnUrl = encodeURIComponent(location.href)
        const redirectUrl = `${authUrl}?redirect=${returnUrl}`

        // Use window.location.href for cross-app navigation (full page reload)
        window.location.href = redirectUrl

        // Prevent route from loading
        throw new Error('Unauthorized')
      }

      // Other error (network, server, etc.) - allow route to load
      // Components can handle these errors
      return
    }
  },
  component: AuthenticatedLayout,
})