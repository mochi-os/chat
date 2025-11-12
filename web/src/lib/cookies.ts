import Cookies from 'js-cookie'

export function getCookie(name: string): string | undefined {
  return Cookies.get(name)
}

export function removeCookie(name: string, path: string = '/'): void {
  Cookies.remove(name, { path })
}
