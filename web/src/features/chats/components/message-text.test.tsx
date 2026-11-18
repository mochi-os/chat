// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MessageText } from './message-text'

describe('MessageText', () => {
  it('draws a mention inside bold text as a pill', () => {
    const { container } = render(
      <MessageText body='**hi @[Ann Lee]**' isSent={false} />
    )
    const pill = container.querySelector('strong span')
    expect(pill?.textContent).toBe('@Ann Lee')
    expect(container.textContent).toBe('hi @Ann Lee')
  })

  it('keeps a mention token as text inside code', () => {
    const { container } = render(<MessageText body='`@[Ann]`' isSent={false} />)
    expect(container.querySelector('code')?.textContent).toBe('@[Ann]')
    expect(container.querySelector('code span')).toBeNull()
  })

  it('highlights a search hit inside formatting', () => {
    const { container } = render(
      <MessageText
        body='see _the plan_ and `plan.md`'
        isSent
        highlight={{ query: 'plan', active: true }}
      />
    )
    expect(container.querySelector('em span')?.textContent).toBe('plan')
    expect(container.querySelector('code span')?.textContent).toBe('plan')
  })

  it('leaves plain text as it was', () => {
    const { container } = render(
      <MessageText body={'snake_case_name\n2*3*4'} isSent={false} />
    )
    expect(container.textContent).toBe('snake_case_name\n2*3*4')
    expect(container.querySelector('em, strong')).toBeNull()
  })
})
