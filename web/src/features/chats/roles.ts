// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { i18n } from '@lingui/core'
import { msg } from '@lingui/core/macro'

/**
 * A member's role in a room on another network, in the user's words; none for
 * anyone without one.
 */
export function roleLabel(role?: string): string | undefined {
  switch (role) {
    case 'owner':
      return i18n._(msg`Owner`)
    case 'admin':
      return i18n._(msg`Administrator`)
    case 'moderator':
      return i18n._(msg`Moderator`)
    case 'visitor':
      return i18n._(msg`Visitor`)
  }
  return undefined
}
