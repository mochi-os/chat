// Shell storage utilities for chat app - stores last visited chat

import { shellStorage } from '@mochi/common'

const STORAGE_KEY = 'mochi-chat-last'

// Store last visited chat
export function setLastChat(chatId: string): void {
  shellStorage.setItem(STORAGE_KEY, chatId)
}

// Get last visited chat
export async function getLastChat(): Promise<string | null> {
  return shellStorage.getItem(STORAGE_KEY)
}

// Clear last chat (e.g., when chat is deleted)
export function clearLastChat(): void {
  shellStorage.removeItem(STORAGE_KEY)
}
