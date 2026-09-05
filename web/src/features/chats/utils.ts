// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

type AttachmentKind = 'image' | 'video' | 'file'

export interface PendingAttachment {
  id: string
  file: File
  kind: AttachmentKind
  previewUrl?: string
  duration?: number
  /** Mic voice note vs paperclip Audio. Undefined = document/media file card. */
  playable?: 'voice' | 'audio'
}

const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'bmp',
  'svg',
  'webp',
  'heic',
  'avif',
])
const VIDEO_EXTENSIONS = new Set([
  'mp4',
  'mov',
  'mkv',
  'avi',
  'webm',
  'm4v',
  'mpeg',
  'mpg',
])

const getFileExtension = (value?: string) => {
  if (!value) return undefined
  const withoutQuery = value.split('?')[0]
  const parts = withoutQuery.split('.')
  if (parts.length < 2) return undefined
  return parts.pop()?.toLowerCase()
}

const detectAttachmentKind = (
  mime?: string,
  fallbackName?: string
): AttachmentKind => {
  const normalizedMime = mime?.toLowerCase() ?? ''
  if (normalizedMime.startsWith('image/')) {
    return 'image'
  }
  // Classify audio before extension fallback — voice notes are often .webm /
  // .ogg which VIDEO_EXTENSIONS would otherwise treat as video.
  if (normalizedMime.startsWith('audio/')) {
    return 'file'
  }
  if (normalizedMime.startsWith('video/')) {
    return 'video'
  }
  const extension = getFileExtension(fallbackName)
  if (extension) {
    if (IMAGE_EXTENSIONS.has(extension)) {
      return 'image'
    }
    if (VIDEO_EXTENSIONS.has(extension)) {
      return 'video'
    }
  }
  return 'file'
}

export const createPendingAttachment = (file: File): PendingAttachment => {
  const kind = detectAttachmentKind(file.type, file.name)
  return {
    id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    kind,
    previewUrl: kind === 'file' ? undefined : URL.createObjectURL(file),
  }
}

/** Create a pending voice-note attachment with object-URL preview for playback. */
export const createPendingVoiceNote = (
  file: File,
  durationSecs: number
): PendingAttachment => {
  return {
    id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    kind: 'file',
    previewUrl: URL.createObjectURL(file),
    duration: durationSecs,
    playable: 'voice',
  }
}

/** Paperclip → Audio: playable file (not a document card). */
export const createPendingAudioAttachment = (
  file: File,
  durationSecs = 0
): PendingAttachment => {
  return {
    id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    kind: 'file',
    previewUrl: URL.createObjectURL(file),
    duration: durationSecs,
    playable: 'audio',
  }
}

/**
 * Audio duration in seconds via metadata preload; 0 when the browser cannot
 * determine it (the player corrects itself on loadedmetadata).
 */
export const probeAudioDuration = (url: string): Promise<number> =>
  new Promise((resolve) => {
    if (typeof Audio === 'undefined' || !url) {
      resolve(0)
      return
    }
    const audio = new Audio()
    let settled = false
    const done = (secs: number) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      audio.removeAttribute('src')
      resolve(secs)
    }
    const timer = setTimeout(() => done(0), 5000)
    audio.addEventListener(
      'loadedmetadata',
      () => {
        done(
          Number.isFinite(audio.duration) && audio.duration > 0
            ? audio.duration
            : 0
        )
      },
      { once: true }
    )
    audio.addEventListener('error', () => done(0), { once: true })
    audio.preload = 'metadata'
    audio.src = url
  })

export const revokePendingAttachmentPreview = (
  attachment: PendingAttachment
) => {
  if (attachment.previewUrl) {
    URL.revokeObjectURL(attachment.previewUrl)
  }
}

/**
 * Accent- and case-insensitive substring match ("cafe" finds "Café");
 * naturalCompare orders but cannot answer "contains".
 */
export function nameMatches(name: string, query: string): boolean {
  if (!query) return true
  return fold(name).includes(fold(query))
}

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
}

/**
 * Why a message cannot be sent as it stands, or null when it can. One rule
 * for the send button and the composer's Enter and submit paths: the length
 * check lived only on the button, so Enter sent a body the server then refused
 * after the attachments had already gone up.
 */
export type SendRefusal = 'empty' | 'length'

export function sendRefusal(
  text: string,
  attachments: number,
  maximum: number
): SendRefusal | null {
  if (text.length > maximum) return 'length'
  if (!text.trim() && attachments === 0) return 'empty'
  return null
}

/**
 * What the chat page renders for the URL it was given. A chat id the list has
 * settled on and does not hold is "notfound", not the picker, and never while
 * the list is still (re)fetching: the new-chat dialog navigates to a freshly
 * created id before the invalidated list has landed.
 */
export type ChatView = 'skeleton' | 'notfound' | 'picker' | 'chat'

export function resolveChatView(input: {
  selectedChatId: string | undefined
  found: boolean
  loading: boolean
  fetching: boolean
  failed: boolean
}): ChatView {
  if (!input.selectedChatId) return 'picker'
  if (input.found) return 'chat'
  if (input.loading || input.fetching) return 'skeleton'
  if (input.failed) return 'picker'
  return 'notfound'
}

/** A count badge capped at 99, every digit in the reader's locale. */
export function formatCountBadge(
  count: number,
  formatNumber: (value: number) => string
): string {
  return count > 99 ? `${formatNumber(99)}+` : formatNumber(count)
}
