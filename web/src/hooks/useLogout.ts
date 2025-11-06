import { useCallback } from 'react'
import { useAuth } from './useAuth'
import { toast } from 'sonner'
import { APP_ROUTES } from '@/config/routes'

/**
 * Hook to handle logout functionality
 * 
 * Usage:
 * ```tsx
 * function LogoutButton() {
 *   const { logout, isLoggingOut } = useLogout()
 *   
 *   return (
 *     <button onClick={logout} disabled={isLoggingOut}>
 *       {isLoggingOut ? 'Logging out...' : 'Logout'}
 *     </button>
 *   )
 * }
 * ```
 */
export function useLogout() {
  const { logout: clearAuth, setLoading, isLoading } = useAuth()

  const logout = useCallback(async () => {
    try {
      setLoading(true)

      // Optional: Call backend logout endpoint
      // This would invalidate the token on the server
      // await authApi.logout()

      // Clear all auth state (cookie + store)
      clearAuth()

      // Show success message
      toast.success('Logged out successfully')

      // Redirect to core auth app (cross-app navigation)
      window.location.href = import.meta.env.VITE_AUTH_URL || APP_ROUTES.CORE.SIGN_IN
    } catch (error) {
      // Even if backend call fails, clear local auth
      clearAuth()
      
      toast.error('Logged out (with errors)')
      
      // Redirect to core auth app (cross-app navigation)
      window.location.href = import.meta.env.VITE_AUTH_URL || APP_ROUTES.CORE.SIGN_IN
    } finally {
      setLoading(false)
    }
  }, [clearAuth, setLoading])

  return {
    logout,
    isLoggingOut: isLoading,
  }
}

