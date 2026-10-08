import { describe, expect, it } from 'vitest'
import { findSubject, subjectTree } from './knowledgeSubjects'
import { fieldOptions } from './fields'
import { matchesSubject, type SubjectCount } from './api/subjects'

describe('ID classification display and filters', () => {
  const counts: SubjectCount[] = [
    { subject: 'math', name: 'Mathematics', parent: null, count: 2, model: 'ids' },
    { subject: 'math/graph', name: 'Graph Theory', parent: 'math', count: 2, model: 'ids' },
    { subject: 'math/graph/coloring', name: 'Coloring', parent: 'math/graph', count: 1, model: 'ids' },
    { subject: '', name: '분류 없음', parent: null, count: 3, model: 'ids' },
  ]
  it('does not sum already aggregated counts or infer names from IDs', () => {
    const nodes = subjectTree(counts)
    expect(nodes[0]).toMatchObject({ name: 'Mathematics', count: 2 })
    expect(findSubject(nodes, 'math/graph/coloring')).toMatchObject({ name: 'Coloring', count: 1 })
    expect(nodes[1]).toMatchObject({ name: '분류 없음', count: 3 })
    expect(fieldOptions(counts)).toContainEqual({ name: 'Graph Theory', count: 2, path: 'Mathematics › Graph Theory' })
    expect(fieldOptions(counts).some((x) => x.name === '분류 없음')).toBe(false)
  })
  it('matches any subject and its descendants with a path boundary', () => {
    expect(matchesSubject(['cs/ml', 'math/graph/coloring'], 'math')).toBe(true)
    expect(matchesSubject(['math2'], 'math')).toBe(false)
    expect(matchesSubject([], '')).toBe(true)
    expect(matchesSubject(['math'], '')).toBe(false)
  })
  it('retains legacy aggregation and names when no ID rows exist', () => {
    const nodes = subjectTree([{ subject: 'Mathematics', count: 1 }, { subject: 'Mathematics › GT', count: 2 }])
    expect(nodes).toEqual([{ path: 'Mathematics', name: 'Mathematics', count: 3, kids: [{ path: 'Mathematics › GT', name: 'GT', count: 2, kids: [] }] }])
  })
})
