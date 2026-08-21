// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

// Mirrors of the server's limits, kept in one place so the client refuses what
// the server would refuse - and refuses it before an upload, not after. Each
// one is enforced in chat.star; changing a number here alone changes nothing.

/** action_send / action_message_edit: `len(body) > 10000`. */
export const MESSAGE_MAX_LENGTH = 10000

/** mochi.text.valid(name, "name") is ^[^<>\r\n]{1,1000}$ - hence both rules. */
export const CHAT_NAME_MAX_LENGTH = 1000
export const CHAT_NAME_FORBIDDEN = /[<>\r\n]/

/** action_send: the mentions array may not exceed this. */
export const MENTIONS_MAX = 50

/** action_send: caption entries, and the length of each one. */
export const CAPTIONS_MAX = 100
export const CAPTION_MAX_LENGTH = 200

/** messages/delete and messages/forward: `len(message_ids) > 100`. */
export const BULK_MESSAGES_MAX = 100

/**
 * action_create stops probing non-friends at _PROBES_MAXIMUM; larger groups go
 * in as a create plus member/add batches. Friends are not counted.
 */
export const CREATE_NON_FRIENDS_MAX = 100
