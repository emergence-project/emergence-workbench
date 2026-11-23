// 크리티컬한 허락 (11/23): 낱말 token · cost만으로는 돈 · 계정이 아니고, 비밀이 든 곳 읽기는 계정 일이다
import { describe, expect, it } from 'vitest'
import { commandCritical } from './critical.js'
import { criticalOf, type Ask } from './agentKid.js'

const ask = (tool: string, summary: string, does?: Ask['does']): Ask => ({ kind: 'ask', id: 'a', at: '', tool, summary, ...(does && { does }) }) as Ask
const kid = { rid: '_app' }

describe('크리티컬', () => {
  it('웹 검색의 낱말로 크리티컬하게 보지 않는다', () => {
    expect(criticalOf(ask('WebSearch', 'WebSearch · Claude vision image token cost', 'web'), kid)).toBeUndefined()
    expect(criticalOf(ask('Bash', 'echo token count'), kid)).toBeUndefined()
  })
  it('비밀이 든 곳 · 계정 낱말은 돈 · 계정', () => {
    expect(criticalOf(ask('Read', '비밀이 든 곳 읽기: /Users/x/.ssh/config'), kid)?.key).toBe('money')
    expect(criticalOf(ask('Bash', 'export GH_TOKEN=x'), kid)?.key).toBe('money')
  })
  it('명령: 따옴표 안 글은 보지 않고, 다시 시작 · 계정 · 내보내기를 잡는다', () => {
    expect(commandCritical('grep -rn "restart" src')).toBeUndefined()
    expect(commandCritical('brew services restart x')?.key).toBe('restart')
    expect(commandCritical('gh auth token')?.key).toBe('money')
    expect(commandCritical('scp a host:b')?.key).toBe('outside')
    expect(commandCritical('pnpm test')).toBeUndefined()
  })
})
