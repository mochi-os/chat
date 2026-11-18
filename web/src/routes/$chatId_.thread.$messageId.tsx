// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { createFileRoute } from '@tanstack/react-router'
import { ensureAuth } from '@/lib/ensure-auth'
import { ThreadPage } from '@/features/chats/thread-page'

// A thread in a window of its own: outside the app's layout, so it shows the
// thread and nothing else, as Slack's does.
export const Route = createFileRoute('/$chatId_/thread/$messageId')({
  beforeLoad: ensureAuth,
  component: function ThreadRoute() {
    const { chatId, messageId } = Route.useParams()
    return <ThreadPage chatId={chatId} messageId={messageId} />
  },
})
