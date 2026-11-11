// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { isImage, isVideo } from '@mochi/web'

/**
 * Fixed column for voice / audio / document bubbles. Must be a rem width: under
 * w-fit parents a percentage resolves to content size, so short filenames stay
 * narrow.
 */
export const CHAT_MEDIA_BUBBLE_CLASS =
  'box-border w-[17.5rem] max-w-[calc(100vw-4.5rem)] shrink-0'

/**
 * Column for image / video bubbles, capped by the bubble. Also a rem width: a
 * photo cannot size its own bubble, as Firefox gives an image sized in
 * percentages no width there, so a photo with no text was an empty circle.
 */
export const CHAT_MEDIA_GRID_BUBBLE_CLASS = 'w-[20rem] max-w-full min-w-0'

type MediaWidthAttachment = {
  type?: string
  content_type?: string
  caption?: string
}

/** True when any attachment shows in the image / video grid. */
export function attachmentsHaveVisualMedia(
  attachments: MediaWidthAttachment[] | undefined
): boolean {
  return Boolean(
    attachments?.some((att) => {
      if (
        att.caption?.startsWith('voice:') ||
        att.caption?.startsWith('audio:')
      ) {
        return false
      }
      const type = att.type || att.content_type || ''
      return isImage(type) || isVideo(type)
    })
  )
}

/** True when bubble should use the shared fixed media width (not image/video grids). */
export function attachmentsNeedFixedMediaWidth(
  attachments: MediaWidthAttachment[] | undefined
): boolean {
  if (!attachments?.length) return false
  if (attachmentsHaveVisualMedia(attachments)) return false

  return attachments.some((att) => {
    if (
      att.caption?.startsWith('voice:') ||
      att.caption?.startsWith('audio:')
    ) {
      return true
    }
    const type = att.type || att.content_type || ''
    return !isImage(type) && !isVideo(type)
  })
}
