// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

/** Ensures only one voice-note `<audio>` plays at a time across the chat UI. */
let activeAudio: HTMLAudioElement | null = null

/**
 * Claim exclusive playback. Pauses any previously active element that is not
 * `el`. Call before starting playback.
 */
export function claimActiveAudio(el: HTMLAudioElement): void {
  if (activeAudio && activeAudio !== el) {
    try {
      activeAudio.pause()
    } catch {
      /* ignore */
    }
  }
  activeAudio = el
}

/** Release claim when this element unmounts or stops being the active player. */
export function releaseActiveAudio(el: HTMLAudioElement): void {
  if (activeAudio === el) {
    activeAudio = null
  }
}
