// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
// The addresses a chat page embeds, built from ids its members' servers sent:
// each id stands as one path segment, or there is no address at all, so a
// crafted id cannot aim the page's request at another action.
import { getAppPath, path, tryPath } from '@mochi/web'

/** An attachment of a chat, or its preview. */
export const attachmentAddress = (
  chat: string,
  id: string,
  variant?: 'preview'
): string | undefined =>
  tryPath(
    () =>
      `${getAppPath()}/${
        variant
          ? path`${chat}/-/attachments/${id}/${variant}`
          : path`${chat}/-/attachments/${id}`
      }`
  )

/** A message's sender picture, served through the message. */
export const messageAsset = (message: {
  chat: string
  id: string
}): string | undefined =>
  tryPath(
    () => `${getAppPath()}/${path`${message.chat}/-/${message.id}/asset`}`
  )

/** A person's avatar or style, served through this app. */
export const personAsset = (
  person: string,
  asset: string
): string | undefined =>
  tryPath(() => `${getAppPath()}/${path`-/person/${person}/asset/${asset}`}`)
