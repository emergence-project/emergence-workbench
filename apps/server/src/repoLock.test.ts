import { describe, expect, it } from 'vitest'
import { withRepoLock } from './repoLock.js'

describe('저장소 잠금', () => {
  it('같은 저장소의 git 작업은 차례로, 앞 작업이 실패해도 다음 작업은 돈다', async () => {
    const order: string[] = []
    const step = (name: string, ms: number, fail = false) => async () => {
      order.push(`${name} 시작`)
      await new Promise((r) => setTimeout(r, ms))
      order.push(`${name} 끝`)
      if (fail) throw new Error(name)
      return name
    }
    const a = withRepoLock('/no/such/repo', step('올리기', 30, true))
    const b = withRepoLock('/no/such/repo', step('업데이트', 5))
    const other = withRepoLock('/other/repo', step('다른 저장소', 1))
    await expect(a).rejects.toThrow('올리기')
    expect(await b).toBe('업데이트')
    await other
    expect(order.indexOf('업데이트 시작')).toBeGreaterThan(order.indexOf('올리기 끝'))
    expect(order.indexOf('다른 저장소 시작')).toBeLessThan(order.indexOf('올리기 끝'))
  })
})
