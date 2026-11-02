import { describe, expect, it } from 'vitest'
import { memoProject, memoProjects } from './phone/PhoneMemo'

const p = (id: string, state = 'active', available = true) => ({ id, state, available })

describe('폰 ＋ 메모의 프로젝트 (10/31 폰 시안 ①)', () => {
  const list = [p('a'), p('b', 'done'), p('c', 'active', false)]
  it('끝난 프로젝트와 없는 폴더는 고르는 목록에서 뺀다', () => {
    expect(memoProjects(list).map((r) => r.id)).toEqual(['a'])
  })
  it('끝난 프로젝트를 보다가 열면 그 프로젝트가 골라져 있다 (전에는 칸이 비고 저장이 꺼짐)', () => {
    const projects = memoProjects(list, 'b')
    expect(projects.map((r) => r.id)).toEqual(['a', 'b'])
    expect(memoProject(projects, 'b')).toBe('b')
  })
  it('고른 프로젝트가 목록에 없으면 첫 프로젝트', () => {
    expect(memoProject(memoProjects(list, 'c'), 'c')).toBe('a')
    expect(memoProject(memoProjects(list), undefined)).toBe('a')
    expect(memoProject([], 'a')).toBeUndefined()
  })
})
