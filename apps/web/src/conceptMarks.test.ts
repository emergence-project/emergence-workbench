import { describe, expect, it } from 'vitest'
import { conceptRowMark } from './conceptMarks'

describe('concept row mark', () => {
  it('shows changed confirmation first and retains unfinished and locked details', () => {
    const mark = conceptRowMark({ checked: 'changed', unfinished: ['빈 절', 'TODO'], locked: true })
    expect(mark?.label).toBe('확인 뒤 고침')
    expect(mark?.title).toContain('미완성 — 빈 절 · TODO')
    expect(mark?.title).toContain('잠김')
  })

  it('keeps unfinished content separate from user confirmation', () => {
    const mark = conceptRowMark({ checked: 'ok', unfinished: ['빈 절'], locked: false })
    expect(mark?.label).toBe('미완성')
    expect(mark?.title).toContain('확인함')
    expect(mark?.checked).toBeUndefined()
  })

  it('shows one remaining mark or no mark when there is nothing to report', () => {
    expect(conceptRowMark({ checked: 'none', unfinished: [], locked: true })?.label).toBe('잠김')
    expect(conceptRowMark({ checked: 'ok', unfinished: [], locked: false })?.checked).toBe(true)
    expect(conceptRowMark({ checked: 'none', unfinished: [], locked: false })).toBeNull()
  })
})
