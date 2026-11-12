import { describe, expect, it } from 'vitest'
import { branchPoints, chartGeo, CW, layoutTree, RH, ROOT, ROOT_W, roundedPath, TOP, wrapName } from './problemChart'

const cells = (list: { id: string; parent?: string }[]) => Object.fromEntries([...layoutTree(list).at].map(([id, c]) => [id, `${c.c},${c.r}`]))

describe('layoutTree', () => {
  it('시도가 없으면 질문 한 줄', () => {
    expect(layoutTree([])).toMatchObject({ cols: 1, rows: 1 })
  })

  it('맏이는 부모의 줄을 이어 가고 형제는 아래 줄로 갈라진다', () => {
    // 질문 ─ A
    //     ├─ B ─ B1
    //     │    └─ B2
    //     └─ C
    const tree = [{ id: 'a' }, { id: 'b' }, { id: 'b1', parent: 'b' }, { id: 'b2', parent: 'b' }, { id: 'c' }]
    expect(cells(tree)).toEqual({ a: '1,0', b: '1,1', b1: '2,1', b2: '2,2', c: '1,3' })
    expect(layoutTree(tree)).toMatchObject({ cols: 3, rows: 4 })
  })

  it('한 가지가 깊어지면 칸만 늘고 줄은 하나', () => {
    const chain = [{ id: 'a' }, { id: 'a1', parent: 'a' }, { id: 'a11', parent: 'a1' }]
    expect(cells(chain)).toEqual({ a: '1,0', a1: '2,0', a11: '3,0' })
    expect(layoutTree(chain)).toMatchObject({ cols: 4, rows: 1 })
  })

  it('두 점이 같은 자리에 놓이지 않는다', () => {
    const tree = [{ id: 'a' }, { id: 'a1', parent: 'a' }, { id: 'a2', parent: 'a' }, { id: 'a21', parent: 'a2' }, { id: 'a22', parent: 'a2' }, { id: 'b' }, { id: 'b1', parent: 'b' }]
    const seen = Object.values(cells(tree))
    expect(new Set(seen).size).toBe(tree.length)
    expect(seen).not.toContain(`${ROOT.c},${ROOT.r}`)
  })

  it('부모가 목록에 없거나 서로를 가리켜도 모두 놓는다', () => {
    expect(cells([{ id: 'x', parent: 'gone' }])).toEqual({ x: '1,0' })
    const loop = layoutTree([{ id: 'p', parent: 'q' }, { id: 'q', parent: 'p' }])
    expect(loop.at.size).toBe(2)
  })
})

describe('chartGeo와 선', () => {
  const l = layoutTree([{ id: 'a' }, { id: 'b' }, { id: 'b1', parent: 'b' }])
  const g = chartGeo(l)

  it('질문 칸은 좁고 시도 칸은 같은 폭', () => {
    expect(g.X(0)).toBe(ROOT_W / 2)
    expect(g.X(2) - g.X(1)).toBe(CW)
    expect(g.Y(1) - g.Y(0)).toBe(RH)
    expect(g.width).toBe(ROOT_W + 2 * CW)
  })

  it('같은 줄은 곧은 선, 다른 줄은 자식 칸 앞에서 내려가는 선', () => {
    expect(branchPoints(ROOT, l.at.get('a')!, g)).toEqual([[g.X(0), TOP], [g.X(1), TOP]])
    const down = branchPoints(ROOT, l.at.get('b')!, g)
    expect(down).toHaveLength(4)
    expect(down[1]).toEqual([g.X(1) - CW / 2, TOP])
    expect(down[2]).toEqual([g.X(1) - CW / 2, TOP + RH])
  })

  it('꺾이는 곳을 둥글린다', () => {
    expect(roundedPath([[0, 0], [10, 0]])).toBe('M0 0L10 0')
    const d = roundedPath([[0, 0], [40, 0], [40, 90], [80, 90]], 12)
    expect(d.match(/Q/g)).toHaveLength(2)
    expect(d.startsWith('M0 0L28 0Q40 0 40 12')).toBe(true)
    expect(d.endsWith('L80 90')).toBe(true)
  })
})

describe('wrapName', () => {
  it('짧으면 한 줄', () => {
    expect(wrapName('사슬 바꾸기', 12)).toEqual(['사슬 바꾸기'])
  })

  it('낱말 사이에서 넘기고 넘치면 …로 줄인다', () => {
    const lines = wrapName('평면 그림에서 1–3 사슬과 v가 만드는 닫힌 곡선을 2–4 사슬은 건너지 못한다.', 12)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('평면 그림에서 1–3')
    expect(lines[1]!.endsWith('…')).toBe(true)
  })

  it('빈칸이 없는 긴 말은 글자에서 끊는다', () => {
    expect(wrapName('가나다라마바사아자차카타파하', 5)).toEqual(['가나다라마', '바사아자…'])
  })

  it('빈 글은 줄이 없다', () => {
    expect(wrapName('  ', 12)).toEqual([])
  })
})
