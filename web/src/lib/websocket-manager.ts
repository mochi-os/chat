// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

export * from '@mochi/web/realtime-websocket-manager'

// The user's own websocket key, which chat.star's USER_KEY names: what
// changes outside any one chat, such as a Matrix verification.
export const USER_KEY = 'chat'
