// localStorage utilities for chat app - stores last visited chat per browser

const STORAGE_KEY = 'mochi-chat-last'
const SESSION_KEY = 'mochi-chat-session-started'

// Store last visited chat
export function setLastChat(chatId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, chatId)
  } catch {
    // Silently fail - localStorage may be unavailable
  }
}

// Get last visited chat
export function getLastChat(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

// Clear last chat (e.g., when chat is deleted)
export function clearLastChat(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Silently fail
  }
}

// Check if this is the first navigation to the index this session
// Used to only auto-redirect on initial app entry, not subsequent navigations
export function shouldRedirectToLastChat(): boolean {
  try {
    // If session already started, don't redirect
    if (sessionStorage.getItem(SESSION_KEY)) {
      return false
    }
    // Mark session as started
    sessionStorage.setItem(SESSION_KEY, '1')
    return true
  } catch {
    return false
  }
}
