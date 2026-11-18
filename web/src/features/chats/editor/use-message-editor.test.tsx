// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { act, render } from '@testing-library/react'
import type { Editor } from '@tiptap/core'
import { EditorContent } from '@tiptap/react'
import { describe, expect, it, vi } from 'vitest'
import {
  useMessageEditor,
  type MessageEditorOptions,
} from './use-message-editor'

let current: Editor | null = null

function Harness(props: Omit<MessageEditorOptions, 'ariaLabel'>) {
  const { editor } = useMessageEditor({ ...props, ariaLabel: 'Message' })
  current = editor
  return <EditorContent editor={editor} />
}

function setup(value = '') {
  const onValueChange = vi.fn()
  const onSubmit = vi.fn()
  const onEscape = vi.fn()
  const props = { value, onValueChange, onSubmit, onEscape }
  const view = render(<Harness {...props} />)
  const editor = current!
  const key = (init: KeyboardEventInit) =>
    act(() => {
      editor.view.dom.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          ...init,
        })
      )
    })
  return { ...props, view, editor, key, props }
}

describe('useMessageEditor', () => {
  it('sends on Enter without adding a line', () => {
    const { editor, key, onSubmit } = setup('hello')
    editor.commands.focus('end')
    key({ key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(editor.getJSON().content).toHaveLength(1)
  })

  it('cancels on Escape', () => {
    const { editor, key, onEscape } = setup('hello')
    editor.commands.focus('end')
    key({ key: 'Escape' })
    expect(onEscape).toHaveBeenCalledTimes(1)
  })

  it('adds a list item on Shift+Enter', () => {
    const { editor, key, onValueChange } = setup('- one')
    editor.commands.focus('end')
    key({ key: 'Enter', shiftKey: true })
    act(() => {
      editor.commands.insertContent('two')
    })
    expect(onValueChange).toHaveBeenLastCalledWith('- one\n- two')
  })

  it('reports formatting as Markdown', () => {
    const { editor, onValueChange } = setup('make bold')
    act(() => {
      editor.chain().setTextSelection({ from: 6, to: 10 }).toggleBold().run()
    })
    expect(onValueChange).toHaveBeenLastCalledWith('make **bold**')
  })

  it('takes Slack’s strikethrough key', () => {
    const { editor, key, onValueChange } = setup('gone')
    editor.chain().focus().selectAll().run()
    key({ key: 'x', ctrlKey: true, shiftKey: true, metaKey: false })
    key({ key: 'x', metaKey: true, shiftKey: true })
    // One of the two is Mod on this platform; the other does nothing.
    expect(onValueChange).toHaveBeenLastCalledWith('~~gone~~')
  })

  it('replaces the content when the value changes from outside', () => {
    const { view, props, editor, onValueChange } = setup('draft')
    view.rerender(<Harness {...props} value='' />)
    expect(editor.isEmpty).toBe(true)
    view.rerender(<Harness {...props} value='**restored**' />)
    expect(editor.getJSON().content?.[0].content?.[0].marks).toEqual([
      { type: 'bold' },
    ])
    expect(onValueChange).not.toHaveBeenCalled()
  })
})
