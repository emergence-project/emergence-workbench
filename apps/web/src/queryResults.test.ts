import { describe, expect, it } from 'vitest'
import { resultsForQuery } from './queryResults'

describe('search query and selectable results', () => {
  it('hides old results before a new query effect or response runs', () => {
    expect(resultsForQuery({ query: 'Kempe', status: 'ready', items: ['Kempe note'] }, 'zz-no-hit', true)).toEqual({ query: 'zz-no-hit', status: 'pending', items: [] })
  })
  it('cannot select results from a late older query', () => {
    expect(resultsForQuery({ query: 'old', status: 'ready', items: ['late old note'] }, 'new', true).items).toEqual([])
  })
  it('distinguishes no hits from a failed or pending search', () => {
    for (const status of ['ready', 'error', 'pending'] as const) expect(resultsForQuery({ query: 'x', status, items: [] }, 'x', true).status).toBe(status)
  })
  it('clears results for an empty query or an unavailable library', () => {
    expect(resultsForQuery({ query: 'old', status: 'ready', items: ['note'] }, '', true).status).toBe('idle')
    expect(resultsForQuery({ query: 'old', status: 'ready', items: ['note'] }, 'old', false).items).toEqual([])
  })
})
