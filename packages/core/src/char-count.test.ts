import { describe, expect, it } from 'vitest'
import { charCount } from './index.js'

describe('charCount', () => {
  it('글자를 세고 줄바꿈은 세지 않는다', () => {
    expect(charCount('가나 다')).toBe(4)
    expect(charCount('a\nb')).toBe(2)
  })
  it('수식은 보이는 글자만: 명령은 한 글자, 중괄호 · ^ · _ · 빈칸 · $는 세지 않는다', () => {
    expect(charCount('CMI $I(A:C|B)$')).toBe(4 + 8)
    expect(charCount('$\\frac{\\pi}{3} c_-$')).toBe(5)
    expect(charCount('$\\alpha\\beta$')).toBe(2)
  })
  it('짝이 없는 $는 그대로 센다', () => {
    expect(charCount('$5 쿠폰')).toBe(5)
  })
})
