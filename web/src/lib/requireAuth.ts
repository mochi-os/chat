import type { ParsedLocation } from '@tanstack/react-router'
import { getCookie } from '@mochi/common'

export function requireAuth(location: ParsedLocation) {
  const token = getCookie('token')

  if (!token) {
    const redirectUrl = encodeURIComponent(location.href)
    window.location.href = `${import.meta.env.VITE_AUTH_LOGIN_URL}?redirect=${redirectUrl}`
    throw new Error('Redirecting to login')
  }
}
