import { describe, expect, it } from 'vitest'
import { fieldIndex, fieldOptions, matchFields } from './fields'

describe('연구 분야 목록 (개념노트 분류에서)', () => {
  it('분류의 단계마다 분야 하나, 번호와 빈 단계는 뺀다, 같은 이름은 하나로', () => {
    const f = fieldOptions([
      { subject: 'Mathematics › Graphs › Coloring › Map Coloring', count: 3 },
      { subject: 'Mathematics > Graphs > 01_Planarity', count: 2 },
      { subject: 'Computer Science >  > Deep learning', count: 1 },
      { subject: '', count: 5 },
    ])
    expect(f.map((x) => x.name)).toEqual(['Computer Science', 'Deep learning', 'Mathematics', 'Graphs', 'Coloring', 'Map Coloring', 'Planarity'])
    expect(f.find((x) => x.name === 'Graphs')).toMatchObject({ path: 'Mathematics › Graphs', count: 5 })
  })

  const opts = fieldOptions([
    { subject: 'Mathematics › Graphs › Map Coloring', count: 3 },
    { subject: 'Mathematics › Combinatorics', count: 5 },
    { subject: 'Analysis › Operator Algebras', count: 1 },
  ])

  it('분야 찾기: 빈 칸이면 자주 쓴 것 몇 개, 적으면 글자가 든 것만 (이름이 그 글자로 시작하는 것 먼저)', () => {
    expect(matchFields('', opts, new Map([['map coloring', 2]]), 2).map((f) => f.name)).toEqual(['Map Coloring', 'Mathematics'])
    expect(matchFields('map c', opts).map((f) => f.name)).toEqual(['Map Coloring'])
    expect(matchFields('o', opts).map((f) => f.name)[0]).toBe('Operator Algebras')
    expect(matchFields('xyz', opts)).toEqual([])
  })

  it('분야 차례: 맨 위 단계로 모으고, 목록에 없는 이름표는 끝에', () => {
    const rows = fieldIndex(new Map([['Map Coloring', 3], ['Matroids', 1], ['Combinatorics', 2], ['Operator Algebras', 1]]), opts)
    expect(rows).toEqual([
      { root: 'Analysis', fields: [{ name: 'Operator Algebras', rest: 'Operator Algebras', count: 1 }] },
      { root: 'Mathematics', fields: [{ name: 'Combinatorics', rest: 'Combinatorics', count: 2 }, { name: 'Map Coloring', rest: 'Graphs › Map Coloring', count: 3 }] },
      { root: '', fields: [{ name: 'Matroids', rest: '', count: 1 }] },
    ])
  })
})
