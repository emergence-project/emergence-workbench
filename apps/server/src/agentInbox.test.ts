import { describe, expect, it } from 'vitest'
import { Unread } from './agentInbox.js'

describe('읽히지 않은 지시 (Unread)', () => {
  it('답이 읽었다고 알린 지시는 지우고, 남은 것을 넘긴 차례대로 돌려준다', () => {
    const u = new Unread<string>()
    u.add('첫 지시', 'a')
    u.add('일하는 중에 보낸 것', 'b')
    u.add('또 보낸 것', 'c')
    u.read(['a'])
    expect(u.left()).toEqual(['일하는 중에 보낸 것', '또 보낸 것'])
    u.read(['a', 'b'])
    expect(u.left()).toEqual(['또 보낸 것'])
    u.clear()
    expect(u.left()).toEqual([])
  })

  it('답에 uuid를 붙이지 않는 옛 Claude Code면 아무것도 돌려주지 않는다 (두 번 보내지 않게)', () => {
    const u = new Unread<string>()
    u.add('지시', 'a')
    u.read([])
    expect(u.left()).toEqual([])
  })
})
