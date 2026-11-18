// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { linkTarget, normaliseUrl } from '../editor/link'
import { docToMarkdown, markdownToDoc } from '../editor/markdown'
import { LinkDialog } from './link-dialog'

const editors: Editor[] = []
function editorWith(markdown: string) {
  const editor = new Editor({
    extensions: [StarterKit.configure({ link: { openOnClick: false } })],
    content: markdownToDoc(markdown),
  })
  editors.push(editor)
  return editor
}
afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

function open(editor: Editor) {
  const onClose = vi.fn()
  render(
    <I18nProvider i18n={i18n}>
      <LinkDialog
        editor={editor}
        target={linkTarget(editor)}
        onClose={onClose}
      />
    </I18nProvider>
  )
  return onClose
}

describe('normaliseUrl', () => {
  it('takes any web or mail address, adding https to a bare domain', () => {
    expect(normaliseUrl('example.com/a')).toBe('https://example.com/a')
    expect(normaliseUrl(' http://a.b ')).toBe('http://a.b')
    expect(normaliseUrl('mailto:a@b.c')).toBe('mailto:a@b.c')
  })

  it('refuses what a message cannot open', () => {
    expect(normaliseUrl('javascript:alert(1)')).toBeNull()
    expect(normaliseUrl('')).toBeNull()
  })
})

describe('LinkDialog', () => {
  it('fills in the selected text and links it', () => {
    const editor = editorWith('see the docs here')
    editor.commands.setTextSelection({ from: 5, to: 13 })
    const onClose = open(editor)
    expect(
      screen.getByRole('heading', { name: 'Add link' })
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Text')).toHaveValue('the docs')
    expect(screen.getByLabelText('Link')).toHaveValue('')
    // No placeholder: any address will do.
    expect(screen.getByLabelText('Link')).not.toHaveAttribute('placeholder')

    fireEvent.change(screen.getByLabelText('Link'), {
      target: { value: 'example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(docToMarkdown(editor.getJSON())).toBe(
      'see [the docs](https://example.com) here'
    )
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps Save off for an address a message cannot open', () => {
    const editor = editorWith('x')
    open(editor)
    fireEvent.change(screen.getByLabelText('Link'), {
      target: { value: 'javascript:alert(1)' },
    })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('inserts the address as its own text when nothing is selected', () => {
    const editor = editorWith('go ')
    editor.commands.setTextSelection(4)
    open(editor)
    fireEvent.change(screen.getByLabelText('Link'), {
      target: { value: 'https://a.b' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(docToMarkdown(editor.getJSON())).toBe(
      'go [https://a.b](https://a.b)'
    )
  })

  it('edits a link under the caret, and can remove it', () => {
    const editor = editorWith('a [site](https://a.b) b')
    editor.commands.setTextSelection(5)
    open(editor)
    expect(
      screen.getByRole('heading', { name: 'Edit link' })
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Text')).toHaveValue('site')
    expect(screen.getByLabelText('Link')).toHaveValue('https://a.b')
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(docToMarkdown(editor.getJSON())).toBe('a site b')
  })
})
