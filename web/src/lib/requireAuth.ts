import Cookies from 'js-cookie'
import type { ParsedLocation } from '@tanstack/react-router'

/**
 * Require authentication before accessing a route
 *
 * This function checks for the login cookie and redirects to the sign-in page
 * if the user is not authenticated. Used in route guards (beforeLoad hooks).
 *
 * @param location - The current location object from TanStack Router
 * @throws Error if redirecting to sign-in (to prevent route from loading)
 */
export function requireAuth(location: ParsedLocation) {
  const login = Cookies.get('login')

  if (!login) {
    const redirectUrl = encodeURIComponent(location.href)
    window.location.href = `/core/sign-in?redirect=${redirectUrl}`
    throw new Error('Redirecting to sign-in')
  }
}

