// Shell storage utilities for chat app - stores last visited chat and per-chat drafts

import { shellStorage } from '@mochi/web'

const STORAGE_KEY = 'mochi-chat-last'
const DRAFT_KEY = (chatId: string) => `mochi-chat-draft-${chatId}`
const LEGACY_READ_KEY = 'mochi-chat-read'
const READ_MIGRATED_KEY = 'mochi-chat-read-migrated'
const MARKED_UNREAD_KEY = 'mochi-chat-marked-unread'

export async function getMarkedUnreadChats(): Promise<Set<string>> {
  const raw = await shellStorage.getItem(MARKED_UNREAD_KEY)
  if (!raw) return new Set()
  try {
    const ids = JSON.parse(raw) as string[]
    return new Set(ids)
  } catch {
    return new Set()
  }
}

export function setMarkedUnreadChats(chatIds: Iterable<string>): void {
  shellStorage.setItem(MARKED_UNREAD_KEY, JSON.stringify([...chatIds]))
}

export function addMarkedUnreadChat(chatId: string): void {
  void getMarkedUnreadChats().then((ids) => {
    ids.add(chatId)
    setMarkedUnreadChats(ids)
  })
}

export function removeMarkedUnreadChat(chatId: string): void {
  void getMarkedUnreadChats().then((ids) => {
    ids.delete(chatId)
    setMarkedUnreadChats(ids)
  })
}

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

export async function isReadTimestampsMigrated(): Promise<boolean> {
  const flag = await shellStorage.getItem(READ_MIGRATED_KEY)
  return flag === '1'
}

export async function getLegacyReadTimestamps(): Promise<Record<string, number>> {
  const raw = await shellStorage.getItem(LEGACY_READ_KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, number>
  } catch {
    return {}
  }
}

export function markReadTimestampsMigrated(): void {
  shellStorage.removeItem(LEGACY_READ_KEY)
  shellStorage.setItem(READ_MIGRATED_KEY, '1')
}
