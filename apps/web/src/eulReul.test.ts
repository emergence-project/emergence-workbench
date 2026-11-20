import { describe, expect, it } from 'vitest'
import { eulReul } from './i18n'

describe('eulReul: 이름 뒤 목적격 조사', () => {
  it('한글은 받침이 있으면 을, 없으면 를', () => {
    expect(eulReul('5색 정리')).toBe('를')
    expect(eulReul('Kempe 사슬')).toBe('을')
    expect(eulReul('예제 노트')).toBe('를')
  })
  it('숫자는 읽는 소리로', () => {
    expect(eulReul('노트 3')).toBe('을')
    expect(eulReul('노트 2')).toBe('를')
    expect(eulReul('2026')).toBe('을')
  })
  it('로마자는 l · m · n · ng으로 끝나면 을, 그 밖은 를', () => {
    expect(eulReul('Theorem')).toBe('을')
    expect(eulReul('Planar graph')).toBe('를')
    expect(eulReul('Coloring')).toBe('을')
  })
  it('끝의 따옴표 · 괄호 · 빈칸은 건너뛴다', () => {
    expect(eulReul('정리 (초안) ')).toBe('을')
  })
})
