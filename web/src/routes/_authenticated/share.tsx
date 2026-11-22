// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { createFileRoute } from '@tanstack/react-router'
import { SharePage } from '@/features/chats/share-page'

// Another app's "Send in a chat": /chat/share?text=&url=, which chatSharePath
// builds.
export const Route = createFileRoute('/_authenticated/share')({
  component: SharePage,
})
