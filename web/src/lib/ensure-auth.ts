// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useAuthStore } from '@mochi/web'

/**
 * A route's beforeLoad: the signed-in user is known before the page draws.
 * Shared by the app's layout and the thread page, which opens in a window of
 * its own without that layout.
 */
export async function ensureAuth() {
  const store = useAuthStore.getState()
  if (!store.isInitialized) {
    await store.initialize()
  }
}
