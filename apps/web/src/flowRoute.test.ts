import { describe, expect, it } from 'vitest'
import { planRoute, roundedPath, routePoints } from './flowRoute'

const busyOf = (cells: [number, number][]) => { const s = new Set(cells.map(([c, r]) => `${c}:${r}`)); return (c: number, r: number) => s.has(`${c}:${r}`) }
const g = { X: (c: number) => 100 * c + 50, Y: (r: number) => 60 * r + 40, CW: 100, RH: 60 }

describe('흐름 선 길', () => {
  it('같은 줄에 사이 점이 없으면 곧게, 있으면 위 통로로', () => {
    expect(planRoute({ c: 0, r: 1 }, { c: 3, r: 1 }, busyOf([]))).toEqual({ kind: 'straight' })
    expect(planRoute({ c: 0, r: 1 }, { c: 3, r: 1 }, busyOf([[1, 1]]))).toEqual({ kind: 'channel', ch: 1 })
  })
  it('받는 점의 줄이 비면 첫 칸에서 꺾고, 내 줄이 비면 마지막 칸에서 꺾고, 둘 다 막히면 통로로', () => {
    expect(planRoute({ c: 0, r: 0 }, { c: 3, r: 1 }, busyOf([[1, 0]]))).toEqual({ kind: 'first' })
    expect(planRoute({ c: 0, r: 0 }, { c: 3, r: 1 }, busyOf([[1, 1], [2, 1]]))).toEqual({ kind: 'last' })
    expect(planRoute({ c: 0, r: 0 }, { c: 3, r: 1 }, busyOf([[1, 1], [2, 0]]))).toEqual({ kind: 'channel', ch: 1 })
    expect(planRoute({ c: 0, r: 2 }, { c: 3, r: 1 }, busyOf([[1, 1], [2, 2]]))).toEqual({ kind: 'channel', ch: 2 })
  })
  it('바로 옆 칸은 막힘을 보지 않고 그 사이에서 꺾는다', () => {
    expect(planRoute({ c: 0, r: 0 }, { c: 1, r: 2 }, busyOf([[1, 1]]))).toEqual({ kind: 'first' })
  })
  it('사선은 45°이고 점 둘레 20px을 비운다', () => {
    const pts = routePoints({ c: 0, r: 0 }, { c: 1, r: 1 }, { kind: 'first' }, g)
    expect(pts).toEqual([[50, 40], [70, 40], [130, 100], [150, 100]])
    const [, a, b] = pts
    expect(Math.abs(b![0] - a![0])).toBe(Math.abs(b![1] - a![1]))
    expect(a![0]).toBeGreaterThanOrEqual(50 + 20)
    expect(b![0]).toBeLessThanOrEqual(150 - 20)
  })
  it('통로 선은 두 줄의 한가운데를 지난다', () => {
    const pts = routePoints({ c: 0, r: 0 }, { c: 3, r: 1 }, { kind: 'channel', ch: 1 }, g)
    expect(pts.filter(([, y]) => y === 70)).toHaveLength(2)
  })
  it('꺾이는 곳만 둥글게, 두 점이면 곧은 선', () => {
    expect(roundedPath([[0, 0], [10, 0]])).toBe('M0 0L10 0')
    expect(roundedPath([[0, 0], [20, 0], [40, 20]])).toMatch(/^M0 0L12 0Q20 0 /)
  })
})
