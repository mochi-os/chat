// Shell storage utilities for chat app - stores last visited chat and per-chat drafts

import { shellStorage } from '@mochi/web'

const STORAGE_KEY = 'mochi-chat-last'
const DRAFT_KEY = (chatId: string) => `mochi-chat-draft-${chatId}`

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

export function setDraft(chatId: string, text: string): void {
  shellStorage.setItem(DRAFT_KEY(chatId), text)
}

export async function getDraft(chatId: string): Promise<string | null> {
  return shellStorage.getItem(DRAFT_KEY(chatId))
}

export function clearDraft(chatId: string): void {
  shellStorage.removeItem(DRAFT_KEY(chatId))
}

const READ_KEY = 'mochi-chat-read'

export async function getReadTimestamps(): Promise<Record<string, number>> {
  const raw = await shellStorage.getItem(READ_KEY)
  if (!raw) return {}
  try { return JSON.parse(raw) as Record<string, number> } catch { return {} }
}

export function saveReadTimestamps(data: Record<string, number>): void {
  shellStorage.setItem(READ_KEY, JSON.stringify(data))
}
