// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { safeHref } from '@mochi/web/lib/text-format'
import type { Editor } from '@tiptap/core'

/** What the dialog edits: a range of the editor, and its text and link. */
export interface LinkTarget {
  from: number
  to: number
  text: string
  href: string
  /** The range is already a link, so the dialog edits it. */
  existing: boolean
}

/**
 * The link under the caret, or the selection to turn into one. Read before
 * the dialog opens, as the dialog takes the focus and the editor keeps no
 * visible selection while it is open.
 */
export function linkTarget(editor: Editor): LinkTarget {
  if (editor.isActive('link')) {
    editor.chain().extendMarkRange('link').run()
  }
  const { from, to } = editor.state.selection
  const href = editor.getAttributes('link').href
  return {
    from,
    to,
    text: editor.state.doc.textBetween(from, to, ' '),
    href: typeof href === 'string' ? href : '',
    existing: typeof href === 'string',
  }
}

/** A typed address as a link: a bare domain gets https. */
export function normaliseUrl(value: string): string | null {
  const url = value.trim()
  if (!url) return null
  if (/^[a-z][a-z\d+.-]*:/i.test(url)) return safeHref(url)
  // Only http, https and mailto links work in a message, so anything with
  // another scheme (javascript: among them) cannot be saved.
  return safeHref(`https://${url}`)
}
