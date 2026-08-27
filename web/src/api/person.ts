// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { getAppPath } from '@mochi/web'

// A person's avatar and style, served by THIS app rather than fetched from
// /people directly: a cross-app image request runs with Origin: null and no
// cookies inside the shell's sandboxed iframe, so the people route resolves its
// owner to the first administrator and the admin's account pays for every
// avatar every chat user renders. See action_person_asset.
export function personAssetUrl(person: string, asset: 'avatar' | 'style') {
  return `${getAppPath()}/-/person/${encodeURIComponent(person)}/asset/${asset}`
}
