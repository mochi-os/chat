// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

// How near the end a conversation may be scrolled and still count as at the
// bottom, so a new message keeps it there. Shared by the timeline and the
// thread panel, which follow new messages the same way.
const BOTTOM_THRESHOLD_PX = 80

export function checkIsAtBottom(el: HTMLElement) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD_PX
}

export function pinToBottom(el: HTMLElement) {
  el.scrollTop = el.scrollHeight - el.clientHeight
}
