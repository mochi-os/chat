// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useEffect, useRef } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Button, cn } from '@mochi/web'
import { EditorContent } from '@tiptap/react'
import { Check } from 'lucide-react'
import { useMessageEditor } from '../editor/use-message-editor'
import { FormattingToolbar } from './formatting-toolbar'

interface InlineMessageEditorProps {
  value: string
  onValueChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
  isSent: boolean
  saveDisabled: boolean
  saving: boolean
}

/** The box a message turns into while its author edits it, in place. */
export function InlineMessageEditor({
  value,
  onValueChange,
  onSave,
  onCancel,
  isSent,
  saveDisabled,
  saving,
}: InlineMessageEditorProps) {
  const { t } = useLingui()
  const containerRef = useRef<HTMLDivElement>(null)
  const { editor } = useMessageEditor({
    value,
    onValueChange,
    onSubmit: onSave,
    onEscape: onCancel,
    ariaLabel: t`Edit`,
    // No @ autocomplete on edit until backend accepts mention ids.
    people: [],
    autoFocus: true,
    className: 'min-h-[40px] py-1',
  })

  // The editor is taller than the bubble it replaces, so it is scrolled
  // until its buttons show too.
  useEffect(() => {
    containerRef.current?.scrollIntoView({ block: 'nearest' })
  }, [])

  // As wide as a bubble can be (Bubble's max-w-[80%] in lib/web), so the
  // text wraps while editing as it does once sent. 500px suited a one-line
  // textarea, not lists and code blocks.
  return (
    <div
      ref={containerRef}
      className={cn(
        'border-border bg-card flex w-full max-w-[80%] flex-col gap-2 rounded-xl border p-3 shadow-sm',
        isSent ? 'ml-auto' : 'mr-auto'
      )}
    >
      <EditorContent editor={editor} />
      <div className='text-muted-foreground/60 mt-1 flex flex-wrap items-center justify-between gap-1 px-0.5 text-[10px]'>
        <FormattingToolbar editor={editor} className='-ms-1.5' />
        <div className='ms-auto flex items-center gap-2 text-xs'>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            onClick={onCancel}
            className='text-muted-foreground hover:text-foreground h-7 px-2.5'
          >
            <Trans>Cancel</Trans>
          </Button>
          <Button
            type='button'
            size='sm'
            disabled={saveDisabled}
            loading={saving}
            icon={<Check className='size-3' />}
            onClick={onSave}
            className='bg-primary hover:bg-primary/80 text-primary-foreground h-7 px-2.5 font-medium transition-colors'
          >
            <Trans>Save</Trans>
          </Button>
        </div>
      </div>
    </div>
  )
}
