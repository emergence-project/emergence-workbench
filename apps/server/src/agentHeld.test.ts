import { describe, expect, it } from 'vitest'
import type { Stored } from './agentChats.js'
import { moveHeld } from './agentHeld.js'

// 11/20 사용자 "대기 대화의 우선순위 조정도 가능해": chat_priority
const central = (...titles: string[]) => ({ items: [], held: titles.map((title) => ({ title, text: title, kind: 'app' })) }) as unknown as Stored

describe('기다리는 앱 고치기 순서 (moveHeld)', () => {
  it('정확한 제목이나 하나만 맞는 일부로 찾아 맨 앞(기본) 또는 n번째로 옮기고 중앙에 한 줄 남긴다', () => {
    const c = central('일 하나', '일 둘', '셋째 고치기')
    expect(moveHeld(c, { title: '셋째', to: 1, reason: '사용자가 기다림' })).toEqual({ held: ['셋째 고치기', '일 하나', '일 둘'] })
    expect(c.items.at(-1)).toMatchObject({ kind: 'text', text: '자동: 순서 · 셋째 고치기 3번째 → 1번째 · 사용자가 기다림' })
    expect(moveHeld(c, { title: '일 하나', to: 9, reason: '나중에' }).held).toEqual(['셋째 고치기', '일 둘', '일 하나'])
    expect(c.items).toHaveLength(2)
  })
  it('여럿 맞거나 없거나 기다리는 일이 없으면 거절하고 줄은 그대로', () => {
    const c = central('일 하나', '일 둘')
    expect(() => moveHeld(c, { title: '일', to: 1, reason: 'x' })).toThrow('여럿')
    expect(() => moveHeld(c, { title: '없는 일', to: 1, reason: 'x' })).toThrow('없습니다')
    expect(() => moveHeld(central(), { title: '일', to: 1, reason: 'x' })).toThrow('기다리는 앱 고치기가 없습니다')
    expect(() => moveHeld(undefined, { title: '일', to: 1, reason: 'x' })).toThrow('기다리는 앱 고치기가 없습니다')
    expect(c.held!.map((h) => h.title)).toEqual(['일 하나', '일 둘'])
    expect(c.items).toEqual([])
  })
})
