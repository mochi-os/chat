// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { Trans } from '@lingui/react/macro'

/** What an encrypted message that cannot be read says in its place: why it
 * cannot be, where that is known (ChatMessage.encrypted). */
export function SealedText({ encrypted }: { encrypted?: number }) {
  switch (encrypted) {
    case 3:
      return <Trans>Encrypted for other devices only</Trans>
    case 4:
      return <Trans>The sender's encryption key changed</Trans>
    case 5:
      return <Trans>Sent from a device you distrusted</Trans>
    default:
      return <Trans>Encrypted message</Trans>
  }
}
