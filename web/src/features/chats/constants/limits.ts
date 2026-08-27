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

/** action_send: caption entries. Its per-caption 200-character cap is not
 *  mirrored: captions are generated (`voice:`/`audio:`), never typed. */
export const CAPTIONS_MAX = 100


/** messages/delete and messages/forward: `len(message_ids) > 100`. */
export const BULK_MESSAGES_MAX = 100

/**
 * action_create stops probing non-friends at _PROBES_MAXIMUM (100), but it also
 * gives the whole probe run _PROBES_BUDGET seconds - so a first batch of 100
 * slow strangers fails the entire create with errors.too_many_to_check rather
 * than the friendly refusal this bound is meant to produce. Held to what the
 * time budget can actually clear.
 */
export const CREATE_NON_FRIENDS_MAX = 25
