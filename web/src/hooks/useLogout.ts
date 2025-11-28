import { useCallback } from 'react'
import Cookies from 'js-cookie'
import { toast } from 'sonner'
import { useAuth } from './useAuth'
import { requestHelpers } from '@/lib/request'
import endpoints from '@/api/endpoints'
import { env } from '@mochi/config/env'
export function useLogout() {
  const { logout: clearAuth, setLoading, isLoading } = useAuth()

  const logout = useCallback(async () => {
    try {
      setLoading(true)

      // Call backend logout API to delete login from database
      try {
        await requestHelpers.get(endpoints.auth.logout)
      } catch (error) {
        // Log error but continue with local cleanup
        if (env.debug) {
          console.error('[Logout] Backend logout failed:', error)
        }
      }

      // Remove both cookies
      Cookies.remove('login', { path: '/' })
      Cookies.remove('user_email', { path: '/' })

      // Clear auth store
      clearAuth()

      // Show success message
      toast.success('Logged out successfully')

      // Redirect to core auth app (cross-app navigation)
      window.location.href = env.authLoginUrl
    } catch (_error) {
      // Even if backend call fails, clear local auth
      Cookies.remove('login', { path: '/' })
      Cookies.remove('user_email', { path: '/' })
      clearAuth()

      toast.error('Logged out (with errors)')

      // Redirect to core auth app (cross-app navigation)
      window.location.href = env.authLoginUrl
    } finally {
      setLoading(false)
    }
  }, [clearAuth, setLoading])

  return {
    logout,
    isLoggingOut: isLoading,
  }
}
