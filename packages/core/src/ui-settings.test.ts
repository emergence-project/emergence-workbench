import { describe, expect, it } from 'vitest'
import { DEFAULT_UI, normalizeUi, UI_OPTIONS } from './ui-settings'

describe('highlight UI setting', () => {
  it('defaults older settings to yellow', () => {
    expect(normalizeUi({ theme: 'dark' })).toEqual({ ...DEFAULT_UI, theme: 'dark', highlightColor: 'yellow' })
  })

  it.each(UI_OPTIONS.highlightColor)('preserves the %s selection', (highlightColor) => {
    expect(normalizeUi({ highlightColor }).highlightColor).toBe(highlightColor)
  })

  it('rejects unknown colours and retains the base during partial updates', () => {
    expect(normalizeUi({ highlightColor: 'red' }).highlightColor).toBe('yellow')
    expect(normalizeUi({ density: 'compact' }, { ...DEFAULT_UI, highlightColor: 'pink' }).highlightColor).toBe('pink')
  })
})
