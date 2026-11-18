// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useState, type FormEvent } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  Button,
  Input,
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@mochi/web'
import { Label } from '@mochi/web/components/ui/label'
import type { Editor } from '@tiptap/core'
import { normaliseUrl, type LinkTarget } from '../editor/link'

interface LinkDialogProps {
  editor: Editor
  target: LinkTarget | null
  onClose: () => void
}

/** Slack's link dialog: the text shown, and where it goes. */
export function LinkDialog({ editor, target, onClose }: LinkDialogProps) {
  return (
    <ResponsiveDialog
      open={target !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <ResponsiveDialogContent
        className='sm:max-w-md'
        // Back to the editor, at the link.
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          // Not when the editor went first, say the box unmounting with it.
          if (!editor.isDestroyed) editor.commands.focus()
        }}
      >
        {target ? (
          // Keyed so each opening starts from the target's own values.
          <LinkForm
            key={`${target.from}-${target.to}`}
            editor={editor}
            target={target}
            onClose={onClose}
          />
        ) : null}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}

function LinkForm({
  editor,
  target,
  onClose,
}: {
  editor: Editor
  target: LinkTarget
  onClose: () => void
}) {
  const { t } = useLingui()
  const [text, setText] = useState(target.text)
  const [href, setHref] = useState(target.href)
  const url = normaliseUrl(href)

  const save = (event: FormEvent) => {
    event.preventDefault()
    // The dialog is portalled, but React still bubbles the submit to the
    // composer's own form, which would send the message.
    event.stopPropagation()
    if (!url) return
    const label = text.trim() || url
    const range = { from: target.from, to: target.to }
    const chain = editor.chain().focus()
    if (label === target.text && target.from !== target.to) {
      // Text unchanged: link the range itself, keeping any formatting in it.
      chain.setTextSelection(range).setLink({ href: url })
    } else {
      chain.insertContentAt(range, {
        type: 'text',
        text: label,
        marks: [{ type: 'link', attrs: { href: url } }],
      })
    }
    chain.run()
    onClose()
  }

  const remove = () => {
    editor
      .chain()
      .focus()
      .setTextSelection({ from: target.from, to: target.to })
      .unsetLink()
      .run()
    onClose()
  }

  return (
    <form onSubmit={save} className='space-y-4'>
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle>
          {target.existing ? t`Edit link` : t`Add link`}
        </ResponsiveDialogTitle>
      </ResponsiveDialogHeader>
      <div className='space-y-2'>
        <Label htmlFor='link-text'>
          <Trans>Text</Trans>
        </Label>
        <Input
          id='link-text'
          autoFocus={!target.text}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='link-href'>
          <Trans>Link</Trans>
        </Label>
        <Input
          id='link-href'
          autoFocus={Boolean(target.text)}
          inputMode='url'
          autoComplete='off'
          autoCapitalize='off'
          spellCheck={false}
          value={href}
          onChange={(event) => setHref(event.target.value)}
        />
      </div>
      <ResponsiveDialogFooter>
        {target.existing ? (
          <Button
            type='button'
            variant='ghost'
            className='sm:me-auto'
            onClick={remove}
          >
            <Trans>Remove</Trans>
          </Button>
        ) : null}
        <Button type='button' variant='outline' onClick={onClose}>
          <Trans>Cancel</Trans>
        </Button>
        <Button type='submit' disabled={!url}>
          <Trans>Save</Trans>
        </Button>
      </ResponsiveDialogFooter>
    </form>
  )
}
