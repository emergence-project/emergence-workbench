import { describe, expect, it } from 'vitest'
import { canNarrow } from './flow/FlowChart'

describe('흐름 차트 좁히기 (11/2)', () => {
  it('더 낮은 단계에 알약이 들어갈 칸이 없으면 − 단추를 끈다', () => {
    // 이름을 켜면 가로 칸은 124px 이상: 160 × 0.8 = 128까지 내려가고 0.67(107px)은 안 된다
    expect(canNarrow(1, 160, 124)).toBe(true)
    expect(canNarrow(0.8, 160, 124)).toBe(false)
    // 세로 칸은 40px 이상: 76 × 0.67 = 51까지, 0.5(38px)는 안 된다
    expect(canNarrow(0.8, 76, 40)).toBe(true)
    expect(canNarrow(0.67, 76, 40)).toBe(false)
    // 이름을 끄면 가장 낮은 단계에서만 꺼진다
    expect(canNarrow(0.67, 160, 32)).toBe(true)
    expect(canNarrow(0.5, 160, 32)).toBe(false)
  })
})
