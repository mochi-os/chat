import Cookies from 'js-cookie'

export function getCookie(name: string): string | undefined {
  return Cookies.get(name)
}

/**
 * Set a cookie with name, value, and optional max age
 * 
 * @param name - Cookie name
 * @param value - Cookie value
 * @param maxAge - Max age in seconds (default: 7 days)
 * @param path - Cookie path (default: '/')
 */
export function setCookie(
  name: string,
  value: string,
  maxAge: number = 60 * 60 * 24 * 7, // 7 days
  path: string = '/'
): void {
  // Convert maxAge from seconds to days for js-cookie
  const expires = maxAge / (60 * 60 * 24)
  Cookies.set(name, value, { expires, path })
}

export function removeCookie(name: string, path: string = '/'): void {
  Cookies.remove(name, { path })
}
