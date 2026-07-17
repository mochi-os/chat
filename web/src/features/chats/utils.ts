// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

export type AttachmentKind = 'image' | 'video' | 'file'

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

export const getFileExtension = (value?: string) => {
  if (!value) return undefined
  const withoutQuery = value.split('?')[0]
  const parts = withoutQuery.split('.')
  if (parts.length < 2) return undefined
  return parts.pop()?.toLowerCase()
}

export const detectAttachmentKind = (
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
 * Read the duration (seconds) of an audio object URL via metadata preload.
 * Resolves 0 when the browser cannot determine it (caption falls back to
 * "audio:0" and the player corrects itself on loadedmetadata).
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
